/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { validationErrorJson } from '@/lib/friendlyValidation'
import { authenticateProfileRequest, unauthorizedResponse } from '@/lib/supabase/auth'
import { chatWithDeepSeek, isDeepSeekConfigured } from '@/lib/deepseek/client'
import { resolveTenantAiConfig, toDeepSeekTenant } from '@/lib/tenantAi'
import { sanitizeIntakeDraft, draftCoverage, type IntakeDraft } from '@/lib/listingIntakeCore'

export const runtime = 'nodejs'
export const maxDuration = 40

// =============================================================================
// POST /api/listings/intake — AI intake: paste notes / email / voicemail
// transcript / P&L summary → structured listing draft (pre-fills the studio).
// Server-only; DeepSeek key never reaches the browser.
// Body: { notes: string, mode?: 'full' | 'public' }
//   full   → extract every known field (default)
//   public → draft ONLY the anonymized buyer-facing fields from private info
// =============================================================================

const intakeSchema = z.object({
  notes: z.string().max(8000).optional(), // legacy field name — still accepted
  mode: z.enum(['full', 'public']).optional().default('full'),
  context: z.string().max(4000).optional(), // the studio sends the pasted text here
})

const SYSTEM_FULL = `You are the intake engine for a confidential business brokerage. A broker pastes raw notes about a business (from calls, emails, voicemail transcripts, intake forms, or P&L summaries). Extract a structured listing draft as JSON.

Rules:
- Only include fields you are confident about. Omit anything unknown — do NOT invent numbers.
- business_name = the operating/legal business name (may be blank if the broker anonymized it).
- industry/sub_industry = the sector and niche (e.g. "Home Care" / "Home Health Aide Services").
- location_general = the general market area (region/state), NEVER the exact street address.
- Numbers (asking_price, annual_revenue, sde, ebitda, etc.) = plain numbers, no $ or commas.
- Employees, years, weeks, square feet = plain numbers.
- booleans (real_estate_included, ffe_included, inventory_included, asset_sale, seller_financing_available) = true/false only when stated.
- description = a complete confidential summary of the business.
- reason_for_sale, growth_opportunities, competitive_advantages, customer_concentration, facilities_summary, transition_support = from the notes; concise.
- public_title / public_summary / public_highlights = ONLY if the notes contain seller-approved anonymous copy; otherwise leave blank — do not invent public copy.
- seller_approval_reference = any agreement/envelope reference mentioned.
- video_url = only if a real URL is in the notes.

Respond with a single JSON object. Use snake_case keys exactly: business_name, headline, industry, sub_industry, location_general, description, asking_price, annual_revenue, sde, ebitda, inventory_value, ffe_value, established_year, employees_full_time, employees_part_time, owner_hours_weekly, reason_for_sale, growth_opportunities, competitive_advantages, customer_concentration, facilities_summary, lease_monthly, lease_expires_on, lease_square_feet, real_estate_included, ffe_included, inventory_included, goodwill_included, asset_sale, property_address, property_city, square_footage, land_acres, year_built, property_value, property_description, seller_financing_available, financing_notes, transition_support, training_period_weeks, public_title, public_summary, public_highlights, video_url, seller_approval_reference.`

const SYSTEM_PUBLIC = `You are a sell-side marketing writer. Given a business's PRIVATE record (description, industry, location, financials), draft the seller-approved ANONYMOUS public preview as JSON.

Rules:
- NEVER include: legal/operating business name, exact street address, phone, email, customer names, owner identity.
- public_title: short, attractive, anonymous headline (e.g. "Recurring-Revenue Home Care Agency in Central PA"), max ~70 chars.
- public_summary: 2-4 sentence buyer-facing summary using industry, region, and opportunity hooks. No dollar figures unless show_financials is true.
- public_highlights: 3-5 one-line bullet highlights (an array of strings).
- show_financials: true ONLY if the record explicitly authorizes public financials.
Respond with a single JSON object with keys: public_title, public_summary, public_highlights (array), show_financials.`

export async function POST(req: NextRequest) {
  if (!isDeepSeekConfigured()) {
    return NextResponse.json({ ok: false, error: 'AI intake is unavailable right now (not configured). No problem — you can still fill the form below manually and the listing saves fine.' }, { status: 503 })
  }

  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'Server client not configured.' }, { status: 500 })

  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body.' }, { status: 400 })
  }
  const parsed = intakeSchema.safeParse(body)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    // Concierge-specific guidance: tell the broker WHAT to add and WHAT to tap.
    const friendly =
      issue?.code === 'too_big'
        ? 'That input is too long (max 8000 characters). Shorten it to the key facts, then tap Build my listing.'
        : validationErrorJson(parsed.error).error
    return NextResponse.json({ ok: false, error: friendly, detail: issue?.message }, { status: 422 })
  }
  const { notes, mode, context } = parsed.data
  // The studio posts the pasted text as `context`; older clients used `notes`.
  const rawNotes = (notes || context || '').trim()
  if (rawNotes.length < 20) {
    return NextResponse.json(
      { ok: false, error: '✍️ Add more detail — I need at least 20 characters to build the record. Include industry, location, revenue, and asking price (example: "HVAC company in Harrisburg, $950k revenue, asking $720k"), then tap Build my listing.', detail: 'too_small' },
      { status: 422 },
    )
  }

  // Per-tenant AI credentials (sold CRMs bring their own key).
  let tenant = null
  try {
    const { getAgencyContext } = await import('@/lib/agencyContext')
    const ctx = await getAgencyContext()
    tenant = toDeepSeekTenant(await resolveTenantAiConfig(ctx?.userId))
  } catch { /* best-effort */ }

  const isPublic = mode === 'public'
  const userMessage = isPublic
    ? `PRIVATE RECORD:\n${context || ''}\n\nDraft the anonymous public preview.`
    : `BROKER NOTES:\n${rawNotes}`

  try {
    const result = await chatWithDeepSeek({
      system: isPublic ? SYSTEM_PUBLIC : SYSTEM_FULL,
      userMessage,
      jsonMode: true,
      maxTokens: isPublic ? 800 : 1600,
      tenant,
    })

    const raw = (result.data || (() => {
      try { return JSON.parse(result.text) } catch { return null }
    })()) as Record<string, unknown> | null

    if (!raw || typeof raw !== 'object') {
      return NextResponse.json({ ok: false, error: 'AI returned no structured data. Try more detailed notes.' }, { status: 502 })
    }

    if (isPublic) {
      // Public mode: only the anonymized buyer-facing fields pass through.
      const draft: IntakeDraft = {}
      if (typeof raw.public_title === 'string' && raw.public_title.trim()) draft.public_title = raw.public_title.trim()
      if (typeof raw.public_summary === 'string' && raw.public_summary.trim()) draft.public_summary = raw.public_summary.trim()
      if (Array.isArray(raw.public_highlights)) {
        const lines = (raw.public_highlights as unknown[]).filter((h): h is string => typeof h === 'string' && h.trim().length > 0).map((h) => h.trim())
        if (lines.length) draft.public_highlights = lines.join('\n')
      }
      if (typeof raw.show_financials === 'boolean') draft.show_financials = raw.show_financials
      return NextResponse.json({ ok: true, mode: 'public', draft, coverage: draftCoverage(draft) })
    }

    const draft = sanitizeIntakeDraft(raw)
    return NextResponse.json({ ok: true, mode: 'full', draft, coverage: draftCoverage(draft) })
  } catch (err) {
    console.error('[listings/intake] failed:', (err as Error)?.message)
    return NextResponse.json({ ok: false, error: 'AI intake is busy right now (out of credits or service hiccup). No problem — you can still fill the form below manually and the listing saves fine.' }, { status: 502 })
  }
}

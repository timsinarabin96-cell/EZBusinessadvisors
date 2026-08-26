/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { isPlatformAdmin } from '@/lib/platform'
import { syncProviderCosts } from '@/lib/providerCosts'
import { chatWithDeepSeek } from '@/lib/deepseek/client'

export const runtime = 'nodejs'

// =============================================================================
// POST /api/admin/expenses/sync — AI-automated cost capture.
//   1) Pulls real usage costs from connected providers (Twilio, DeepSeek,
//      Anthropic, Supabase, Vercel).
//   2) AI-categorizes any new provider line + recorded expenses missing a
//      category, so the books stay clean with zero manual work.
//   3) Skips duplicates (same vendor + description + amount + date).
// =============================================================================

const CATEGORIES = ['ai_api', 'hosting', 'domain', 'sms_phone', 'email', 'tools', 'marketing', 'subscriptions', 'other']

async function aiCategorize(vendor: string, description: string): Promise<string> {
  try {
    const res = await chatWithDeepSeek({
      system:
        'You are a meticulous accountant. Classify this business expense into exactly one category. ' +
        `Allowed categories: ${CATEGORIES.join(', ')}. ` +
        'Rules: OpenAI/DeepSeek/Anthropic/Claude/Gemini API usage = ai_api; Vercel/Netlify/Render/AWS/Cloudflare/Railway = hosting; ' +
        'Namecheap/GoDaddy/Cloudflare Domains/registrar renewals = domain; Twilio/Vonage/phone/SMS = sms_phone; ' +
        'SendGrid/Postmark/Resend/email = email; Figma/Notion/Zapier/Linear/GitHub = tools; Meta/Google Ads/SEO = marketing; ' +
        'Stripe/SaaS subscriptions = subscriptions; otherwise other. Reply with ONLY the category word, nothing else.',
      userMessage: `Vendor: ${vendor}. Description: ${description}`,
      maxTokens: 10,
    })
    const cat = String(res.text || '').trim().toLowerCase()
    return CATEGORIES.includes(cat) ? cat : 'other'
  } catch {
    return 'other'
  }
}

export async function POST(req: NextRequest) {
  if (!(await isPlatformAdmin(req))) {
    return NextResponse.json({ ok: false, error: 'Platform admin access only' }, { status: 403 })
  }
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  const added: unknown[] = []
  const skipped: unknown[] = []

  // 1) Provider auto-sync.
  const costs = await syncProviderCosts()
  for (const c of costs) {
    // Duplicate check: same vendor + description + amount + date.
    const { data: existing } = await db
      .from('expenses')
      .select('id')
      .eq('vendor', c.vendor)
      .eq('description', c.description)
      .eq('amount_cents', c.amountCents)
      .eq('expense_date', c.expenseDate)
      .maybeSingle()
    if (existing) {
      skipped.push({ vendor: c.vendor, amountCents: c.amountCents, reason: 'duplicate' })
      continue
    }
    const category = await aiCategorize(c.vendor, c.description)
    const { data: row, error } = await db
      .from('expenses')
      .insert({
        category, vendor: c.vendor, description: c.description,
        amount_cents: c.amountCents, currency: c.currency,
        expense_date: c.expenseDate, recurring: false, paid: true,
        notes: 'Auto-synced from provider API',
      })
      .select()
      .single()
    if (error) {
      skipped.push({ vendor: c.vendor, error: error.message })
      continue
    }
    added.push(row)
  }

  // 2) Backfill categories for any entries that slipped through as 'other'.
  const { data: uncategorized } = await db
    .from('expenses')
    .select('id, vendor, description')
    .eq('category', 'other')
    .limit(25)
  for (const row of (uncategorized || [])) {
    const cat = await aiCategorize(row.vendor || 'unknown', row.description || '')
    if (cat !== 'other') {
      await db.from('expenses').update({ category: cat }).eq('id', row.id)
    }
  }

  return NextResponse.json({
    ok: true,
    added,
    skipped,
    summary: {
      added: added.length,
      skipped: skipped.length,
      providerLines: costs.length,
      backfilled: (uncategorized || []).length,
    },
  })
}

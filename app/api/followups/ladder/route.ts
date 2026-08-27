/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, canManageAgency, forbiddenResponse, unauthorizedResponse } from '@/lib/supabase/auth'
import { nextLadderStep, ESCALATION_LADDER } from '@/lib/buyerPipelineCore'
import { completeWithDeepSeek, isDeepSeekConfigured } from '@/lib/deepseek/client'

export const runtime = 'nodejs'

// =============================================================================
// /api/followups/ladder — no-reply escalation ladder + AI follow-up composer.
// -----------------------------------------------------------------------------
// GET  — silent leads with their due ladder step (day 1 / 3 / 7 / 14).
// POST — { kind, leadId, name?, phone?, stage? } → AI drafts a personalized
//        follow-up from the lead's record, returns it for broker approval.
//        (Sending stays a one-tap human decision — nothing auto-sends.)
// =============================================================================

const composeSchema = z.object({
  kind: z.enum(['buyer', 'seller']),
  leadId: z.string(),
  name: z.string().max(200).optional().nullable(),
  phone: z.string().max(40).optional().nullable(),
  stage: z.string().max(120).optional().nullable(),
  ladderDay: z.number().int().min(1).max(30).optional(),
})

export async function GET(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const agencyId = req.nextUrl.searchParams.get('agencyId') || auth.memberships[0]?.agency_id
  if (!agencyId) return NextResponse.json({ ok: false, error: 'No agency membership' }, { status: 403 })
  if (!canManageAgency(auth, agencyId)) return forbiddenResponse()

  const days = Math.max(1, Math.min(365, Number(req.nextUrl.searchParams.get('days')) || 7))

  // Silent leads (same core as the autopilot, re-imported to avoid cycles).
  const { findFollowUpLeads } = await import('@/lib/followups')
  const items = await findFollowUpLeads(agencyId, days)

  // Attach the due ladder step to each silent lead.
  const laddered = items.map((it) => {
    const step = nextLadderStep(it.days_since)
    return {
      ...it,
      ladderStep: step
        ? { day: step.day, channel: step.channel, label: step.label }
        : null,
      ladder: ESCALATION_LADDER,
    }
  })

  return NextResponse.json({ ok: true, days, items: laddered })
}

export async function POST(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  if (!isDeepSeekConfigured()) {
    return NextResponse.json({ ok: false, error: 'AI is not configured yet.' }, { status: 503 })
  }

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }) }
  const parsed = composeSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'Validation failed: kind + leadId required' }, { status: 422 })
  const { kind, leadId, name, phone, stage, ladderDay } = parsed.data

  const agencyId = String((body as any).agencyId || '') || auth.memberships[0]?.agency_id
  if (!agencyId) return NextResponse.json({ ok: false, error: 'No agency membership' }, { status: 403 })
  if (!canManageAgency(auth, agencyId)) return forbiddenResponse()

  // Pull last-contact context for a personalized draft.
  let lastContact: string | null = null
  const { data: comm } = await db
    .from('communications')
    .select('summary, created_at, channel')
    .eq('agency_id', agencyId)
    .eq(kind === 'buyer' ? 'buyer_lead_id' : 'seller_lead_id', leadId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (comm) lastContact = comm.summary || null

  const firstName = (name || 'there').split(' ')[0]
  const dayLabel = ladderDay ? `Day ${ladderDay} of the follow-up sequence` : 'follow-up'
  const stageLine = stage ? `The lead is at stage: ${stage}.` : ''

  const draft = await completeWithDeepSeek({
    context: { kind: 'lead', text: '' },
    system: `You write warm, human follow-up texts for a business brokerage. One short text message, under 50 words, no hard sell, natural broker voice, one clear question or call-to-action. Never mention prices, deals, or confidential info.`,
    message: `Write a ${dayLabel} follow-up text to ${firstName} (a potential ${kind}).
${stageLine}
${lastContact ? `Last interaction: "${lastContact}". Reference it lightly.` : 'No prior interaction logged — introduce the brokerage and ask what they are looking for.'}
Return ONLY the message text.`,
  })

  return NextResponse.json({ ok: true, draft: draft?.text?.trim?.() || null, contact: name || phone || null })
}

/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { authenticateProfileRequest, unauthorizedResponse, forbiddenResponse } from '@/lib/supabase/auth'
import { makeUnsubToken } from '@/lib/newspaperShared'

export const runtime = 'nodejs'

// =============================================================================
// POST /api/newsletter/subscribe-lead — mirrors a manually-added buyer's
// EXPLICIT weekly-newsletter consent into newspaper_subscriptions.
// -----------------------------------------------------------------------------
// This is the ONLY path that turns a buyer_leads.newsletter_opt_in checkbox
// into an actual subscription row. Never called automatically on lead
// create/import without the checkbox being explicitly checked by the broker
// on the buyer's behalf (per the buyer's stated consent).
//
// Multi-agency isolation: the caller must be an authenticated member of the
// lead's agency (any membership, not just admin — any broker adding a buyer
// in their own agency can toggle consent for that buyer). The resulting
// subscription row is scoped with agency_id = the lead's agency, so an
// opt-in recorded by Agency A can never cause Agency B's send loop (which
// also filters by agency where applicable) to include this buyer, and vice
// versa. If optIn=false, any existing agency-scoped subscription for this
// email is immediately deactivated (status='unsubscribed') — no residual
// send risk.
// =============================================================================

const SVC = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY || 'NO_KEY', {
      auth: { persistSession: false },
    })
  : null

export async function POST(req: NextRequest) {
  if (!SVC) return NextResponse.json({ ok: false, error: 'server not configured' }, { status: 503 })
  const authenticated = await authenticateProfileRequest(req)
  if (!authenticated) return unauthorizedResponse()

  const body = await req.json().catch(() => ({}))
  const leadId = String(body.leadId || '')
  const optIn = !!body.optIn
  if (!leadId) return NextResponse.json({ ok: false, error: 'missing leadId' }, { status: 400 })

  const { data: lead } = await SVC.from('buyer_leads').select('id, email, agency_id, contact_name, full_name').eq('id', leadId).maybeSingle()
  if (!lead) return NextResponse.json({ ok: false, error: 'buyer lead not found' }, { status: 404 })
  if (!lead.email) return NextResponse.json({ ok: false, error: 'buyer has no email on file — cannot subscribe' }, { status: 400 })

  // Caller must belong to the lead's own agency — never allow cross-agency
  // consent toggling.
  const isMember = authenticated.memberships.some((m) => m.agency_id === lead.agency_id)
  if (!isMember) return forbiddenResponse()

  // Persist the consent flag on the lead itself (source of truth).
  await SVC.from('buyer_leads').update({ newsletter_opt_in: optIn }).eq('id', leadId)

  const email = String(lead.email).trim().toLowerCase()
  const name = lead.contact_name || lead.full_name || null

  if (!optIn) {
    // No consent (or consent withdrawn) → make sure no active subscription
    // exists for this buyer scoped to this agency. Never send without opt-in.
    await SVC
      .from('newspaper_subscriptions')
      .update({ status: 'unsubscribed' })
      .eq('agency_id', lead.agency_id)
      .ilike('email', email)
      .eq('audience', 'buyer')
    return NextResponse.json({ ok: true, subscribed: false })
  }

  // Opt-in: create or reactivate the agency-scoped subscription.
  const { data: existing } = await SVC
    .from('newspaper_subscriptions')
    .select('id, token')
    .eq('agency_id', lead.agency_id)
    .ilike('email', email)
    .eq('audience', 'buyer')
    .maybeSingle()

  if (existing) {
    await SVC.from('newspaper_subscriptions').update({ status: 'active', name, token: existing.token || makeUnsubToken(email) }).eq('id', existing.id)
  } else {
    await SVC.from('newspaper_subscriptions').insert({
      email,
      name,
      status: 'active',
      audience: 'buyer',
      agency_id: lead.agency_id,
      token: makeUnsubToken(email),
      consent_source: 'manual_add',
    })
  }

  return NextResponse.json({ ok: true, subscribed: true })
}

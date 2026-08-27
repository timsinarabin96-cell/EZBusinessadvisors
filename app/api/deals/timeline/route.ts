/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, canManageAgency, forbiddenResponse, unauthorizedResponse } from '@/lib/supabase/auth'

export const runtime = 'nodejs'

// =============================================================================
// GET /api/deals/timeline?listingId=... — the unified deal timeline.
// -----------------------------------------------------------------------------
// Merges every touchpoint into one chronological stream:
//   · pipeline stage changes (buyer_pipeline_events)
//   · communications (calls / emails / texts / meetings)
//   · offers + LOI events
//   · data-room activity
//   · filed files (deal-files)
// Agency-scoped. The single source of truth for "what happened on this deal".
// =============================================================================

interface TimelineEvent {
  kind: string
  at: string
  title: string
  detail: string | null
}

export async function GET(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const listingId = req.nextUrl.searchParams.get('listingId')
  if (!listingId) return NextResponse.json({ ok: false, error: 'listingId query param is required' }, { status: 400 })

  const { data: listing } = await db.from('listings').select('agency_id, business_name').eq('id', listingId).maybeSingle()
  const agencyId = (listing as { agency_id?: string | null } | null)?.agency_id
  if (!agencyId) return NextResponse.json({ ok: false, error: 'Listing not found' }, { status: 404 })
  if (!canManageAgency(auth, agencyId)) return forbiddenResponse()

  const events: TimelineEvent[] = []

  // 1) Pipeline stage changes.
  const { data: pipelineEvents } = await db
    .from('buyer_pipeline_events')
    .select('from_stage, to_stage, note, created_at, buyer_lists(buyer_name)')
    .eq('listing_id', listingId)
    .eq('agency_id', agencyId)
    .order('created_at', { ascending: false })
    .limit(100)
  for (const e of (pipelineEvents || []) as any[]) {
    events.push({
      kind: 'pipeline',
      at: e.created_at,
      title: `${(e.buyer_lists?.buyer_name || 'Buyer')}: ${e.from_stage || 'new'} → ${e.to_stage}`,
      detail: e.note || null,
    })
  }

  // 2) Communications.
  const { data: comms } = await db
    .from('communications')
    .select('channel, direction, summary, contact_name, created_at')
    .eq('agency_id', agencyId)
    .eq('listing_id', listingId)
    .order('created_at', { ascending: false })
    .limit(100)
  for (const c of (comms || []) as any[]) {
    const channel = String(c.channel || 'other')
    const icon = channel === 'call' ? '📞' : channel === 'email' ? '📧' : channel === 'sms' ? '💬' : channel === 'meeting' ? '📅' : '💬'
    events.push({
      kind: 'communication',
      at: c.created_at,
      title: `${icon} ${String(c.direction || 'outbound')} ${channel}${c.contact_name ? ` · ${c.contact_name}` : ''}`,
      detail: c.summary || null,
    })
  }

  // 3) Offers.
  const { data: offers } = await db
    .from('deal_offers')
    .select('purchase_price, status, created_at, buyer_leads(full_name)')
    .eq('listing_id', listingId)
    .eq('agency_id', agencyId)
    .order('created_at', { ascending: false })
    .limit(50)
  for (const o of (offers || []) as any[]) {
    events.push({
      kind: 'offer',
      at: o.created_at,
      title: `🤝 Offer ${o.status || 'draft'}${o.purchase_price ? ` — $${Number(o.purchase_price).toLocaleString()}` : ''}`,
      detail: o.buyer_leads?.full_name ? `From ${o.buyer_leads.full_name}` : null,
    })
  }

  // 4) Data-room activity (view analytics) — best-effort.
  try {
    const { data: dr } = await db
      .from('data_room_activity')
      .select('action, detail, buyer_email, created_at')
      .eq('listing_id', listingId)
      .eq('agency_id', agencyId)
      .order('created_at', { ascending: false })
      .limit(50)
    for (const a of (dr || []) as any[]) {
      events.push({
        kind: 'data_room',
        at: a.created_at,
        title: `📁 ${String(a.action || 'viewed')}${a.buyer_email ? ` · ${a.buyer_email}` : ''}`,
        detail: a.detail || null,
      })
    }
  } catch { /* table may not exist */ }

  // 5) Filed files (deal-files / email-to-deal).
  try {
    const { data: files } = await db
      .from('financial_documents')
      .select('name, sender, subject, created_at')
      .eq('listing_id', listingId)
      .order('created_at', { ascending: false })
      .limit(50)
    for (const f of (files || []) as any[]) {
      events.push({
        kind: 'file',
        at: f.created_at,
        title: `📎 Filed: ${f.name || 'document'}`,
        detail: f.subject || (f.sender ? `From ${f.sender}` : null),
      })
    }
  } catch { /* table may not exist */ }

  // Merge + sort newest first.
  events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
  return NextResponse.json({ ok: true, events: events.slice(0, 120), businessName: (listing as any).business_name })
}

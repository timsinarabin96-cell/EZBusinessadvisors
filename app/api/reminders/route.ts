/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, canManageAgency, forbiddenResponse, unauthorizedResponse } from '@/lib/supabase/auth'
import {
  createReminder,
  listReminders,
  setReminderStatus,
  snoozeReminder,
  deleteReminder,
  reminderCounts,
  quickReminder,
  suggestNextCallTime,
  type ReminderStatus,
} from '@/lib/reminders'

export const runtime = 'nodejs'

/**
 * GET  /api/reminders?agencyId=...&status=&kind=&listingId=&buyerLeadId=&sellerLeadId=&dealId=&counts=1
 * POST /api/reminders { title, listing_id?|buyer_lead_id?|seller_lead_id?|deal_id?, kind?, due_at, notes? }
 *       | { quick: { listingId?|buyerLeadId?|sellerLeadId?|dealId? } } — entity-agnostic quick reminder
 * PATCH /api/reminders { reminderId, status: 'done'|'pending'|'cancelled' }
 * DELETE /api/reminders { reminderId }
 */
export async function GET(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const agencyId = req.nextUrl.searchParams.get('agencyId') || auth.memberships[0]?.agency_id
  if (!agencyId) return NextResponse.json({ ok: false, error: 'No agency membership' }, { status: 403 })
  if (!canManageAgency(auth, agencyId)) return forbiddenResponse()

  if (req.nextUrl.searchParams.get('counts') === '1') {
    const counts = await reminderCounts(agencyId)
    return NextResponse.json({ ok: true, counts, suggestedNext: suggestNextCallTime() })
  }

  // Entity picker options for the reminder form.
  if (req.nextUrl.searchParams.get('options') === '1') {
    const [listingsRes, buyersRes, sellersRes, dealsRes] = await Promise.all([
      db.from('listings').select('id, business_name, listing_ref').eq('agency_id', agencyId).in('status', ['approved', 'active', 'pending', 'draft']).order('business_name', { ascending: true }).limit(200),
      db.from('buyer_leads').select('id, full_name, company').eq('agency_id', agencyId).order('created_at', { ascending: false }).limit(200),
      db.from('seller_leads').select('id, full_name, business_name').eq('agency_id', agencyId).order('created_at', { ascending: false }).limit(200),
      db.from('deals').select('id, title, purchase_price').eq('agency_id', agencyId).order('created_at', { ascending: false }).limit(200),
    ])
    return NextResponse.json({
      ok: true,
      listings: (listingsRes.data || []).map((l: any) => ({ id: l.id, label: `${l.business_name || 'Listing'}${l.listing_ref ? ` (${l.listing_ref})` : ''}` })),
      buyers: (buyersRes.data || []).map((l: any) => ({ id: l.id, label: l.full_name || l.company || 'Buyer' })),
      sellers: (sellersRes.data || []).map((l: any) => ({ id: l.id, label: l.business_name || l.full_name || 'Seller' })),
      deals: (dealsRes.data || []).map((l: any) => ({ id: l.id, label: l.title || 'Deal' })),
    })
  }

  const reminders = await listReminders(agencyId, {
    status: req.nextUrl.searchParams.get('status') || 'pending',
    kind: req.nextUrl.searchParams.get('kind') || undefined,
    listingId: req.nextUrl.searchParams.get('listingId') || undefined,
    buyerLeadId: req.nextUrl.searchParams.get('buyerLeadId') || undefined,
    sellerLeadId: req.nextUrl.searchParams.get('sellerLeadId') || undefined,
    dealId: req.nextUrl.searchParams.get('dealId') || undefined,
  })
  return NextResponse.json({ ok: true, reminders })
}

export async function POST(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const body = await req.json().catch(() => ({}))
  const agencyId = body.agencyId || auth.memberships[0]?.agency_id
  if (!agencyId) return NextResponse.json({ ok: false, error: 'No agency membership' }, { status: 403 })

  // Entity-agnostic quick reminder (listing / buyer / seller / deal / none).
  if (body.quick && typeof body.quick === 'object') {
    const result = await quickReminder(agencyId, {
      profileId: body.assignToMe ? auth.user.id : null,
      listingId: body.quick.listingId || null,
      buyerLeadId: body.quick.buyerLeadId || null,
      sellerLeadId: body.quick.sellerLeadId || null,
      dealId: body.quick.dealId || null,
      title: body.title || undefined,
      notes: body.notes || null,
      kind: body.kind || 'call_back',
      dueAt: body.due_at || undefined,
    })
    if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 500 })
    return NextResponse.json({ ok: true, reminder: result.reminder })
  }

  if (!body.title || !body.due_at) {
    return NextResponse.json({ ok: false, error: 'title and due_at are required' }, { status: 400 })
  }
  const result = await createReminder({
    agency_id: agencyId,
    profile_id: body.assignToMe ? auth.user.id : null,
    listing_id: body.listing_id || null,
    buyer_lead_id: body.buyer_lead_id || null,
    seller_lead_id: body.seller_lead_id || null,
    deal_id: body.deal_id || null,
    title: body.title,
    notes: body.notes || null,
    kind: body.kind || 'call_back',
    due_at: body.due_at,
  })
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 500 })
  return NextResponse.json({ ok: true, reminder: result.reminder })
}

export async function PATCH(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const body = await req.json().catch(() => ({}))

  // Snooze: push the reminder due date out by N minutes.
  if (body.snoozeMinutes != null) {
    if (!body.reminderId) return NextResponse.json({ ok: false, error: 'reminderId required' }, { status: 400 })
    const result = await snoozeReminder(body.reminderId, Number(body.snoozeMinutes))
    if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (!body.reminderId || !['done', 'pending', 'cancelled'].includes(body.status)) {
    return NextResponse.json({ ok: false, error: 'reminderId and status (done|pending|cancelled) are required' }, { status: 400 })
  }
  const result = await setReminderStatus(body.reminderId, body.status as ReminderStatus)
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const body = await req.json().catch(() => ({}))
  if (!body.reminderId) return NextResponse.json({ ok: false, error: 'reminderId required' }, { status: 400 })
  const result = await deleteReminder(body.reminderId)
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 500 })
  return NextResponse.json({ ok: true })
}

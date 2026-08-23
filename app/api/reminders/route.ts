import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, unauthorizedResponse } from '@/lib/supabase/auth'
import {
  createReminder,
  listReminders,
  setReminderStatus,
  deleteReminder,
  reminderCounts,
  quickCallBack,
  suggestNextCallTime,
  type ReminderStatus,
} from '@/lib/reminders'

export const runtime = 'nodejs'

/**
 * GET  /api/reminders?agencyId=...&status=&kind=&listingId=&counts=1
 * POST /api/reminders { title, listing_id?, kind?, due_at, notes? } | { quick: listing_id }
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

  if (req.nextUrl.searchParams.get('counts') === '1') {
    const counts = await reminderCounts(agencyId)
    return NextResponse.json({ ok: true, counts, suggestedNext: suggestNextCallTime() })
  }

  const reminders = await listReminders(agencyId, {
    status: req.nextUrl.searchParams.get('status') || 'pending',
    kind: req.nextUrl.searchParams.get('kind') || undefined,
    listingId: req.nextUrl.searchParams.get('listingId') || undefined,
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

  // Quick "call back seller" action.
  if (body.quick) {
    const result = await quickCallBack(agencyId, body.quick, {
      profileId: body.assignToMe ? auth.user.id : null,
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

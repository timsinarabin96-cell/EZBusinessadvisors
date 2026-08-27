/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createBooking } from '@/lib/booking'
import { notify } from '@/lib/email'
import { rateLimitAsync, clientIp } from '@/lib/rateLimit'

export const runtime = 'nodejs'

const clientIpOf = (req: NextRequest) => clientIp(req)

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const AGENCY_ID = process.env.VOICE_AGENT_AGENCY_ID || '354facdb-cce2-4eb0-a160-8454854e731a' // EZ Business Advisors
const TZ = 'America/New_York'
const BUSINESS_HOUR_START = 9 // 9:00 AM ET
const BUSINESS_HOUR_END = 17 // 5:00 PM ET
const SLOT_MINUTES = 30
const MAX_DAYS_AHEAD = 14

/**
 * Convert an ET wall-clock time (YYYY-MM-DD + hour) to an ISO instant.
 * Uses Intl to derive the America/New_York UTC offset at that date, so DST
 * transitions are handled correctly.
 */
function etWallToIso(dateStr: string, hour: number, minute = 0): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const probe = new Date(Date.UTC(y, m - 1, d, 12))
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(probe)
  const get = (t: string) => parts.find((p) => p.type === t)?.value
  const etMs = Date.UTC(
    Number(get('year')), Number(get('month')) - 1, Number(get('day')),
    Number(get('hour')) % 24, Number(get('minute')), Number(get('second')),
  )
  const offsetMs = etMs - probe.getTime() // ET − UTC
  return new Date(Date.UTC(y, m - 1, d, hour, minute) - offsetMs).toISOString()
}

/** ET wall-clock parts of an ISO instant (for business-hours validation). */
function etParts(iso: string): { weekday: number; hour: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, weekday: 'short', hour: '2-digit', hour12: false,
  }).formatToParts(new Date(iso))
  const get = (t: string) => parts.find((p) => p.type === t)?.value
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return { weekday: weekdayMap[get('weekday') || ''] ?? 0, hour: Number(get('hour')) % 24 }
}

function formatEt(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  }).format(new Date(iso))
}

/**
 * POST /api/public/book — public calendar booking (no auth).
 * Body: { name, email, date: 'YYYY-MM-DD', hour: 9–16 ET, agencyId? }
 * Creates a buyer intro-call appointment in the CRM calendar and emails a
 * confirmation. Rate-limited per IP. Never throws.
 */
export async function POST(req: NextRequest) {
  if (!(await rateLimitAsync(clientIpOf(req), { limit: 10, windowMs: 60 * 1000 }))) {
    return NextResponse.json({ ok: false, error: 'Too many requests. Try again later.' }, { status: 429 })
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request body.' }, { status: 400 })
  }

  const name = String(body?.name || '').trim()
  const email = String(body?.email || '').trim().toLowerCase()
  const date = String(body?.date || '').trim()
  const hour = Number(body?.hour)
  const agencyId = String(body?.agencyId || AGENCY_ID)

  if (!name || !email) {
    return NextResponse.json({ ok: false, error: 'Name and email are required.' }, { status: 400 })
  }
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ ok: false, error: 'Please enter a valid email address.' }, { status: 400 })
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ ok: false, error: 'A valid date (YYYY-MM-DD) is required.' }, { status: 400 })
  }
  if (!Number.isInteger(hour) || hour < BUSINESS_HOUR_START || hour > BUSINESS_HOUR_END - 1) {
    return NextResponse.json({ ok: false, error: `Pick a slot between ${BUSINESS_HOUR_START}:00 and ${BUSINESS_HOUR_END - 1}:00 ET.` }, { status: 400 })
  }

  // Must be within the next 14 days.
  const [yy, mm, dd] = date.split('-').map(Number)
  const startOfDay = Date.UTC(yy, mm - 1, dd)
  const now = Date.now()
  if (startOfDay < now - 24 * 60 * 60 * 1000) {
    return NextResponse.json({ ok: false, error: 'That date is in the past.' }, { status: 400 })
  }
  if (startOfDay > now + MAX_DAYS_AHEAD * 24 * 60 * 60 * 1000) {
    return NextResponse.json({ ok: false, error: 'Please pick a date within the next two weeks.' }, { status: 400 })
  }

  const startsAt = etWallToIso(date, hour)
  const endsAt = new Date(new Date(startsAt).getTime() + SLOT_MINUTES * 60 * 1000).toISOString()
  const { weekday } = etParts(startsAt)
  if (weekday === 0 || weekday === 6) {
    return NextResponse.json({ ok: false, error: 'Please pick a business day (Mon–Fri).' }, { status: 400 })
  }

  // Create the appointment in the CRM calendar (service role).
  const result = await createBooking(agencyId, {
    title: `Buyer intro call — ${name}`,
    appointment_type: 'buyer',
    starts_at: startsAt,
    ends_at: endsAt,
    attendee_name: name,
    attendee_email: email,
    location_type: 'phone',
    notes: 'Booked via the public buyer invitation link.',
  }, { source: 'api' })

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error || 'Booking failed. Please try another slot.' }, { status: 500 })
  }

  // Confirmation email to the buyer.
  await notify('booking_confirmed', email, {
    name,
    title: 'Buyer intro call',
    startsAt: formatEt(startsAt),
    endsAt: formatEt(endsAt),
  }).catch(() => {})

  return NextResponse.json({
    ok: true,
    appointment: result.appointment,
    startsAt,
    endsAt,
    message: `Booked ${formatEt(startsAt)} — confirmation sent to ${email}.`,
  }, { status: 201 })
}

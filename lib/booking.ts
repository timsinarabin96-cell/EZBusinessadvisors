/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// AI Appointment Booking Service
// -----------------------------------------------------------------------------
// Shared by the chat agent and the phone (voice) agent. Takes a natural
// language request ("book a call with John on Friday 3pm about the bakery"),
// has DeepSeek extract structured booking data, then creates the appointment
// in the CRM calendar via the service-role client. Server-only.
// =============================================================================

import { createClient } from '@supabase/supabase-js'
import { completeSensitive } from '@/lib/ai/sensitiveProvider'
import { resolveListingOwner } from '@/lib/callRouting'

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const svc =
  SUPABASE_URL && SERVICE_KEY
    ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
    : null

export interface BookingInput {
  title: string
  appointment_type: 'listing' | 'buyer' | 'valuation' | 'due_diligence' | 'closing' | 'general'
  starts_at: string
  ends_at: string
  attendee_name?: string | null
  attendee_email?: string | null
  attendee_phone?: string | null
  location_type?: string
  location?: string | null
  notes?: string | null
}

export interface BookingResult {
  ok: boolean
  appointment?: Record<string, unknown>
  error?: string
  needs_confirmation?: boolean
  extracted?: BookingInput | null
}

const BOOKING_EXTRACT_PROMPT = `You are the booking extractor inside a business brokerage CRM.

Extract appointment booking details from the caller's message. Return ONLY a JSON object with these fields:
{
  "title": "short appointment title (e.g. 'Intro call — bakery listing')",
  "appointment_type": "listing" | "buyer" | "valuation" | "due_diligence" | "closing" | "general",
  "starts_at": "ISO-8601 timestamp with timezone",
  "ends_at": "ISO-8601 timestamp with timezone",
  "attendee_name": "full name or null",
  "attendee_email": "email or null",
  "attendee_phone": "phone or null",
  "location_type": "phone" | "video" | "in_person",
  "location": "address/room or null",
  "notes": "any extra context or null"
}

Rules:
- If the message does not contain a clear date/time, return {"needs_confirmation": true, "question": "..."} asking for the missing detail.
- Use the current date for relative times (today/tomorrow/next Tuesday).
- Default duration to 30 minutes if not specified.
- Never invent a name, email, or phone. Use null when absent.
- Output pure JSON, no markdown, no commentary.`

/** Have DeepSeek extract structured booking data from a message. */
export async function extractBooking(
  message: string,
  now = new Date(),
): Promise<{ data: BookingInput | null; needs_confirmation?: boolean; question?: string }> {
  const prompt = `${BOOKING_EXTRACT_PROMPT}\n\nCurrent time: ${now.toISOString()}\n\nCaller message: "${message}"`
  const result = await completeSensitive({
    message: prompt,
    context: { kind: 'support', text: '' },
    system: 'You extract structured booking data from natural language. Output JSON only.',
    jsonMode: true,
    maxTokens: 512,
  })

  if (!result.data) {
    const text = (result.text || '').trim()
    const cleaned = text.replace(/^```json\s*/i, '').replace(/```$/, '').trim()
    try {
      const parsed = JSON.parse(cleaned)
      if (parsed?.needs_confirmation) {
        return { data: null, needs_confirmation: true, question: parsed.question }
      }
      return { data: normalizeBooking(parsed) }
    } catch {
      return { data: null, needs_confirmation: true, question: 'Could you give me a date and time for the appointment?' }
    }
  }

  const parsed = result.data as Record<string, unknown>
  if (parsed?.needs_confirmation) {
    return { data: null, needs_confirmation: true, question: String(parsed.question || '') }
  }
  return { data: normalizeBooking(parsed) }
}

function normalizeBooking(raw: Record<string, unknown>): BookingInput | null {
  if (!raw.title || !raw.starts_at || !raw.ends_at) return null
  return {
    title: String(raw.title).slice(0, 200),
    appointment_type: (['listing', 'buyer', 'valuation', 'due_diligence', 'closing', 'general'].includes(String(raw.appointment_type))
      ? String(raw.appointment_type)
      : 'general') as BookingInput['appointment_type'],
    starts_at: String(raw.starts_at),
    ends_at: String(raw.ends_at),
    attendee_name: raw.attendee_name ? String(raw.attendee_name).slice(0, 200) : null,
    attendee_email: raw.attendee_email ? String(raw.attendee_email).slice(0, 200) : null,
    attendee_phone: raw.attendee_phone ? String(raw.attendee_phone).slice(0, 50) : null,
    location_type: raw.location_type ? String(raw.location_type) : 'phone',
    location: raw.location ? String(raw.location).slice(0, 300) : null,
    notes: raw.notes ? String(raw.notes).slice(0, 1000) : null,
  }
}

/**
 * Team round-robin — pick the least-loaded agent for an appointment.
 * Counts each member's upcoming (non-cancelled) appointments and returns the
 * profile_id with the fewest, so buyer consultations spread across the team
 * instead of stacking on whoever created the booking.
 */
export async function suggestRoundRobinAssignee(
  agencyId: string,
  _type?: string,
): Promise<string | null> {
  if (!svc) return null
  const [membersRes, countsRes] = await Promise.all([
    svc.from('agency_members').select('profile_id').eq('agency_id', agencyId),
    svc
      .from('appointments')
      .select('assigned_to')
      .eq('agency_id', agencyId)
      .not('status', 'eq', 'cancelled')
      .gte('starts_at', new Date().toISOString()),
  ])
  const members = (membersRes.data || []) as { profile_id: string }[]
  if (!members.length) return null
  const loads = new Map<string, number>()
  for (const a of (countsRes.data || []) as { assigned_to: string | null }[]) {
    if (a.assigned_to) loads.set(a.assigned_to, (loads.get(a.assigned_to) || 0) + 1)
  }
  // Stable tie-break: lowest load, then earliest profile id.
  return members
    .map((m) => m.profile_id)
    .sort((a, b) => (loads.get(a) || 0) - (loads.get(b) || 0) || a.localeCompare(b))[0]
}

/** Create an appointment in the CRM calendar (service role, bypasses RLS). */
export async function createBooking(
  agencyId: string,
  input: BookingInput,
  opts: { createdBy?: string | null; source?: string; listingId?: string | null; dealId?: string | null; status?: string } = {},
): Promise<BookingResult> {
  if (!svc) return { ok: false, error: 'Database is not configured' }
  if (!agencyId) return { ok: false, error: 'An agency context is required to book appointments' }

  const start = new Date(input.starts_at)
  const end = new Date(input.ends_at)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { ok: false, error: 'Invalid appointment time' }
  }
  if (end <= start) {
    return { ok: false, error: 'Appointment end time must be after start time' }
  }

  // Optional conflict check: same agency, overlapping window, not cancelled.
  const { data: clashes } = await svc
    .from('appointments')
    .select('id, title, starts_at, ends_at')
    .eq('agency_id', agencyId)
    .not('status', 'eq', 'cancelled')
    .lt('starts_at', end.toISOString())
    .gt('ends_at', start.toISOString())
    .limit(5)

  // Ownership-first assignment (independent-contractor model): bookings tied
  // to a listing go to that listing's OWNING agent — their deal, their close.
  // Fall back to the overseeing broker, then least-loaded agent.
  const assignee =
    opts.createdBy ||
    (opts.listingId ? await resolveListingOwner(agencyId, opts.listingId) : null) ||
    (await suggestRoundRobinAssignee(agencyId, input.appointment_type))

  const { data, error } = await svc
    .from('appointments')
    .insert({
      agency_id: agencyId,
      assigned_to: assignee || null,
      created_by: opts.createdBy || null,
      listing_id: opts.listingId || null,
      deal_id: opts.dealId || null,
      title: input.title,
      appointment_type: input.appointment_type,
      status: opts.status || 'scheduled',
      starts_at: start.toISOString(),
      ends_at: end.toISOString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York',
      location_type: input.location_type || 'phone',
      location: input.location || null,
      attendee_name: input.attendee_name || null,
      attendee_email: input.attendee_email || null,
      attendee_phone: input.attendee_phone || null,
      notes: input.notes || null,
      source: opts.source || 'api',
    })
    .select()
    .single()

  if (error) return { ok: false, error: error.message || 'Failed to create appointment' }

  return {
    ok: true,
    appointment: data as Record<string, unknown>,
    ...(clashes && clashes.length > 0 ? { conflicts: clashes } : {}),
  }
}

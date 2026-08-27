/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { extractBooking, createBooking } from '@/lib/booking'
import { validationErrorJson } from '@/lib/friendlyValidation'
import { getAgencyContext } from '@/lib/agencyContext'
import {rateLimitAsync, clientIp } from '@/lib/rateLimit'

export const runtime = 'nodejs'

const MAX_BODY_BYTES = 16 * 1024

const bookingRequestSchema = z.object({
  message: z.string().min(1).max(4000),
  agencyId: z.string().uuid().optional(),
  listingId: z.string().uuid().optional(),
  dealId: z.string().uuid().optional(),
  source: z.string().max(40).optional(),
})

function fail(message: string, status = 400, extra: object = {}) {
  return NextResponse.json({ ok: false, error: message, ...extra }, { status })
}

/**
 * POST /api/booking
 * body: { message, agencyId?, listingId?, dealId?, source? }
 *
 * Natural-language appointment booking. Shared by the chat AI agent and the
 * phone (voice) agent:
 *   1. DeepSeek extracts structured booking JSON from the message.
 *   2. If date/time is missing, we reply with a clarifying question.
 *   3. Otherwise the appointment is created in the CRM calendar (service role).
 */
export async function POST(req: NextRequest) {
  // Spam guard — shared by chat + voice agents, no auth on the public path.
  if (!(await rateLimitAsync(clientIp(req), { limit: 30, windowMs: 60_000 }))) {
    return fail('Too many requests — try again shortly.', 429)
  }

  const raw = await req.text().catch(() => '')
  if (!raw) return fail('Empty request body.', 400)
  if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) {
    return fail('Request too large.', 413)
  }

  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return fail('Invalid JSON.', 400)
  }

  const parsed = bookingRequestSchema.safeParse(body)
  if (!parsed.success) {
    return fail(validationErrorJson(parsed.error).error, 422, { detail: validationErrorJson(parsed.error).detail })
  }
  const { message, agencyId, listingId, dealId, source } = parsed.data

  // Resolve agency: explicit (voice webhook / service) or from session (chat).
  let resolvedAgencyId = agencyId
  let createdBy: string | null = null
  if (!resolvedAgencyId) {
    const ctx = await getAgencyContext()
    resolvedAgencyId = ctx?.agencyId || null
    createdBy = ctx?.userId || null
  }
  if (!resolvedAgencyId) {
    return fail('An agency context is required to book appointments.', 403, {
      code: 'NO_AGENCY',
    })
  }

  // Step 1 — extract structured booking from natural language.
  let extraction
  try {
    extraction = await extractBooking(message)
  } catch (e: any) {
    console.error('[booking] extraction failed:', (e as Error)?.message)
    return fail('The AI booking service returned an error. Please try again.', 502, {
      code: 'AI_CALL_FAILED',
    })
  }

  // Step 2 — missing date/time: ask for it.
  if (extraction.needs_confirmation || !extraction.data) {
    return NextResponse.json({
      ok: false,
      needs_confirmation: true,
      question: extraction.question || 'Could you give me a date and time for the appointment?',
    })
  }

  // Step 3 — create the appointment in the calendar.
  const result = await createBooking(resolvedAgencyId, extraction.data, {
    createdBy,
    source: source || 'api',
    listingId: listingId || null,
    dealId: dealId || null,
  })

  if (!result.ok) {
    return fail(result.error || 'Failed to create appointment', 500, {
      code: 'BOOKING_FAILED',
    })
  }

  const conflicts = (result as { conflicts?: unknown[] }).conflicts
  return NextResponse.json({
    ok: true,
    appointment: result.appointment,
    extracted: extraction.data,
    conflicts: conflicts || [],
    message: conflicts?.length
      ? `Appointment created, but it overlaps ${conflicts.length} existing appointment(s) — review the calendar.`
      : 'Appointment created successfully.',
  })
}

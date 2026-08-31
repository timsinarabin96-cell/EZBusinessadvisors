/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { createServerClient } from '@/lib/supabase/server'
import { createBooking } from '@/lib/booking'

export const runtime = 'nodejs'

// =============================================================================
// POST /api/voice/vapi — Vapi realtime-voice webhook (human-level voice upgrade)
// -----------------------------------------------------------------------------
// Vapi hosts the realtime conversation (streaming, interruptible, ~500ms).
// This route handles:
//   • tool-calls        → booking.appointment tool → creates CRM appointment
//   • end-of-call-report → logs the conversation into call_sessions/transcripts
//   • status-update      → session lifecycle
// The live agent prompt/voice live in the Vapi assistant config (see vapi/).
// =============================================================================

const AGENCY_ID = process.env.VOICE_AGENT_AGENCY_ID || ''
const AGENCY_NAME = process.env.VOICE_AGENT_AGENCY_NAME || 'our brokerage'

function secretsMatch(received: string, expected: string) {
  const a = Buffer.from(received || '')
  const b = Buffer.from(expected || '')
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function POST(req: NextRequest) {
  const expected = process.env.VAPI_WEBHOOK_SECRET || ''
  if (expected && !secretsMatch(req.headers.get('x-vapi-secret') || '', expected)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const db = createServerClient()
  if (!db) return NextResponse.json({ error: 'not configured' }, { status: 503 })

  let body: any = {}
  try { body = await req.json() } catch { /* ignore */ }
  const type = body?.message?.type || body?.type || ''
  const callId = String(body?.call?.id || body?.callId || '')

  // ---- TOOL CALLS: the agent asked us to book an appointment. ----
  if (type === 'tool-calls') {
    const results = []
    for (const tool of body?.message?.toolCalls || body?.toolCalls || []) {
      if (tool?.function?.name === 'book_appointment') {
        const a = tool.function.arguments || {}
        const res = await createBooking(AGENCY_ID, {
          title: String(a.title || 'Appointment').slice(0, 200),
          appointment_type: a.appointment_type || 'general',
          starts_at: String(a.starts_at || ''),
          ends_at: String(a.ends_at || ''),
          attendee_name: a.attendee_name ? String(a.attendee_name) : null,
          attendee_email: a.attendee_email ? String(a.attendee_email) : null,
          attendee_phone: a.attendee_phone ? String(a.attendee_phone) : null,
          location_type: a.location_type || 'phone',
          location: a.location || null,
          notes: a.notes ? String(a.notes) : null,
        }, { source: 'ai_phone', createdBy: null })
        results.push({
          toolCallId: tool.id,
          result: res.ok
            ? `Booked ${res.appointment?.title || 'the appointment'} — confirmed in the CRM.`
            : `Could not book: ${res.error || 'unknown error'}`,
        })
      }
    }
    return NextResponse.json({ results })
  }

  // ---- END OF CALL: persist the conversation for the CRM timeline. ----
  if (type === 'end-of-call-report') {
    const from = String(body?.customer?.number || body?.customer?.phoneNumber || '')
    const { data: created } = await db.from('call_sessions').insert({
      agency_id: AGENCY_ID,
      provider: 'vapi',
      provider_call_id: callId || null,
      direction: 'inbound',
      status: 'completed',
      caller_number: from || null,
      purpose: 'voice_receptionist',
      duration_seconds: body?.call?.durationSeconds || null,
      started_at: body?.call?.startedAt ? new Date(body.call.startedAt).toISOString() : new Date().toISOString(),
      ended_at: new Date().toISOString(),
      metadata: { last_processed_at: null, realtime: true },
    }).select('id').single()
    const sessionId = created?.id
    if (sessionId) {
      const transcript = Array.isArray(body?.transcript) ? body.transcript : []
      let seq = 1
      for (const line of transcript) {
        const speaker = line?.role === 'assistant' ? 'assistant' : 'caller'
        if (!line?.transcript) continue
        await db.from('call_transcripts').insert({
          agency_id: AGENCY_ID,
          call_session_id: sessionId,
          sequence: seq++ % 100000,
          speaker,
          content: String(line.transcript).slice(0, 2000),
        }).maybeSingle()
      }
    }
    return NextResponse.json({ ok: true })
  }

  // ---- STATUS UPDATES: just acknowledge. ----
  return NextResponse.json({ ok: true })
}

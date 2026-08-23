import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { generatePhoneReply } from '@/lib/voiceAgent'
import { createBooking } from '@/lib/booking'

export const runtime = 'nodejs'

// =============================================================================
// POST /api/voice/twilio — Twilio voice webhook
// -----------------------------------------------------------------------------
// Twilio → this route on each caller utterance. Returns TwiML that speaks the
// AI's reply and keeps listening. Booking requests with a date/time are turned
// into real CRM appointments for the configured agency.
// =============================================================================

function twiml(body: string, hangup = false, gather = true): string {
  const listen = gather
    ? `<Gather input="speech" timeout="4" speechTimeout="auto" language="en-US"><Say voice="Polly.Joanna">${escapeXml(body)}</Say></Gather><Redirect>/api/voice/twilio</Redirect>`
    : `<Say voice="Polly.Joanna">${escapeXml(body)}</Say>`
  const end = hangup ? '<Hangup/>' : ''
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${listen}${end}</Response>`
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
    .replace(/[^\x09\x0A\x0D\x20-\uD7FF\uE000-\uFFFD]/g, '')
}

export async function POST(req: NextRequest) {
  const db = createServerClient()
  if (!db) return new NextResponse('Service unavailable', { status: 503 })

  const agencyId = process.env.VOICE_AGENT_AGENCY_ID || ''
  if (!agencyId) return new NextResponse('Voice agent is not configured for an agency', { status: 503 })

  const form = await req.formData()
  const speechResult = String(form.get('SpeechResult') || '')
  const callSid = String(form.get('CallSid') || '')
  const fromNumber = String(form.get('From') || '')
  const transcript = speechResult.trim()

  // Record the transcript segment.
  if (callSid && transcript) {
    const { data: session } = await db.from('call_sessions').select('id').eq('provider_call_id', callSid).maybeSingle()
    if (session) {
      await db.from('call_transcripts').insert({
        agency_id: agencyId,
        call_session_id: session.id,
        sequence: Date.now() % 100000,
        speaker: 'caller',
        content: transcript,
      }).maybeSingle()
    }
  }

  // First turn (no speech yet) → greet.
  if (!transcript) {
    const name = String(form.get('CallerName') || '')
    const greeting = name
      ? `Hi ${name}, thanks for calling. How can I help you today?`
      : `Thank you for calling. How can I help you today?`
    return new NextResponse(twiml(greeting), {
      headers: { 'Content-Type': 'text/xml' },
    })
  }

  // Generate the AI reply.
  const reply = await generatePhoneReply({ transcript, callerName: null, agencyName: process.env.VOICE_AGENT_AGENCY_NAME })

  // If the caller asked to book with a date/time, create the appointment.
  if (reply.booking && !reply.booking.needs_confirmation && reply.booking.appointment) {
    const input = reply.booking.appointment as unknown as {
      title?: string; appointment_type?: string; starts_at?: string; ends_at?: string
      attendee_name?: string | null; attendee_email?: string | null; attendee_phone?: string | null
      location_type?: string; location?: string | null; notes?: string | null
    }
    await createBooking(agencyId, {
      title: input.title || 'Phone booking',
      appointment_type: (input.appointment_type as never) || 'general',
      starts_at: input.starts_at || '',
      ends_at: input.ends_at || '',
      attendee_name: input.attendee_name ?? null,
      attendee_email: input.attendee_email ?? null,
      attendee_phone: input.attendee_phone ?? (fromNumber || null),
      location_type: input.location_type || 'phone',
      location: input.location ?? null,
      notes: input.notes ?? null,
    }, { source: 'ai_phone' })
  }

  return new NextResponse(twiml(reply.speech, Boolean(reply.hangup), !reply.hangup), {
    headers: { 'Content-Type': 'text/xml' },
  })
}

import { timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

type VoiceEvent =
  | { type: 'call.started'; providerCallId: string; callerNumber?: string; destinationNumber?: string; callerName?: string; disclosed?: boolean; metadata?: Record<string, unknown> }
  | { type: 'call.completed'; providerCallId: string; summary?: string; sentiment?: string; durationSeconds?: number; recordingUrl?: string; qualificationScore?: number }
  | { type: 'call.transferred'; providerCallId: string; transferredTo?: string }
  | { type: 'transcript.segment'; providerCallId: string; sequence: number; speaker: 'caller' | 'assistant' | 'broker' | 'system'; content: string; confidence?: number; startedAtMs?: number; endedAtMs?: number }
  | { type: 'booking.request'; providerCallId: string; message: string; listingId?: string; dealId?: string }

function secretsMatch(received: string, expected: string) {
  const receivedBuffer = Buffer.from(received)
  const expectedBuffer = Buffer.from(expected)
  return receivedBuffer.length === expectedBuffer.length && timingSafeEqual(receivedBuffer, expectedBuffer)
}

export async function POST(req: NextRequest) {
  const expectedSecret = process.env.VOICE_AGENT_WEBHOOK_SECRET || ''
  const agencyId = process.env.VOICE_AGENT_AGENCY_ID || ''
  const receivedSecret = req.headers.get('x-concord-agent-secret') || ''

  if (!expectedSecret || !agencyId) {
    return NextResponse.json({ ok: false, error: 'Voice integration is not configured' }, { status: 503 })
  }
  if (!secretsMatch(receivedSecret, expectedSecret)) {
    return NextResponse.json({ ok: false, error: 'Invalid integration credentials' }, { status: 401 })
  }

  const supabase = createServerClient()
  if (!supabase) return NextResponse.json({ ok: false, error: 'Database is not configured' }, { status: 503 })

  let event: VoiceEvent
  try {
    event = await req.json() as VoiceEvent
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!event?.type || !event.providerCallId) {
    return NextResponse.json({ ok: false, error: 'Event type and providerCallId are required' }, { status: 400 })
  }

  if (event.type === 'call.started') {
    const { data, error } = await supabase
      .from('call_sessions')
      .upsert({
        agency_id: agencyId,
        provider: 'twilio',
        provider_call_id: event.providerCallId,
        direction: 'inbound',
        status: 'in_progress',
        caller_number: event.callerNumber || null,
        destination_number: event.destinationNumber || null,
        caller_name: event.callerName || null,
        consent_disclosed_at: event.disclosed ? new Date().toISOString() : null,
        started_at: new Date().toISOString(),
        metadata: event.metadata || {},
      }, { onConflict: 'provider,provider_call_id' })
      .select('id')
      .single()
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, callSessionId: data.id })
  }

  const { data: call, error: callError } = await supabase
    .from('call_sessions')
    .select('id')
    .eq('agency_id', agencyId)
    .eq('provider_call_id', event.providerCallId)
    .maybeSingle()
  if (callError) return NextResponse.json({ ok: false, error: callError.message }, { status: 500 })
  if (!call) return NextResponse.json({ ok: false, error: 'Call session not found' }, { status: 404 })

  if (event.type === 'transcript.segment') {
    if (!Number.isInteger(event.sequence) || event.sequence < 0 || !event.content?.trim()) {
      return NextResponse.json({ ok: false, error: 'A valid transcript segment is required' }, { status: 400 })
    }
    const { error } = await supabase.from('call_transcripts').upsert({
      agency_id: agencyId,
      call_session_id: call.id,
      sequence: event.sequence,
      speaker: event.speaker,
      content: event.content.trim(),
      confidence: event.confidence ?? null,
      started_at_ms: event.startedAtMs ?? null,
      ended_at_ms: event.endedAtMs ?? null,
    }, { onConflict: 'call_session_id,sequence' })
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (event.type === 'booking.request') {
    // AI phone bot books an appointment straight into the CRM calendar.
    if (!event.message?.trim()) {
      return NextResponse.json({ ok: false, error: 'A booking message is required' }, { status: 400 })
    }
    const { extractBooking, createBooking } = await import('@/lib/booking')
    try {
      const extraction = await extractBooking(event.message)
      if (extraction.needs_confirmation || !extraction.data) {
        return NextResponse.json({
          ok: false,
          needs_confirmation: true,
          question: extraction.question || 'Could you give me a date and time for the appointment?',
        })
      }
      const result = await createBooking(agencyId, extraction.data, {
        source: 'ai_phone',
        listingId: event.listingId || null,
        dealId: event.dealId || null,
      })
      if (!result.ok) {
        return NextResponse.json({ ok: false, error: result.error }, { status: 500 })
      }
      const conflicts = (result as { conflicts?: unknown[] }).conflicts
      return NextResponse.json({
        ok: true,
        appointment: result.appointment,
        conflicts: conflicts || [],
        message: conflicts?.length
          ? `Appointment created, but it overlaps ${conflicts.length} existing appointment(s).`
          : 'Appointment created successfully.',
      })
    } catch (err) {
      console.error('[voice] booking failed:', (err as Error)?.message)
      return NextResponse.json({ ok: false, error: 'Booking service error' }, { status: 502 })
    }
  }

  if (event.type === 'call.transferred') {
    const { error } = await supabase.from('call_sessions').update({
      status: 'transferred',
      transferred_to: event.transferredTo || null,
      updated_at: new Date().toISOString(),
    }).eq('id', call.id)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (event.type === 'call.completed') {
    const { error } = await supabase.from('call_sessions').update({
      status: 'completed',
      summary: event.summary || null,
      sentiment: event.sentiment || null,
      duration_seconds: event.durationSeconds ?? null,
      qualification_score: event.qualificationScore ?? null,
      recording_url: event.recordingUrl || null,
      ended_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', call.id)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

    // Missed-call → auto callback task for the right agent (fires when the
    // call was too short to be a real conversation — nobody got through).
    const dur = event.durationSeconds ?? 0
    if (dur < 60) {
      const { data: full } = await supabase.from('call_sessions').select('caller_number, caller_name, listing_id, started_at').eq('id', call.id).maybeSingle()
      if (full?.caller_number) {
        try {
          const { createCallbackTask } = await import('@/lib/callbackTask')
          await createCallbackTask(agencyId, {
            callerNumber: full.caller_number,
            callerName: full.caller_name || null,
            listingId: full.listing_id || null,
            startedAt: full.started_at || null,
          })
        } catch { /* callback task is best-effort */ }
      }
    }
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ ok: false, error: 'Unsupported event type' }, { status: 400 })
}

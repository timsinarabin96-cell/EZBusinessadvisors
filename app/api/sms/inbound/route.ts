import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createServerClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

// =============================================================================
// POST /api/sms/inbound — Twilio SMS webhook (Yavin-powered text receptionist)
// -----------------------------------------------------------------------------
// Validates the Twilio signature, then stores the message in call_sessions /
// call_transcripts (purpose='sms_receptionist'). The local SMS watcher polls
// these rows, has the agent compose a reply, books appointments, and texts
// back via the Twilio REST API. This route never talks to the LLM itself.
// =============================================================================

function validTwilioSignature(authToken: string, url: string, params: Record<string, string>, signature: string | null): boolean {
  if (!authToken || !signature) return false
  const body = Object.keys(params)
    .sort()
    .map((k) => `${k}${params[k]}`)
    .join('')
  const expected = crypto.createHmac('sha1', authToken).update(url + body).digest('base64')
  const a = Buffer.from(expected)
  const b = Buffer.from(signature)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

export async function POST(req: NextRequest) {
  const db = createServerClient()
  if (!db) return new NextResponse('Service unavailable', { status: 503 })

  const agencyId = process.env.VOICE_AGENT_AGENCY_ID || ''
  if (!agencyId) return new NextResponse('SMS agent is not configured for an agency', { status: 503 })

  // Reconstruct the full URL Twilio called (it signs the whole thing).
  const proto = req.headers.get('x-forwarded-proto') || 'https'
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || ''
  const url = `${proto}://${host}${req.nextUrl.pathname}${req.nextUrl.search || ''}`

  const form = await req.formData()
  const params: Record<string, string> = {}
  for (const [k, v] of form.entries()) params[k] = String(v)

  const sig = req.headers.get('x-twilio-signature')
  if (!validTwilioSignature(process.env.TWILIO_AUTH_TOKEN || '', url, params, sig)) {
    return new NextResponse('Invalid signature', { status: 403 })
  }

  const from = String(params.From || '').trim()
  const to = String(params.To || '').trim()
  const body = String(params.Body || '').trim()
  if (!from || !body) return new NextResponse('<Response/>', { headers: { 'Content-Type': 'text/xml' } })

  // One open session per phone number (like a thread).
  const { data: existing } = await db
    .from('call_sessions')
    .select('*')
    .eq('agency_id', agencyId)
    .eq('provider', 'twilio')
    .eq('purpose', 'sms_receptionist')
    .eq('caller_number', from)
    .eq('status', 'in_progress')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let sessionId: string
  if (existing?.id) {
    sessionId = existing.id
  } else {
    const { data: created, error } = await db
      .from('call_sessions')
      .insert({
        agency_id: agencyId,
        provider: 'twilio',
        purpose: 'sms_receptionist',
        direction: 'inbound',
        status: 'in_progress',
        caller_number: from,
        destination_number: to || null,
        started_at: new Date().toISOString(),
        metadata: { last_processed_at: null },
      })
      .select('id')
      .single()
    if (error || !created?.id) return new NextResponse('Failed to open SMS session', { status: 500 })
    sessionId = created.id
  }

  const { error: insertErr } = await db.from('call_transcripts').insert({
    agency_id: agencyId,
    call_session_id: sessionId,
    sequence: Date.now() % 100000, // integer column — keep within 32-bit range
    speaker: 'caller',
    content: body,
  })
  if (insertErr) return new NextResponse('Failed to store message', { status: 500 })

  return new NextResponse('<Response/>', { headers: { 'Content-Type': 'text/xml' } })
}

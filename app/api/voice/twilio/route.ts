/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

// =============================================================================
// POST /api/voice/twilio — Twilio voice webhook → LIVE AGENT (Yavin)
// -----------------------------------------------------------------------------
// Async pattern: stores the caller's speech in Supabase, tells them to hold
// for a moment, and redirects to /api/voice/poll which picks up the agent's
// reply (written by the local watcher) and speaks it. Booking, qualification
// and broker alerts all happen in the same agent pipeline as SMS/chat.
// =============================================================================

const VOICE = 'Polly.Matthew-Neural'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://concord-deal-platform.vercel.app'

// Turn-taking: Twilio's ML end-of-speech detection (auto) + phone-call model
// means the agent jumps in the moment the caller stops talking — no 6s dead
// air. timeout=4 is the max wait for the caller to START speaking.
const GATHER_OPTS = 'input="speech" timeout="4" speechTimeout="auto" speechModel="phone_call" enhanced="true" language="en-US"'

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
    .replace(/[^\x09\x0A\x0D\x20-\uD7FF\uE000-\uFFFD]/g, '')
}

// URLs inside TwiML attributes must be XML-escaped (& → &amp;).
function escapeAttr(s: string): string {
  return escapeXml(s)
}

function twiml(opts: { say?: string; gather?: boolean; pause?: boolean; redirect?: string; hangup?: boolean }): string {
  let inner = ''
  if (opts.pause) inner = '<Pause length="2"/>'
  if (opts.say) {
    const say = `<Say voice="${VOICE}">${escapeXml(opts.say)}</Say>`
    inner += opts.gather
      ? `<Gather ${GATHER_OPTS} action="${escapeAttr(APP_URL)}/api/voice/twilio" method="POST">${say}</Gather>`
      : say
  }
  if (opts.redirect) inner += `<Redirect>${escapeAttr(opts.redirect)}</Redirect>`
  if (opts.hangup) inner += '<Hangup/>'
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`
}

function xml(body: string): NextResponse {
  return new NextResponse(body, { headers: { 'Content-Type': 'text/xml' } })
}

function dayPart(): string {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}

export async function POST(req: NextRequest) {
  const db = createServerClient()
  if (!db) return new NextResponse('Service unavailable', { status: 503 })

  const agencyId = process.env.VOICE_AGENT_AGENCY_ID || ''
  if (!agencyId) return new NextResponse('Voice agent is not configured for an agency', { status: 503 })
  const agencyName = process.env.VOICE_AGENT_AGENCY_NAME || 'our brokerage'

  // --- REAL-TIME MODE: if the local Gemini bridge is registered (<90s old),
  // stream the call to it (interruptible, ~500ms, human-level voice).
  try {
    const { data: bridge } = await db
      .from('call_sessions')
      .select('caller_number, started_at')
      .eq('provider', 'gemini_bridge')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (bridge?.caller_number && new Date(bridge.started_at).getTime() > Date.now() - 90_000) {
      const streamUrl = String(bridge.caller_number).replace(/^http/, 'ws')
      return xml(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Connect>` +
        `<Stream url="${escapeAttr(streamUrl)}/stream"/>` +
        `</Connect></Response>`,
      )
    }
  } catch { /* bridge lookup failed — fall back to turn-based */ }

  const form = await req.formData()
  const speechResult = String(form.get('SpeechResult') || '').trim()
  const callSid = String(form.get('CallSid') || '')
  const fromNumber = String(form.get('From') || '')
  const callerName = String(form.get('CallerName') || '')

  // --- Session: reuse by provider_call_id, else create. ---
  let session: any = null
  let isNewSession = false
  if (callSid) {
    const { data: existing } = await db.from('call_sessions').select('*').eq('provider_call_id', callSid).maybeSingle()
    if (existing) {
      session = existing
    } else {
      const { data: created } = await db.from('call_sessions').insert({
        agency_id: agencyId,
        provider: 'twilio',
        provider_call_id: callSid,
        direction: 'inbound',
        status: 'in_progress',
        caller_number: fromNumber || null,
        destination_number: String(form.get('To') || null) || null,
        caller_name: callerName || null,
        purpose: 'voice_receptionist',
        metadata: { last_processed_at: null },
        started_at: new Date().toISOString(),
      }).select().single()
      session = created
      isNewSession = true
    }
  }

  // --- No speech: greet on a NEW call; re-prompt only if mid-call. ---
  if (!speechResult) {
    if (session && !isNewSession) {
      return xml(twiml({ say: "I didn't catch that. Could you repeat that?", gather: true }))
    }
    const greeting = callerName
      ? `Good ${dayPart()}, ${callerName}. This is ${agencyName}. How may I help you today?`
      : `Good ${dayPart()}, thank you for calling ${agencyName}. This is the front desk — how may I help you today?`
    return xml(twiml({ say: greeting, gather: true }))
  }

  // --- Store the caller's speech for the live agent. ---
  if (session?.id) {
    await db.from('call_transcripts').insert({
      agency_id: agencyId,
      call_session_id: session.id,
      sequence: Date.now() % 100000,
      speaker: 'caller',
      content: speechResult,
    }).maybeSingle()
  } else {
    return xml(twiml({ say: 'I could not connect you. A broker will call you back shortly.', hangup: true }))
  }

  // --- Hold while the agent thinks; poll for the reply. ---
  return xml(twiml({ say: 'One moment, please.', redirect: `${APP_URL}/api/voice/poll?session=${session.id}&attempt=0` }))
}

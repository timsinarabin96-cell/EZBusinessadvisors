import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

// =============================================================================
// POST /api/voice/poll?session=<id>&attempt=<n> — speak the live agent's reply
// -----------------------------------------------------------------------------
// After the caller speaks, the main route redirects here. We wait for the
// local watcher to write the agent's reply transcript, then speak it and
// re-open the mic (Gather → back to /api/voice/twilio). If the agent ended
// the call (GOODBYE marker) we hang up. Bounded attempts → graceful fallback.
// =============================================================================

const VOICE = 'Polly.Matthew-Neural'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://concord-deal-platform.vercel.app'
const MAX_ATTEMPTS = 14 // ~2s pauses → ~30s worst-case hold before fallback

function xml(body: string): NextResponse {
  return new NextResponse(body, { headers: { 'Content-Type': 'text/xml' } })
}

export async function POST(req: NextRequest) {
  const db = createServerClient()
  if (!db) return new NextResponse('Service unavailable', { status: 503 })

  const sessionId = String(req.nextUrl.searchParams.get('session') || '')
  const attempt = Math.min(Number(req.nextUrl.searchParams.get('attempt') || 0) || 0, MAX_ATTEMPTS)
  if (!sessionId) return xml('<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>')

  const { data: session } = await db.from('call_sessions').select('*').eq('id', sessionId).maybeSingle()
  if (!session) {
    return xml('<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="' + VOICE + '">I could not connect you. A broker will call you back shortly.</Say><Hangup/></Response>')
  }

  // Latest transcripts, newest first.
  const { data: lines } = await db
    .from('call_transcripts')
    .select('speaker, content, created_at')
    .eq('call_session_id', sessionId)
    .order('created_at', { ascending: false })
    .limit(6)

  const latest = lines?.[0]
  const isAssistantReply = latest?.speaker === 'assistant' && latest?.content?.trim()

  // Agent reply is ready → speak it.
  if (isAssistantReply && latest) {
    let text = String(latest.content).trim()
    const goodbye = /GOODBYE/i.test(text)
    text = text.replace(/GOODBYE/gi, '').trim() || 'Thank you for calling. Goodbye.'

    // End the call when the agent says the conversation is done.
    if (goodbye) {
      await db.from('call_sessions').update({ status: 'completed', ended_at: new Date().toISOString() }).eq('id', sessionId)
      return xml(`<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="${VOICE}">${escapeXml(text)}</Say><Hangup/></Response>`)
    }

    // Otherwise speak the reply and re-open the mic for the next turn.
    // speechTimeout="auto" + phone_call model = jump in the moment the
    // caller stops talking (no 6s dead air).
    return xml(
      `<?xml version="1.0" encoding="UTF-8"?><Response>` +
      `<Gather input="speech" timeout="4" speechTimeout="auto" speechModel="phone_call" enhanced="true" language="en-US" action="${escapeAttr(APP_URL)}/api/voice/twilio" method="POST">` +
      `<Say voice="${VOICE}">${escapeXml(text)}</Say></Gather>` +
      `<Redirect>${escapeAttr(APP_URL)}/api/voice/twilio</Redirect></Response>`,
    )
  }

  // Not ready yet — hold briefly and poll again (or fall back after too long).
  if (attempt >= MAX_ATTEMPTS) {
    return xml(
      `<?xml version="1.0" encoding="UTF-8"?><Response>` +
      `<Say voice="${VOICE}">I apologize for the wait. A broker will call you back shortly.</Say><Hangup/></Response>`,
    )
  }
  return xml(
    `<?xml version="1.0" encoding="UTF-8"?><Response><Pause length="2"/>` +
    `<Redirect>${escapeAttr(`${APP_URL}/api/voice/poll?session=${sessionId}&attempt=${attempt + 1}`)}</Redirect></Response>`,
  )
}

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

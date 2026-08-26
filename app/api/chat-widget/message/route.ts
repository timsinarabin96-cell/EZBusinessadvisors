/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createServerClient } from '@/lib/supabase/server'
import {rateLimitAsync } from '@/lib/rateLimit'

export const runtime = 'nodejs'

const clientIp = (req: Request) =>
  req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
  req.headers.get('x-real-ip') ||
  'unknown'

// =============================================================================
// POST /api/chat-widget/message — website chat widget → agent pipeline
// -----------------------------------------------------------------------------
// Stores a visitor message in call_sessions/call_transcripts
// (purpose='chat_widget'). The local watcher picks it up, the agent replies,
// and the widget polls /api/chat-widget/poll for the assistant message.
// Works for public website AND CRM dashboard (mode field).
// =============================================================================

export async function POST(req: NextRequest) {
  // Anti-abuse: public-ish endpoint — rate limited per IP.
  if (!(await rateLimitAsync(clientIp(req), { limit: 10, windowMs: 60 * 1000 }))) {
    return NextResponse.json({ ok: false, error: 'Too many requests. Try again later.' }, { status: 429 })
  }
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'Service unavailable' }, { status: 503 })

  const agencyId = process.env.VOICE_AGENT_AGENCY_ID || ''
  if (!agencyId) return NextResponse.json({ ok: false, error: 'Chat agent is not configured' }, { status: 503 })

  let body: any = {}
  try { body = await req.json() } catch { /* fall through */ }
  const message = String(body?.message || '').trim().slice(0, 1000)
  if (!message) return NextResponse.json({ ok: false, error: 'Message is required' }, { status: 400 })

  const mode = body?.mode === 'crm' ? 'crm' : 'public'
  let sessionId = String(body?.sessionId || '').trim().slice(0, 64)
  if (!sessionId) sessionId = `web_${crypto.randomUUID()}`

  // Reuse an open thread for this visitor, else start one.
  const { data: existing } = await db
    .from('call_sessions')
    .select('id')
    .eq('agency_id', agencyId)
    .eq('provider', 'web')
    .eq('purpose', 'chat_widget')
    .eq('caller_number', sessionId)
    .eq('status', 'in_progress')
    .limit(1)
    .maybeSingle()

  let dbSessionId: string
  if (existing?.id) {
    dbSessionId = existing.id
  } else {
    const { data: created, error } = await db
      .from('call_sessions')
      .insert({
        agency_id: agencyId,
        provider: 'web',
        purpose: 'chat_widget',
        direction: 'inbound',
        status: 'in_progress',
        caller_number: sessionId,
        metadata: { last_processed_at: null, mode },
        started_at: new Date().toISOString(),
      })
      .select('id')
      .single()
    if (error || !created?.id) return NextResponse.json({ ok: false, error: 'Failed to open chat session' }, { status: 500 })
    dbSessionId = created.id
  }

  const { error } = await db.from('call_transcripts').insert({
    agency_id: agencyId,
    call_session_id: dbSessionId,
    sequence: Date.now() % 100000,
    speaker: 'caller',
    content: message,
  })
  if (error) return NextResponse.json({ ok: false, error: 'Failed to store message' }, { status: 500 })

  return NextResponse.json({ ok: true, sessionId, dbSessionId })
}

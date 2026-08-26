/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { createServerClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

// =============================================================================
// POST /api/voice/bridge-register — the local Gemini bridge reports its
// public tunnel URL so /api/voice/twilio can return real-time <Connect> TwiML.
//   { url: "wss://xxx.trycloudflare.com" }  header: x-bridge-secret
// GET  /api/voice/bridge-register — returns freshest URL (< 90s old).
// Stored as a synthetic call_sessions row (provider='gemini_bridge') — the
// watcher ignores this provider, so it never processes it as a call.
// =============================================================================

const AGENCY_ID = process.env.VOICE_AGENT_AGENCY_ID || ''

function secretsMatch(received: string, expected: string) {
  const a = Buffer.from(received || '')
  const b = Buffer.from(expected || '')
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function POST(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const expected = process.env.VOICE_BRIDGE_SECRET || ''
  if (!expected || !secretsMatch(req.headers.get('x-bridge-secret') || '', expected)) {
    return NextResponse.json({ ok: false, error: 'bad secret' }, { status: 401 })
  }
  const body = await req.json().catch(() => ({}))
  const url = String(body?.url || '').trim().slice(0, 300)
  if (!/^wss?:\/\//.test(url)) return NextResponse.json({ ok: false, error: 'bad url' }, { status: 400 })

  // Replace the previous registration (one row per agency).
  await db.from('call_sessions').delete().eq('agency_id', AGENCY_ID).eq('provider', 'gemini_bridge')
  const { data, error } = await db.from('call_sessions').insert({
    agency_id: AGENCY_ID,
    provider: 'gemini_bridge',
    purpose: 'bridge_registry',
    direction: 'inbound',
    status: 'in_progress',
    caller_number: url,
    started_at: new Date().toISOString(),
  }).select('id').single()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, id: data.id })
}

export async function GET(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, url: null }, { status: 503 })
  const { data } = await db
    .from('call_sessions')
    .select('caller_number, started_at')
    .eq('provider', 'gemini_bridge')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const fresh = data && new Date(data.started_at).getTime() > Date.now() - 90_000
  return NextResponse.json({ ok: true, url: fresh ? data.caller_number : null })
}

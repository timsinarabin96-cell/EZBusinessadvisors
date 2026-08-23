import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, canManageAgency, forbiddenResponse, unauthorizedResponse } from '@/lib/supabase/auth'
import { summarizeCall } from '@/lib/callSummaries'

export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f-]{36}$/i

/**
 * /api/intelligence/call-summaries
 *
 * GET  ?agencyId=... — list call summaries for an agency
 * POST { callId }    — summarize a voice call session (call_sessions)
 */
export async function GET(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const authenticated = await authenticateProfileRequest(req)
  if (!authenticated) return unauthorizedResponse()

  const agencyId = req.nextUrl.searchParams.get('agencyId') || ''
  if (!agencyId || !canManageAgency(authenticated, agencyId)) return forbiddenResponse()

  const { data, error } = await db
    .from('call_summaries')
    .select('*')
    .eq('agency_id', agencyId)
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, summaries: data || [] })
}

export async function POST(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const authenticated = await authenticateProfileRequest(req)
  if (!authenticated) return unauthorizedResponse()

  const body = (await req.json().catch(() => null)) as { callId?: string } | null
  const callId = body?.callId || ''
  if (!callId || !UUID_RE.test(callId)) {
    return NextResponse.json({ ok: false, error: 'A valid callId is required' }, { status: 400 })
  }

  // Verify the caller manages the agency that owns the call session.
  const { data: session, error: sessionError } = await db.from('call_sessions').select('agency_id').eq('id', callId).maybeSingle()
  if (sessionError) return NextResponse.json({ ok: false, error: sessionError.message }, { status: 500 })
  if (!session) return NextResponse.json({ ok: false, error: 'Call session not found' }, { status: 404 })
  if (!canManageAgency(authenticated, session.agency_id)) return forbiddenResponse()

  const result = await summarizeCall(callId)
  if (!result.ok || !result.summary) {
    return NextResponse.json({ ok: false, error: result.error || 'Summarization failed' }, { status: 500 })
  }
  return NextResponse.json({ ok: true, summary: result.summary })
}

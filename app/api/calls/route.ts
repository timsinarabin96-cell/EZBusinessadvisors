/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, canManageAgency, forbiddenResponse, unauthorizedResponse } from '@/lib/supabase/auth'
import { matchCaller } from '@/lib/callerMatch'

export const runtime = 'nodejs'

/**
 * GET /api/calls?agencyId=...&status=&hours=
 * Call Log — every inbound call with caller identity enriched via reverse
 * phone match (buyer/seller name), linked listing, and callback status.
 */
export async function GET(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const agencyId = req.nextUrl.searchParams.get('agencyId') || auth.memberships[0]?.agency_id
  if (!agencyId) return NextResponse.json({ ok: false, error: 'No agency membership' }, { status: 403 })
  if (!canManageAgency(auth, agencyId)) return forbiddenResponse()

  const status = req.nextUrl.searchParams.get('status') || 'all'
  const hours = Number(req.nextUrl.searchParams.get('hours') || 24 * 7)
  const includeTranscripts = req.nextUrl.searchParams.get('includeTranscripts') === '1'

  let query = db
    .from('call_sessions')
    .select('id, provider, direction, status, caller_number, destination_number, caller_name, purpose, listing_id, deal_id, assigned_to, summary, sentiment, qualification_score, started_at, ended_at, duration_seconds, transferred_to, created_at, listings(id, business_name, listing_ref), appointments(id, title, starts_at)')
    .eq('agency_id', agencyId)
    .gte('started_at', new Date(Date.now() - hours * 3600000).toISOString())
    .order('started_at', { ascending: false })
    .limit(200)

  if (status !== 'all') query = query.eq('status', status)

  const { data, error } = await query
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  // Enrich: reverse-match caller numbers that weren't captured with a name.
  const rows = (data || []) as any[]
  const enriched = []
  for (const row of rows) {
    let callerName = row.caller_name
    let matched = false
    if (!callerName && row.caller_number) {
      const identity = await matchCaller(agencyId, row.caller_number)
      if (identity.matched) {
        callerName = identity.name || null
        matched = true
      }
    }
    enriched.push({
      ...row,
      caller_name: callerName,
      caller_matched: matched || !!row.caller_name,
    })
  }

  // Voice intake: attach transcript segments when requested (studio pull).
  if (includeTranscripts && enriched.length > 0) {
    const ids = enriched.map((c) => c.id)
    const { data: segs, error: segErr } = await db
      .from('call_transcripts')
      .select('call_session_id, sequence, speaker, content')
      .in('call_session_id', ids)
      .order('sequence', { ascending: true })
    if (!segErr && segs) {
      const byCall = new Map<string, any[]>()
      for (const s of segs) {
        const list = byCall.get(s.call_session_id) || []
        list.push(s)
        byCall.set(s.call_session_id, list)
      }
      for (const c of enriched) {
        c.transcripts = byCall.get(c.id) || []
      }
    }
  }

  return NextResponse.json({ ok: true, calls: enriched })
}

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, unauthorizedResponse } from '@/lib/supabase/auth'
import { fetchVisitorPaths } from '@/lib/visitorIntent'

export const runtime = 'nodejs'

/**
 * GET /api/intelligence/visitor-paths
 * Broker-gated: returns per-visitor anonymous journeys — which listings each
 * visitor viewed, how often, how recently — ranked by a recency-weighted
 * intent score. The \"hot anonymous buyer\" view: brokers see the 90% of
 * buyers who never register, as ranked paths instead of raw counts.
 */
export async function GET(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const authenticated = await authenticateProfileRequest(req)
  if (!authenticated) return unauthorizedResponse()

  const paths = await fetchVisitorPaths()
  return NextResponse.json({ ok: true, paths })
}

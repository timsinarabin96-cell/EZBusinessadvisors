import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, canManageAgency, forbiddenResponse, unauthorizedResponse } from '@/lib/supabase/auth'
import { getBrokerVideo, setBrokerVideo } from '@/lib/brokerVideos'

export const runtime = 'nodejs'

/**
 * /api/professionals/video — broker intro videos (DDL-free, platform_settings).
 *
 * GET  ?id=<professionalId> — the professional's intro video URL.
 * POST { id, url } — set (or clear with '') the intro video. Agency-scoped:
 *      the caller must manage the agency that owns the professional.
 */
export async function GET(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const authenticated = await authenticateProfileRequest(req)
  if (!authenticated) return unauthorizedResponse()

  const id = req.nextUrl.searchParams.get('id') || ''
  if (!id) return NextResponse.json({ ok: false, error: 'id is required' }, { status: 400 })

  const { data: pro } = await db.from('deal_professionals').select('agency_id').eq('id', id).maybeSingle()
  if (!pro) return NextResponse.json({ ok: false, error: 'Professional not found' }, { status: 404 })
  if (!canManageAgency(authenticated, pro.agency_id)) return forbiddenResponse()

  const url = await getBrokerVideo(id)
  return NextResponse.json({ ok: true, url })
}

export async function POST(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const authenticated = await authenticateProfileRequest(req)
  if (!authenticated) return unauthorizedResponse()

  const body = await req.json().catch(() => ({}))
  const id = String(body?.id || '')
  const url = String(body?.url || '')
  if (!id) return NextResponse.json({ ok: false, error: 'id is required' }, { status: 400 })

  const { data: pro } = await db.from('deal_professionals').select('agency_id').eq('id', id).maybeSingle()
  if (!pro) return NextResponse.json({ ok: false, error: 'Professional not found' }, { status: 404 })
  if (!canManageAgency(authenticated, pro.agency_id)) return forbiddenResponse()

  const result = await setBrokerVideo(id, url)
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 500 })
  return NextResponse.json({ ok: true })
}

/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import JSZip from 'jszip'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SVC_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SVC_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const SVC = SVC_URL && SVC_KEY ? createClient(SVC_URL, SVC_KEY, { auth: { persistSession: false } }) : null
const BUCKET = 'financial_docs'

// =============================================================================
// /api/data-rooms/export — ZIP the whole deal room.
// -----------------------------------------------------------------------------
// One click exports every file (folders preserved) as a ZIP, so the broker can
// hand the buyer's lender/attorney the full package. Auth mirrors the room API:
//   * Broker/agent   → Supabase session (Authorization header)
//   * Buyer/seller   → portal token (?dealId=…&token=…)
// Every export is logged to data_room_activities (audit trail).
// =============================================================================

async function resolveActor(req: NextRequest, dealId: string) {
  const token = req.nextUrl.searchParams.get('token') || ''
  if (token) {
    const { data: access } = await SVC!
      .from('client_portal_access')
      .select('client_name, client_email')
      .eq('deal_id', dealId)
      .eq('token', token)
      .eq('status', 'active')
      .maybeSingle()
    if (!access) return null
    return { email: access.client_email || access.client_name || 'portal client', userId: null }
  }
  const auth = req.headers.get('authorization') || ''
  if (!auth.startsWith('Bearer ')) return null
  const { data: user, error } = await SVC!.auth.getUser(auth.slice(7))
  if (error || !user?.user) return null
  return { email: user.user.email || user.user.id, userId: user.user.id }
}

export async function GET(req: NextRequest) {
  const dealId = req.nextUrl.searchParams.get('dealId') || ''
  if (!dealId) return NextResponse.json({ ok: false, error: 'dealId is required' }, { status: 400 })
  if (!SVC) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  const actor = await resolveActor(req, dealId)
  if (!actor) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

  // Room for this deal (or its listing).
  const { data: deal } = await SVC.from('deals').select('id, listing_id, title').eq('id', dealId).maybeSingle()
  const listingId = (deal as { listing_id?: string | null } | null)?.listing_id || null
  const dealTitle = (deal as { title?: string | null } | null)?.title || 'deal'

  let roomId: string | null = null
  if (listingId) {
    const { data: byListing } = await SVC
      .from('data_rooms').select('id').eq('listing_id', listingId).eq('status', 'active')
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (byListing?.id) roomId = byListing.id
  }
  if (!roomId) {
    const { data: byDeal } = await SVC.from('data_rooms').select('id').eq('deal_id', dealId).eq('status', 'active').maybeSingle()
    if (byDeal?.id) roomId = byDeal.id
  }
  if (!roomId) return NextResponse.json({ ok: false, error: 'No data room for this deal yet' }, { status: 404 })

  const [filesRes, foldersRes] = await Promise.all([
    SVC.from('data_room_files').select('*').eq('data_room_id', roomId).eq('is_deleted', false),
    SVC.from('data_room_folders').select('*').eq('data_room_id', roomId).eq('is_deleted', false),
  ])
  const files = filesRes.data || []
  const folders = foldersRes.data || []
  const folderName = (id: string | null) => folders.find((f) => f.id === id)?.name || ''

  const zip = new JSZip()
  let added = 0
  for (const f of files) {
    try {
      const { data: blob, error } = await SVC.storage.from(BUCKET).download(f.storage_path)
      if (error || !blob) continue
      const bytes = new Uint8Array(await blob.arrayBuffer())
      const dir = folderName(f.folder_id)
      const safeName = String(f.file_name || 'file').replace(/[^\w.\- ]+/g, '_')
      const target = dir ? `${dir}/${safeName}` : safeName
      zip.file(target, bytes)
      added++
    } catch {
      // skip unreadable file — the rest of the room still exports
    }
  }

  if (added === 0) return NextResponse.json({ ok: false, error: 'No files in the room to export' }, { status: 404 })

  // Manifest so the recipient knows who exported it and when.
  zip.file('EXPORT_MANIFEST.txt', [
    `Concord Deal Platform — Data Room Export`,
    `Deal: ${dealTitle}`,
    `Exported by: ${actor.email}`,
    `Exported at: ${new Date().toISOString()}`,
    `Files: ${added}`,
    '',
    'Files in this ZIP are confidential and shared for due-diligence purposes only.',
  ].join('\n'))

  // Audit log.
  await SVC.from('data_room_activities').insert({
    data_room_id: roomId,
    action: 'downloaded',
    details: `Exported ZIP with ${added} file(s)`,
    user_email: actor.email,
  })

  const buf = await zip.generateAsync({ type: 'nodebuffer' })
  const safeDeal = String(dealTitle).replace(/[^\w.\- ]+/g, '_').replace(/\s+/g, '-').slice(0, 60) || 'deal'
  return new NextResponse(Buffer.from(buf), {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="data-room-${safeDeal}.zip"`,
      'Cache-Control': 'no-store',
    },
  })
}

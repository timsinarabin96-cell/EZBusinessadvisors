/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { authenticateProfileRequest, unauthorizedResponse } from '@/lib/supabase/auth'
import {
  ensureDataRoom, snapshotRoom, logActivity, kindFromMime,
} from '@/lib/dataRoomServer'
import { notify } from '@/lib/email'

// =============================================================================
// Deal Data Room API — Dropbox-style shared folder per deal.
// -----------------------------------------------------------------------------
// One room per deal: folders + files + version history + activity feed + soft
// delete. Every party can upload / rename / delete:
//   * Brokers & agents   → Supabase session (Authorization header)
//   * Buyers & sellers   → portal token (?dealId=&token=) — the same token
//                          they use for /portal/[dealId]/[token]
// Files land in the `financial_docs` storage bucket; rows in data_room_files.
// =============================================================================

export const runtime = 'nodejs'

const SVC = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY || 'NO_KEY', {
      auth: { persistSession: false },
    })
  : null

const BUCKET = 'financial_docs'

/** Validate portal token (buyer/seller access) — same check as /api/portal. */
async function resolvePortalAccess(dealId: string, token: string) {
  if (!SVC) return null
  const { data } = await SVC.from('client_portal_access')
    .select('*').eq('deal_id', dealId).eq('token', token).eq('status', 'active').maybeSingle()
  return data || null
}

/**
 * GET /api/data-rooms/room?dealId=***&token=***
 * Returns the room snapshot (folders, files, activities). Creates the room
 * on first use. Auth: session OR portal token.
 */
export async function GET(req: NextRequest) {
  if (!SVC) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const dealId = req.nextUrl.searchParams.get('dealId') || ''
  const token = req.nextUrl.searchParams.get('token') || ''
  if (!dealId) return NextResponse.json({ ok: false, error: 'dealId is required' }, { status: 400 })

  // Auth: portal token OR authenticated session.
  let actor: { userId: string | null; email: string | null } = { userId: null, email: null }
  if (token) {
    const access = await resolvePortalAccess(dealId, token)
    if (!access) return NextResponse.json({ ok: false, error: 'invalid or revoked link' }, { status: 404 })
    actor = { userId: null, email: access.client_email || access.client_name || 'portal client' }
  } else {
    const authenticated = await authenticateProfileRequest(req)
    if (!authenticated) return unauthorizedResponse()
    // Session path MUST verify the caller belongs to the deal's agency —
    // otherwise any signed-in user could read/write any agency's data room.
    const { data: deal } = await SVC.from('deals').select('id, agency_id').eq('id', dealId).maybeSingle()
    const dealAgency = (deal as { agency_id?: string | null } | null)?.agency_id
    if (!dealAgency) return NextResponse.json({ ok: false, error: 'Deal not found' }, { status: 404 })
    if (!authenticated.memberships.some((m) => m.agency_id === dealAgency)) {
      return NextResponse.json({ ok: false, error: 'Not a member of this deal\'s agency' }, { status: 403 })
    }
    actor = { userId: authenticated.user.id, email: authenticated.user.email || null }
  }

  const room = await ensureDataRoom(SVC, dealId)
  if (!room) return NextResponse.json({ ok: false, error: 'could not create data room' }, { status: 500 })
  const snapshot = await snapshotRoom(SVC, room.id)
  return NextResponse.json({ ok: true, ...snapshot, actor })
}

/**
 * POST /api/data-rooms/room?dealId=***&token=***
 * Multipart: upload a file. JSON: { action: 'create_folder' | 'rename_file' |
 * 'rename_folder' | 'delete_file' | 'delete_folder', ... }
 */
export async function POST(req: NextRequest) {
  if (!SVC) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const dealId = req.nextUrl.searchParams.get('dealId') || ''
  const token = req.nextUrl.searchParams.get('token') || ''
  if (!dealId) return NextResponse.json({ ok: false, error: 'dealId is required' }, { status: 400 })

  let actor: { userId: string | null; email: string | null } = { userId: null, email: null }
  if (token) {
    const access = await resolvePortalAccess(dealId, token)
    if (!access) return NextResponse.json({ ok: false, error: 'invalid or revoked link' }, { status: 404 })
    actor = { userId: null, email: access.client_email || access.client_name || 'portal client' }
  } else {
    const authenticated = await authenticateProfileRequest(req)
    if (!authenticated) return unauthorizedResponse()
    // Same agency-membership gate as GET (cross-agency data room protection).
    const { data: deal } = await SVC.from('deals').select('id, agency_id').eq('id', dealId).maybeSingle()
    const dealAgency = (deal as { agency_id?: string | null } | null)?.agency_id
    if (!dealAgency) return NextResponse.json({ ok: false, error: 'Deal not found' }, { status: 404 })
    if (!authenticated.memberships.some((m) => m.agency_id === dealAgency)) {
      return NextResponse.json({ ok: false, error: 'Not a member of this deal\'s agency' }, { status: 403 })
    }
    actor = { userId: authenticated.user.id, email: authenticated.user.email || null }
  }

  const room = await ensureDataRoom(SVC, dealId)
  if (!room) return NextResponse.json({ ok: false, error: 'could not create data room' }, { status: 500 })

  const contentType = req.headers.get('content-type') || ''
  // --- File upload (multipart) -------------------------------------------------
  if (contentType.includes('multipart/form-data')) {
    const form = await req.formData().catch(() => null)
    const file = form?.get('file')
    const folderId = String(form?.get('folderId') || '') || null
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ ok: false, error: 'no file' }, { status: 400 })
    }
    // SECURITY: hard caps on upload size (50 MB) and file type — prevents
    // storage abuse and malware/HTML payloads served from our domain.
    const MAX_BYTES = 50 * 1024 * 1024
    const ALLOWED_TYPES = new Set([
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/tiff',
      'text/plain', 'text/csv',
      'application/zip',
    ])
    if (file.size > MAX_BYTES) return NextResponse.json({ ok: false, error: 'File too large (max 50 MB).' }, { status: 413 })
    if (!ALLOWED_TYPES.has(file.type)) return NextResponse.json({ ok: false, error: 'File type not allowed.' }, { status: 415 })
    try {
      const clean = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `data-room/${room.id}/${Date.now()}-${clean}`
      const { error: upErr } = await SVC.storage.from(BUCKET).upload(path, file, {
        contentType: file.type || 'application/octet-stream',
      })
      if (upErr) return NextResponse.json({ ok: false, error: 'upload failed: ' + upErr.message }, { status: 500 })
      const url = SVC.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
      const { data: row, error: insErr } = await SVC.from('data_room_files').insert({
        data_room_id: room.id,
        folder_id: folderId,
        file_name: file.name,
        file_url: url,
        storage_path: path,
        file_type: file.type || null,
        file_size: file.size,
        file_kind: kindFromMime(file.type || '', file.name),
        uploaded_by: actor.userId,
        version: 1,
      }).select().single()
      if (insErr) return NextResponse.json({ ok: false, error: 'record failed: ' + insErr.message }, { status: 500 })
      await logActivity(SVC, room.id, actor.userId, actor.email, 'uploaded', `Uploaded ${file.name}`)

      // What-changed alerts — notify every invited party (buyers/sellers/
      // agents) that a document was added or replaced in their deal room.
      void (async () => {
        try {
          const [buyersRes, sharesRes] = await Promise.all([
            SVC.from('data_room_buyers').select('buyer_email').eq('data_room_id', room.id).eq('status', 'active'),
            SVC.from('data_room_shares').select('shared_with').eq('data_room_id', room.id).eq('status', 'pending'),
          ])
          const emails = new Set<string>()
          for (const b of buyersRes.data || []) if (b.buyer_email) emails.add(b.buyer_email)
          for (const s of sharesRes.data || []) if (s.shared_with) emails.add(s.shared_with)
          const portalUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://concord-deal-platform.vercel.app'}/portal/${dealId}/${token || ''}`
          for (const email of emails) {
            await notify('data_room_change', email, {
              fileName: file.name,
              action: 'A document was added to the deal room',
              roomName: room.name || 'your deal room',
              portalUrl: token ? portalUrl : undefined,
            })
          }
        } catch {
          // alerts never break the upload
        }
      })()

      return NextResponse.json({ ok: true, file: row })
    } catch (e) {
      return NextResponse.json({ ok: false, error: 'upload error: ' + (e as Error).message }, { status: 500 })
    }
  }

  // --- JSON actions -------------------------------------------------------------
  const body = await req.json().catch(() => ({}))
  const action = String(body.action || '')

  if (action === 'create_folder') {
    const name = String(body.name || '').trim()
    if (!name) return NextResponse.json({ ok: false, error: 'name is required' }, { status: 400 })
    const { data: row, error } = await SVC.from('data_room_folders').insert({
      data_room_id: room.id, name, order: 99,
    }).select().single()
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    await logActivity(SVC, room.id, actor.userId, actor.email, 'created', `Created folder ${name}`)
    return NextResponse.json({ ok: true, folder: row })
  }

  if (action === 'rename_file') {
    const fileId = String(body.fileId || '')
    const name = String(body.name || '').trim()
    if (!fileId || !name) return NextResponse.json({ ok: false, error: 'fileId and name are required' }, { status: 400 })
    const { error } = await SVC.from('data_room_files').update({ file_name: name, updated_at: new Date().toISOString() }).eq('id', fileId).eq('data_room_id', room.id)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    await logActivity(SVC, room.id, actor.userId, actor.email, 'renamed', `Renamed file to ${name}`)
    return NextResponse.json({ ok: true })
  }

  if (action === 'rename_folder') {
    const folderId = String(body.folderId || '')
    const name = String(body.name || '').trim()
    if (!folderId || !name) return NextResponse.json({ ok: false, error: 'folderId and name are required' }, { status: 400 })
    const { error } = await SVC.from('data_room_folders').update({ name, updated_at: new Date().toISOString() }).eq('id', folderId).eq('data_room_id', room.id)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    await logActivity(SVC, room.id, actor.userId, actor.email, 'renamed', `Renamed folder to ${name}`)
    return NextResponse.json({ ok: true })
  }

  if (action === 'delete_file') {
    const fileId = String(body.fileId || '')
    if (!fileId) return NextResponse.json({ ok: false, error: 'fileId is required' }, { status: 400 })
    const { data: file } = await SVC.from('data_room_files').select('file_name').eq('id', fileId).eq('data_room_id', room.id).maybeSingle()
    const { error } = await SVC.from('data_room_files').update({
      is_deleted: true, deleted_at: new Date().toISOString(), deleted_by: actor.userId,
    }).eq('id', fileId).eq('data_room_id', room.id)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    await logActivity(SVC, room.id, actor.userId, actor.email, 'deleted', `Deleted ${(file as { file_name?: string } | null)?.file_name || 'file'}`)
    return NextResponse.json({ ok: true })
  }

  if (action === 'delete_folder') {
    const folderId = String(body.folderId || '')
    if (!folderId) return NextResponse.json({ ok: false, error: 'folderId is required' }, { status: 400 })
    const { error } = await SVC.from('data_room_folders').delete().eq('id', folderId).eq('data_room_id', room.id)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    await logActivity(SVC, room.id, actor.userId, actor.email, 'deleted', 'Deleted a folder')
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ ok: false, error: 'unknown action' }, { status: 400 })
}

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
  visibleAccessLevels, canAccessDealRoom, type RoomAccessLevel, type RoomRole,
} from '@/lib/dataRoomServer'
import { notify } from '@/lib/email'
import { trainingGateResponse } from '@/lib/trainingGate'

// =============================================================================
// Deal Room API — Dropbox-style shared workspace per deal (agent+buyer+seller).
// -----------------------------------------------------------------------------
// One room per deal: folders + files + version history + activity feed + soft
// delete + ROLE-BASED access. Folders/files carry an access_level:
//   all_parties (everyone) | buyer_only | seller_only | agent_only
// Role resolution:
//   * Brokers & agents   → Supabase session (Authorization header) → role 'agent'
//   * Buyers & sellers   → portal token (?dealId=&token=) → role from
//                          client_portal_access.party_type ('buyer'|'seller')
// Agents see everything; buyers see all_parties + buyer_only; sellers see
// all_parties + seller_only. Files land in the `financial_docs` storage
// bucket; rows in data_room_files.
// =============================================================================

export const runtime = 'nodejs'

const SVC = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY || 'NO_KEY', {
      auth: { persistSession: false },
    })
  : null

const BUCKET = 'financial_docs'

const ACCESS_LEVELS: RoomAccessLevel[] = ['all_parties', 'buyer_only', 'seller_only', 'agent_only']

/** Validate portal token (buyer/seller access) — same check as /api/portal. */
async function resolvePortalAccess(dealId: string, token: string) {
  if (!SVC) return null
  const { data } = await SVC.from('client_portal_access')
    .select('*').eq('deal_id', dealId).eq('token', token).eq('status', 'active').maybeSingle()
  return data || null
}

/** Resolve who is calling and which role they play in this deal's room. */
async function resolveActor(req: NextRequest, dealId: string, token: string) {
  if (token) {
    const access = await resolvePortalAccess(dealId, token)
    if (!access) return { ok: false as const, status: 404, error: 'invalid or revoked link' }
    const role: RoomRole = access.party_type === 'buyer' ? 'buyer' : 'seller'
    return {
      ok: true as const,
      actor: { userId: null as string | null, email: access.client_email || access.client_name || 'portal client' },
      role,
    }
  }
  const authenticated = await authenticateProfileRequest(req)
  if (!authenticated) return { ok: false as const, status: 401, error: 'unauthorized' }
  // Listing-style isolation: only the deal's owning agent (listings.agent_id)
  // or an agency admin/owner may open this deal room — NOT every agency member.
  if (!(await canAccessDealRoom(SVC!, dealId, authenticated.user, authenticated.memberships))) {
    return { ok: false as const, status: 403, error: 'Not authorized for this deal room' }
  }
  return {
    ok: true as const,
    actor: { userId: authenticated.user.id, email: authenticated.user.email || null },
    role: 'agent' as RoomRole,
  }
}

/** Guard: a folder may only receive files/folders the caller's role can see. */
function allowedAccess(role: RoomRole, level: string | undefined | null, fallback: RoomAccessLevel): RoomAccessLevel {
  const wanted = (ACCESS_LEVELS.includes(level as RoomAccessLevel) ? level : fallback) as RoomAccessLevel
  return visibleAccessLevels(role).includes(wanted) ? wanted : fallback
}

/**
 * GET /api/data-rooms/room?dealId=***&token=***
 * Returns the role-aware room snapshot (folders, files, trash, activities).
 * Creates the room (with the DD template) on first use. Auth: session OR
 * portal token.
 */
export async function GET(req: NextRequest) {
  if (!SVC) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const dealId = req.nextUrl.searchParams.get('dealId') || ''
  const token = req.nextUrl.searchParams.get('token') || ''
  if (!dealId) return NextResponse.json({ ok: false, error: 'dealId is required' }, { status: 400 })

  const resolved = await resolveActor(req, dealId, token)
  if (!resolved.ok) return NextResponse.json({ ok: false, error: resolved.error }, { status: resolved.status })

  const room = await ensureDataRoom(SVC, dealId)
  if (!room) return NextResponse.json({ ok: false, error: 'could not create deal room' }, { status: 500 })
  const snapshot = await snapshotRoom(SVC, room.id, resolved.role)
  return NextResponse.json({ ok: true, ...snapshot, actor: resolved.actor, role: resolved.role })
}

/**
 * POST /api/data-rooms/room?dealId=***&token=***
 * Multipart: upload a file. JSON: { action, ... }:
 *   create_folder { name, accessLevel? }      — everyone (defaults all_parties)
 *   rename_file / rename_folder { id, name }
 *   delete_file / delete_folder { id }        — soft delete (folder delete also
 *                                               clears file folder_id)
 *   restore_file { fileId }                   — agents only
 *   move_file { fileId, folderId }            — into a visible folder (null = root)
 *   set_file_access { fileId, accessLevel }   — agents only
 *   set_folder_access { folderId, accessLevel } — agents only
 */
export async function POST(req: NextRequest) {
  if (!SVC) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const dealId = req.nextUrl.searchParams.get('dealId') || ''
  const token = req.nextUrl.searchParams.get('token') || ''
  if (!dealId) return NextResponse.json({ ok: false, error: 'dealId is required' }, { status: 400 })

  const resolved = await resolveActor(req, dealId, token)
  if (!resolved.ok) return NextResponse.json({ ok: false, error: resolved.error }, { status: resolved.status })
  const { actor, role } = resolved

  if (!token && role === 'agent') {
    const auth = await authenticateProfileRequest(req)
    const { data: deal } = await SVC.from('deals').select('agency_id, listings(agency_id)').eq('id', dealId).maybeSingle()
    const agencyId = (deal as any)?.agency_id || (deal as any)?.listings?.agency_id
    if (auth && agencyId) {
      const trainingBlock = await trainingGateResponse({
        database: SVC, auth, agencyId,
        body: { trainingOverrideReason: req.nextUrl.searchParams.get('trainingOverrideReason') },
        action: 'data_room_write', targetType: 'deal', targetId: dealId,
      })
      if (trainingBlock) return trainingBlock
    }
  }

  const room = await ensureDataRoom(SVC, dealId)
  if (!room) return NextResponse.json({ ok: false, error: 'could not create deal room' }, { status: 500 })

  const contentType = req.headers.get('content-type') || ''
  // --- File upload (multipart) -------------------------------------------------
  if (contentType.includes('multipart/form-data')) {
    const form = await req.formData().catch(() => null)
    const file = form?.get('file')
    const folderId = String(form?.get('folderId') || '') || null
    const accessLevel = allowedAccess(role, String(form?.get('accessLevel') || ''), role === 'agent' ? 'all_parties' : 'all_parties')
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ ok: false, error: 'no file' }, { status: 400 })
    }

    // #15 (spec §3 permissions): BUYER uploads are allowed ONLY during the
    // due-diligence stage and are subject to agent review. Agents upload
    // freely; sellers upload for their own listing.
    if (role === 'buyer') {
      const { data: deal } = await SVC.from('deals').select('status').eq('id', dealId).maybeSingle()
      const dealStatus = (deal as { status?: string } | null)?.status
      if (dealStatus !== 'due_diligence') {
        return NextResponse.json({ ok: false, error: 'Buyer uploads are enabled during due diligence only.' }, { status: 403 })
      }
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

    // Portal users may only drop files into folders their role can see.
    if (folderId) {
      const { data: folder } = await SVC.from('data_room_folders').select('access_level').eq('id', folderId).eq('data_room_id', room.id).maybeSingle()
      if (!folder) return NextResponse.json({ ok: false, error: 'Folder not found' }, { status: 404 })
      const folderAccess = (folder as { access_level?: string }).access_level || 'all_parties'
      if (!visibleAccessLevels(role).includes(folderAccess as RoomAccessLevel)) {
        return NextResponse.json({ ok: false, error: 'You cannot upload into that folder' }, { status: 403 })
      }
    }

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
        uploaded_by_role: role,
        access_level: accessLevel,
        version: 1,
      }).select().single()
      if (insErr) return NextResponse.json({ ok: false, error: 'record failed: ' + insErr.message }, { status: 500 })
      await logActivity(SVC, room.id, actor.userId, actor.email, 'uploaded', `Uploaded ${file.name}`)

      // What-changed alerts — notify every invited party (buyers/sellers/
      // agents) that a document was added to their deal room.
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
    const accessLevel = allowedAccess(role, String(body.accessLevel || ''), 'all_parties')
    const { data: row, error } = await SVC.from('data_room_folders').insert({
      data_room_id: room.id, name, order: 99, access_level: accessLevel,
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
    // Files in that folder stay in the room but lose their folder (root).
    await SVC.from('data_room_files').update({ folder_id: null }).eq('folder_id', folderId).eq('data_room_id', room.id)
    await logActivity(SVC, room.id, actor.userId, actor.email, 'deleted', 'Deleted a folder')
    return NextResponse.json({ ok: true })
  }

  if (action === 'restore_file') {
    if (role !== 'agent') return NextResponse.json({ ok: false, error: 'Agents only' }, { status: 403 })
    const fileId = String(body.fileId || '')
    if (!fileId) return NextResponse.json({ ok: false, error: 'fileId is required' }, { status: 400 })
    const { data: file } = await SVC.from('data_room_files').select('file_name').eq('id', fileId).eq('data_room_id', room.id).maybeSingle()
    const { error } = await SVC.from('data_room_files').update({ is_deleted: false, deleted_at: null, deleted_by: null }).eq('id', fileId).eq('data_room_id', room.id)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    await logActivity(SVC, room.id, actor.userId, actor.email, 'restored', `Restored ${(file as { file_name?: string } | null)?.file_name || 'file'}`)
    return NextResponse.json({ ok: true })
  }

  if (action === 'move_file') {
    const fileId = String(body.fileId || '')
    const folderId = String(body.folderId || '') || null
    if (!fileId) return NextResponse.json({ ok: false, error: 'fileId is required' }, { status: 400 })
    if (folderId) {
      const { data: folder } = await SVC.from('data_room_folders').select('access_level').eq('id', folderId).eq('data_room_id', room.id).maybeSingle()
      if (!folder) return NextResponse.json({ ok: false, error: 'Folder not found' }, { status: 404 })
      if (!visibleAccessLevels(role).includes(((folder as { access_level?: string }).access_level || 'all_parties') as RoomAccessLevel)) {
        return NextResponse.json({ ok: false, error: 'You cannot move files into that folder' }, { status: 403 })
      }
    }
    const { data: file } = await SVC.from('data_room_files').select('file_name').eq('id', fileId).eq('data_room_id', room.id).maybeSingle()
    const { error } = await SVC.from('data_room_files').update({ folder_id: folderId, updated_at: new Date().toISOString() }).eq('id', fileId).eq('data_room_id', room.id)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    await logActivity(SVC, room.id, actor.userId, actor.email, 'moved', `Moved ${(file as { file_name?: string } | null)?.file_name || 'file'}`)
    return NextResponse.json({ ok: true })
  }

  if (action === 'set_file_access') {
    if (role !== 'agent') return NextResponse.json({ ok: false, error: 'Agents only' }, { status: 403 })
    const fileId = String(body.fileId || '')
    const level = String(body.accessLevel || '') as RoomAccessLevel
    if (!fileId || !ACCESS_LEVELS.includes(level)) return NextResponse.json({ ok: false, error: 'fileId and a valid accessLevel are required' }, { status: 400 })
    const { error } = await SVC.from('data_room_files').update({ access_level: level, updated_at: new Date().toISOString() }).eq('id', fileId).eq('data_room_id', room.id)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    await logActivity(SVC, room.id, actor.userId, actor.email, 'updated', `Changed file access to ${level}`)
    return NextResponse.json({ ok: true })
  }

  if (action === 'set_folder_access') {
    if (role !== 'agent') return NextResponse.json({ ok: false, error: 'Agents only' }, { status: 403 })
    const folderId = String(body.folderId || '')
    const level = String(body.accessLevel || '') as RoomAccessLevel
    if (!folderId || !ACCESS_LEVELS.includes(level)) return NextResponse.json({ ok: false, error: 'folderId and a valid accessLevel are required' }, { status: 400 })
    const { error } = await SVC.from('data_room_folders').update({ access_level: level, updated_at: new Date().toISOString() }).eq('id', folderId).eq('data_room_id', room.id)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    await logActivity(SVC, room.id, actor.userId, actor.email, 'updated', `Changed folder access to ${level}`)
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ ok: false, error: 'unknown action' }, { status: 400 })
}

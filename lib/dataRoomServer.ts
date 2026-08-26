/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Deal Data Room — server-side helpers (service role, never in the browser)
// -----------------------------------------------------------------------------
// One Dropbox-style room per deal. Folders + files + version history +
// activity feed + soft delete (recycle bin) — all tables live in
// sql/data_room_schema.sql. This module provides get-or-create, snapshots,
// folder/file mutations and activity logging used by the API routes.
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js'

export const DEFAULT_FOLDERS = ['Financials', 'Legal & Contracts', 'Due Diligence', 'Marketing', 'Other']

export interface DataRoomSnapshot {
  room: {
    id: string
    deal_id: string | null
    listing_id: string | null
    name: string
    description: string | null
    status: string
  } | null
  folders: { id: string; name: string; icon: string | null; order: number }[]
  files: {
    id: string
    folder_id: string | null
    file_name: string
    file_url: string
    file_kind: string | null
    file_size: number | null
    version: number
    notes: string | null
    uploaded_at: string
    uploaded_by_name: string | null
  }[]
  activities: { id: string; action: string; details: string | null; user_email: string | null; created_at: string }[]
}

/** Resolve the room for a deal, creating it (with default folders) on first use. */
export async function ensureDataRoom(db: SupabaseClient, dealId: string) {
  // Existing room for this deal (or its listing)?
  const { data: deal } = await db.from('deals').select('id, listing_id').eq('id', dealId).maybeSingle()
  const listingId = (deal as { listing_id?: string | null } | null)?.listing_id || null

  let roomId: string | null = null
  if (listingId) {
    const { data: byListing } = await db
      .from('data_rooms')
      .select('id, deal_id, listing_id, name, description, status')
      .eq('listing_id', listingId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (byListing?.id) roomId = byListing.id
  }
  if (!roomId) {
    const { data: byDeal } = await db
      .from('data_rooms')
      .select('id, deal_id, listing_id, name, description, status')
      .eq('deal_id', dealId)
      .eq('status', 'active')
      .maybeSingle()
    if (byDeal?.id) roomId = byDeal.id
  }

  let room: { id: string; deal_id: string | null; listing_id: string | null; name: string; description: string | null; status: string } | null = null

  if (roomId) {
    const { data } = await db.from('data_rooms').select('id, deal_id, listing_id, name, description, status').eq('id', roomId).maybeSingle()
    room = (data as typeof room) || null
  }

  if (!room) {
    // Get a friendly name from the listing when available.
    let name = 'Deal Data Room'
    if (listingId) {
      const { data: listing } = await db.from('listings').select('business_name').eq('id', listingId).maybeSingle()
      const biz = (listing as { business_name?: string | null } | null)?.business_name
      if (biz) name = `${biz} — Data Room`
    }
    const { data: created, error } = await db
      .from('data_rooms')
      .insert({ deal_id: dealId, listing_id: listingId, name, status: 'active' })
      .select('id, deal_id, listing_id, name, description, status')
      .single()
    if (error) return null
    room = created as typeof room

    // Seed default folders (idempotent guard).
    const { data: existing } = await db.from('data_room_folders').select('id').eq('data_room_id', room.id).limit(1)
    if (!existing || existing.length === 0) {
      await db.from('data_room_folders').insert(
        DEFAULT_FOLDERS.map((name, i) => ({ data_room_id: room.id, name, icon: folderIcon(name), order: i })),
      )
    }
    await logActivity(db, room.id, null, null, 'created', 'Data room created')
  }

  return room
}

/** Full snapshot for rendering the Dropbox-style UI. */
export async function snapshotRoom(db: SupabaseClient, roomId: string): Promise<DataRoomSnapshot> {
  const { data: room } = await db.from('data_rooms').select('id, deal_id, listing_id, name, description, status').eq('id', roomId).maybeSingle()
  const { data: folders } = await db
    .from('data_room_folders')
    .select('id, name, icon, order')
    .eq('data_room_id', roomId)
    .order('order', { ascending: true })
  const { data: files } = await db
    .from('data_room_files')
    .select('id, folder_id, file_name, file_url, file_kind, file_size, version, notes, uploaded_at, uploaded_by')
    .eq('data_room_id', roomId)
    .eq('is_deleted', false)
    .order('uploaded_at', { ascending: false })
  const { data: activities } = await db
    .from('data_room_activities')
    .select('id, action, details, user_email, created_at')
    .eq('data_room_id', roomId)
    .order('created_at', { ascending: false })
    .limit(30)

  const filesWithNames = await Promise.all(
    ((files || []) as any[]).map(async (f) => {
      let uploaded_by_name: string | null = null
      if (f.uploaded_by) {
        const { data: p } = await db.from('profiles').select('full_name').eq('id', f.uploaded_by).maybeSingle()
        uploaded_by_name = (p as { full_name?: string | null } | null)?.full_name || null
      }
      return { ...f, uploaded_by_name }
    }),
  )

  return {
    room: (room as DataRoomSnapshot['room']) || null,
    folders: (folders || []) as DataRoomSnapshot['folders'],
    files: filesWithNames as DataRoomSnapshot['files'],
    activities: (activities || []) as DataRoomSnapshot['activities'],
  }
}

export async function logActivity(
  db: SupabaseClient,
  roomId: string,
  userId: string | null,
  userEmail: string | null,
  action: string,
  details: string | null,
) {
  await db.from('data_room_activities').insert({
    data_room_id: roomId,
    user_id: userId || null,
    user_email: userEmail || null,
    action,
    details,
  }).maybeSingle()
}

export function folderIcon(name: string): string {
  const map: Record<string, string> = {
    financials: '💰', legal: '⚖️', contract: '📄', diligence: '🔍', marketing: '📣', other: '📁',
  }
  const key = name.toLowerCase()
  for (const [k, icon] of Object.entries(map)) if (key.includes(k)) return icon
  return '📁'
}

export function kindFromMime(mime: string, name: string): string {
  const n = name.toLowerCase()
  if (n.endsWith('.pdf')) return 'pdf'
  if (/\.(xlsx|xls|csv)$/.test(n)) return 'excel'
  if (/\.(docx?|rtf|txt)$/.test(n)) return 'word'
  if (/\.(png|jpe?g|gif|webp|svg)$/.test(n)) return 'image'
  if (mime.startsWith('video/')) return 'video'
  return 'other'
}

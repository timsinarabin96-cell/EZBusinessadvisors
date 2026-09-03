/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Deal Room — server-side helpers (service role, never in the browser)
// -----------------------------------------------------------------------------
// One Dropbox-style Deal Room per deal, shared by agent + buyer + seller.
// Folders + files + version history + activity feed + soft delete + role-based
// access (all_parties | buyer_only | seller_only | agent_only). Tables live in
// sql/data_room_schema.sql + sql/deal_room_phase1.sql. This module provides
// get-or-create (seeding the standard due-diligence template), role-aware
// snapshots, folder/file mutations and activity logging used by the API routes.
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js'

/** Access levels understood by the Deal Room. */
export type RoomAccessLevel = 'all_parties' | 'buyer_only' | 'seller_only' | 'agent_only'
export type RoomRole = 'agent' | 'buyer' | 'seller'

/** Standard due-diligence folder template, seeded on room creation. */
export const DD_TEMPLATE: { name: string; icon: string; access: RoomAccessLevel }[] = [
  { name: 'Financials', icon: '💰', access: 'all_parties' },
  { name: 'Legal', icon: '⚖️', access: 'all_parties' },
  { name: 'Operations', icon: '🏭', access: 'all_parties' },
  { name: 'HR & Employees', icon: '👥', access: 'all_parties' },
  { name: 'Real Estate & Lease', icon: '🏢', access: 'all_parties' },
  { name: 'Insurance', icon: '🛡️', access: 'all_parties' },
  { name: 'Contracts', icon: '📄', access: 'all_parties' },
  { name: 'Tax Returns', icon: '🧾', access: 'all_parties' },
  { name: 'Intellectual Property', icon: '💡', access: 'all_parties' },
  { name: 'Other', icon: '📁', access: 'all_parties' },
  { name: 'Internal (Agent Only)', icon: '🔒', access: 'agent_only' },
]

/** Folders a role may see. Agent sees everything. */
export function visibleAccessLevels(role: RoomRole): RoomAccessLevel[] {
  if (role === 'agent') return ['all_parties', 'buyer_only', 'seller_only', 'agent_only']
  if (role === 'buyer') return ['all_parties', 'buyer_only']
  return ['all_parties', 'seller_only'] // seller
}

/**
 * Listing-style isolation check: is this authenticated user allowed to open
 * the deal room for this deal? Mirrors the listings rule
 *   is_agency_member(agency_id) AND (agent_id = auth.uid() OR is_agency_admin(agency_id))
 * A deal's room belongs to its LISTING's owning agent (listings.agent_id) or
 * an agency admin/owner — NOT every agent in the agency.
 */
export async function canAccessDealRoom(
  db: SupabaseClient,
  dealId: string,
  user: { id: string },
  memberships: { agency_id: string; role: string; is_owner: boolean }[],
): Promise<boolean> {
  const { data: deal } = await db.from('deals').select('id, agency_id, listing_id').eq('id', dealId).maybeSingle()
  const d = deal as { agency_id?: string | null; listing_id?: string | null } | null
  if (!d?.agency_id) return false
  if (!memberships.some((m) => m.agency_id === d.agency_id)) return false

  const isAdmin = memberships.some((m) => m.agency_id === d.agency_id && (m.is_owner || m.role === 'admin'))
  if (isAdmin) return true

  if (d.listing_id) {
    const { data: listing } = await db.from('listings').select('agent_id').eq('id', d.listing_id).maybeSingle()
    const agentId = (listing as { agent_id?: string | null } | null)?.agent_id
    if (agentId && agentId === user.id) return true
  }
  return false
}

export interface RoomFile {
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
  uploaded_by_role: string
  access_level: string
  // Vault lifecycle (boss 08-31 approved schema):
  visibility: 'internal_only' | 'buyer_visible' | 'seller_only'
  stage_tag: 'intake' | 'listing_live' | 'due_diligence' | 'closing'
  source: 'uploaded_by_seller' | 'uploaded_by_agent' | 'uploaded_by_buyer' | 'generated_by_claude'
  claude_check: 'pending' | 'verified' | 'flagged'
  claude_check_reason: string | null
  category: 'legal' | 'financial' | 'due_diligence' | 'buyer_submitted' | 'generated_document' | 'other'
}

export interface DataRoomSnapshot {
  room: {
    id: string
    deal_id: string | null
    listing_id: string | null
    name: string
    description: string | null
    status: string
  } | null
  folders: { id: string; name: string; icon: string | null; order: number; access_level: string }[]
  files: RoomFile[]
  trash: RoomFile[]
  activities: { id: string; action: string; details: string | null; user_email: string | null; created_at: string }[]
}

/** Resolve the room for a deal, creating it (with the DD template) on first use. */
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
    let name = 'Deal Room'
    if (listingId) {
      const { data: listing } = await db.from('listings').select('business_name').eq('id', listingId).maybeSingle()
      const biz = (listing as { business_name?: string | null } | null)?.business_name
      if (biz) name = `${biz} — Deal Room`
    }
    const { data: created, error } = await db
      .from('data_rooms')
      .insert({ deal_id: dealId, listing_id: listingId, name, status: 'active' })
      .select('id, deal_id, listing_id, name, description, status')
      .single()
    if (error) return null
    room = created as typeof room

    // Seed the standard due-diligence template (idempotent guard).
    const { data: existing } = await db.from('data_room_folders').select('id').eq('data_room_id', room.id).limit(1)
    if (!existing || existing.length === 0) {
      await db.from('data_room_folders').insert(
        DD_TEMPLATE.map((f, i) => ({ data_room_id: room.id, name: f.name, icon: f.icon, order: i, access_level: f.access })),
      )
    }
    await logActivity(db, room.id, null, null, 'created', 'Deal Room created with due-diligence template')
  }

  return room
}

/**
 * Full snapshot for rendering the Deal Room UI, filtered by role.
 * Agents see everything; buyers see all_parties + buyer_only; sellers see
 * all_parties + seller_only. Deleted files are returned in `trash` (agents
 * only) so the UI can offer restore.
 */
export async function snapshotRoom(db: SupabaseClient, roomId: string, role: RoomRole = 'agent'): Promise<DataRoomSnapshot> {
  const allowed = visibleAccessLevels(role)
  const { data: room } = await db.from('data_rooms').select('id, deal_id, listing_id, name, description, status').eq('id', roomId).maybeSingle()
  const { data: folders } = await db
    .from('data_room_folders')
    .select('id, name, icon, order, access_level')
    .eq('data_room_id', roomId)
    .in('access_level', allowed)
    .order('order', { ascending: true })
  const { data: files } = await db
    .from('data_room_files')
    .select('id, folder_id, file_name, file_url, storage_path, file_kind, file_size, version, notes, uploaded_at, uploaded_by, uploaded_by_role, access_level')
    .eq('data_room_id', roomId)
    .eq('is_deleted', false)
    .in('access_level', allowed)
    .order('uploaded_at', { ascending: false })
  const { data: trash } = role === 'agent'
    ? await db.from('data_room_files')
        .select('id, folder_id, file_name, file_url, storage_path, file_kind, file_size, version, notes, uploaded_at, uploaded_by, uploaded_by_role, access_level')
        .eq('data_room_id', roomId)
        .eq('is_deleted', true)
        .order('deleted_at', { ascending: false })
        .limit(20)
    : { data: null }
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
  const trashWithNames = await Promise.all(
    ((trash || []) as any[]).map(async (f) => {
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
    files: filesWithNames as RoomFile[],
    trash: trashWithNames as RoomFile[],
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


export function kindFromMime(mime: string, name: string): string {
  const n = name.toLowerCase()
  if (n.endsWith('.pdf')) return 'pdf'
  if (/\.(xlsx|xls|csv)$/.test(n)) return 'excel'
  if (/\.(docx?|rtf|txt)$/.test(n)) return 'word'
  if (/\.(png|jpe?g|gif|webp|svg)$/.test(n)) return 'image'
  if (mime.startsWith('video/')) return 'video'
  return 'other'
}

/** Human label for an access level (used in badges). */
export function accessLabel(level: string): string {
  switch (level) {
    case 'all_parties': return 'Everyone'
    case 'buyer_only': return 'Agent + Buyer'
    case 'seller_only': return 'Agent + Seller'
    case 'agent_only': return 'Agents only'
    default: return level
  }
}

/** Map spec Visibility → room access_level (approved schema, boss 08-31). */
export function visibilityToAccess(visibility: RoomFile['visibility']): RoomAccessLevel {
  switch (visibility) {
    case 'buyer_visible': return 'buyer_only'
    case 'seller_only': return 'seller_only'
    case 'internal_only': return 'agent_only'
    default: return 'agent_only'
  }
}

/** Map room access_level → spec Visibility (inverse of visibilityToAccess). */
export function accessToVisibility(level: string | null | undefined): RoomFile['visibility'] {
  switch (level) {
    case 'buyer_only': return 'buyer_visible'
    case 'seller_only': return 'seller_only'
    default: return 'internal_only'
  }
}

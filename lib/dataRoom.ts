/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Deal Room — client-side API wrapper
// -----------------------------------------------------------------------------
// Dropbox-style shared workspace per deal. Same API serves the broker CRM
// (Supabase session → role 'agent') and the client portal (deal token → role
// 'buyer' | 'seller' from client_portal_access.party_type):
//   GET  /api/data-rooms/room?dealId=***&token=***   → role-aware snapshot
//   POST /api/data-rooms/room?dealId=***&token=***   → upload / folder / file ops
// =============================================================================

export type RoomAccessLevel = 'all_parties' | 'buyer_only' | 'seller_only' | 'agent_only'
export type RoomRole = 'agent' | 'buyer' | 'seller'

export interface RoomFile {
  id: string
  folder_id: string | null
  file_name: string
  file_url: string
  storage_path?: string | null
  file_kind: string | null
  file_size: number | null
  version: number
  notes: string | null
  uploaded_at: string
  uploaded_by_name: string | null
  uploaded_by_role?: string
  access_level?: string
}

export interface RoomFolder {
  id: string
  name: string
  icon: string | null
  order: number
  access_level?: string
}

export interface RoomActivity {
  id: string
  action: string
  details: string | null
  user_email: string | null
  created_at: string
}

export interface RoomSnapshot {
  ok: boolean
  error?: string
  role?: RoomRole
  room: {
    id: string
    deal_id: string | null
    listing_id: string | null
    name: string
    description: string | null
    status: string
  } | null
  folders: RoomFolder[]
  files: RoomFile[]
  trash: RoomFile[]
  activities: RoomActivity[]
  actor?: { userId: string | null; email: string | null }
}

const base = (dealId: string, token?: string) =>
  `/api/data-rooms/room?dealId=${encodeURIComponent(dealId)}${token ? `&token=${encodeURIComponent(token)}` : ''}`

/** Load the room snapshot (auto-creates the room + DD template on first open). */
export async function fetchRoom(dealId: string, token?: string): Promise<RoomSnapshot> {
  const res = await fetch(base(dealId, token), { cache: 'no-store' })
  return res.json().catch(() => ({ ok: false, error: 'Failed to load deal room' }))
}

/** Upload a file into the room (optionally into a folder, with an access level). */
export async function uploadRoomFile(dealId: string, file: File, folderId: string | null, token?: string, accessLevel?: string) {
  const form = new FormData()
  form.append('file', file)
  if (folderId) form.append('folderId', folderId)
  if (accessLevel) form.append('accessLevel', accessLevel)
  const res = await fetch(base(dealId, token), { method: 'POST', body: form })
  return res.json().catch(() => ({ ok: false, error: 'Upload failed' }))
}

/** Create a folder in the room (agents may pick an access level). */
export async function createRoomFolder(dealId: string, name: string, token?: string, accessLevel?: string) {
  const res = await fetch(base(dealId, token), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'create_folder', name, accessLevel }),
  })
  return res.json().catch(() => ({ ok: false, error: 'Could not create folder' }))
}

/** Rename a file or folder. */
export async function renameRoomItem(dealId: string, kind: 'file' | 'folder', id: string, name: string, token?: string) {
  const res = await fetch(base(dealId, token), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      action: kind === 'file' ? 'rename_file' : 'rename_folder',
      [kind === 'file' ? 'fileId' : 'folderId']: id,
      name,
    }),
  })
  return res.json().catch(() => ({ ok: false, error: 'Could not rename' }))
}

/** Soft-delete a file or folder (moves to the recycle bin state). */
export async function deleteRoomItem(dealId: string, kind: 'file' | 'folder', id: string, token?: string) {
  const res = await fetch(base(dealId, token), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      action: kind === 'file' ? 'delete_file' : 'delete_folder',
      [kind === 'file' ? 'fileId' : 'folderId']: id,
    }),
  })
  return res.json().catch(() => ({ ok: false, error: 'Could not delete' }))
}

/** Restore a soft-deleted file from the trash (agents only). */
export async function restoreRoomFile(dealId: string, fileId: string, token?: string) {
  const res = await fetch(base(dealId, token), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'restore_file', fileId }),
  })
  return res.json().catch(() => ({ ok: false, error: 'Could not restore' }))
}

/** Move a file into another folder (null folderId = root). */
export async function moveRoomFile(dealId: string, fileId: string, folderId: string | null, token?: string) {
  const res = await fetch(base(dealId, token), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'move_file', fileId, folderId: folderId || '' }),
  })
  return res.json().catch(() => ({ ok: false, error: 'Could not move' }))
}

/** Change a file's access level (agents only). */
export async function setRoomFileAccess(dealId: string, fileId: string, accessLevel: string, token?: string) {
  const res = await fetch(base(dealId, token), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'set_file_access', fileId, accessLevel }),
  })
  return res.json().catch(() => ({ ok: false, error: 'Could not update access' }))
}

/** Change a folder's access level (agents only). */
export async function setRoomFolderAccess(dealId: string, folderId: string, accessLevel: string, token?: string) {
  const res = await fetch(base(dealId, token), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'set_folder_access', folderId, accessLevel }),
  })
  return res.json().catch(() => ({ ok: false, error: 'Could not update access' }))
}

/** Human label for an access level (badges). */
export function accessLabel(level?: string | null): string {
  switch (level) {
    case 'all_parties': return 'Everyone'
    case 'buyer_only': return 'Agent + Buyer'
    case 'seller_only': return 'Agent + Seller'
    case 'agent_only': return 'Agents only'
    default: return 'Everyone'
  }
}

export const ACCESS_OPTIONS: { value: string; label: string; icon: string }[] = [
  { value: 'all_parties', label: 'Everyone (agent + buyer + seller)', icon: '🌐' },
  { value: 'buyer_only', label: 'Agent + Buyer', icon: '🤝' },
  { value: 'seller_only', label: 'Agent + Seller', icon: '🏠' },
  { value: 'agent_only', label: 'Agents only (internal)', icon: '🔒' },
]

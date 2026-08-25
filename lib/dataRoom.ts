// =============================================================================
// Deal Data Room — client-side API wrapper
// -----------------------------------------------------------------------------
// Dropbox-style shared folder per deal. Same API serves the broker CRM
// (Supabase session) and the client portal (deal token):
//   GET  /api/data-rooms/room?dealId=***&token=***   → snapshot
//   POST /api/data-rooms/room?dealId=***&token=***   → upload / folder ops
// =============================================================================

export interface DataRoomFile {
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
}

export interface DataRoomFolder {
  id: string
  name: string
  icon: string | null
  order: number
}

export interface DataRoomActivity {
  id: string
  action: string
  details: string | null
  user_email: string | null
  created_at: string
}

export interface DataRoomSnapshot {
  ok: boolean
  error?: string
  room: {
    id: string
    deal_id: string | null
    listing_id: string | null
    name: string
    description: string | null
    status: string
  } | null
  folders: DataRoomFolder[]
  files: DataRoomFile[]
  activities: DataRoomActivity[]
  actor?: { userId: string | null; email: string | null }
}

const base = (dealId: string, token?: string) =>
  `/api/data-rooms/room?dealId=${encodeURIComponent(dealId)}${token ? `&token=${encodeURIComponent(token)}` : ''}`

/** Load the room snapshot (auto-creates the room on first open). */
export async function fetchDataRoom(dealId: string, token?: string): Promise<DataRoomSnapshot> {
  const res = await fetch(base(dealId, token), { cache: 'no-store' })
  return res.json().catch(() => ({ ok: false, error: 'Failed to load data room' }))
}

/** Upload a file into the room (optionally into a folder). */
export async function uploadRoomFile(dealId: string, file: File, folderId: string | null, token?: string) {
  const form = new FormData()
  form.append('file', file)
  if (folderId) form.append('folderId', folderId)
  const res = await fetch(base(dealId, token), { method: 'POST', body: form })
  return res.json().catch(() => ({ ok: false, error: 'Upload failed' }))
}

/** Create a folder in the room. */
export async function createRoomFolder(dealId: string, name: string, token?: string) {
  const res = await fetch(base(dealId, token), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'create_folder', name }),
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

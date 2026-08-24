// =============================================================================
// Data Room buyer intent — audit A2: "which docs are most viewed → buyer
// intent score".
// -----------------------------------------------------------------------------
// Uses the LIVE data_room_view_logs / data_room_download_logs tables (created
// by sql/data_room_schema.sql). Every time a viewer opens or downloads a room
// file we log it; fetchRoomIntent() then rolls those logs up into:
//   • per-buyer intent scores (0-100, recency-weighted, download bonus,
//     category breadth),
//   • most-viewed / most-downloaded docs,
//   • category breakdown per buyer.
// Server-only. Public log endpoint is fire-and-forget from buyer-facing
// surfaces (deduped per email+file to avoid double-clicks inflating counts).
// =============================================================================

import { createClient } from '@supabase/supabase-js'

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const svc =
  SUPABASE_URL && SERVICE_KEY
    ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
    : null

const DEDUPE_WINDOW_MS = 60_000 // skip a repeat view of the same file by the same email within 60s

export interface IntentLogInput {
  fileId: string
  viewerEmail: string
  action: 'view' | 'download'
  ip?: string | null
  userAgent?: string | null
}

/** Recency-weighted activity: last 7d counts 1.0, last 30d 0.6, older 0.3. */
export function recencyWeight(viewedAtIso: string, nowIso = new Date().toISOString()): number {
  const ageMs = Date.parse(nowIso) - Date.parse(viewedAtIso)
  if (!Number.isFinite(ageMs) || ageMs < 0) return 1
  const days = ageMs / 86_400_000
  if (days <= 7) return 1
  if (days <= 30) return 0.6
  return 0.3
}

/**
 * Pure buyer intent score (0-100).
 *  score = 12·ln(1 + weightedActivity) + 6·categoryBreadth
 * Weighted activity: views (recency-weighted) + 2× downloads (recency-weighted).
 * Category breadth = number of distinct file_kinds touched, capped at 4.
 */
export function computeIntentScore(
  views: { viewedAtIso: string; kind?: string | null }[],
  downloads: { downloadedAtIso: string }[] = [],
  nowIso = new Date().toISOString(),
): number {
  let activity = 0
  const kinds = new Set<string>()
  for (const v of views) {
    activity += recencyWeight(v.viewedAtIso, nowIso)
    if (v.kind) kinds.add(v.kind)
  }
  for (const d of downloads) activity += 2 * recencyWeight(d.downloadedAtIso, nowIso)
  const score = Math.round(12 * Math.log(1 + activity) + 6 * Math.min(kinds.size, 4))
  return Math.max(0, Math.min(100, score))
}

export interface BuyerIntentRow {
  email: string
  views: number
  downloads: number
  distinctDocs: number
  categories: Record<string, number>
  lastActiveAt: string | null
  score: number
}

export interface TopDocRow {
  fileId: string
  fileName: string
  fileKind: string | null
  views: number
  downloads: number
  lastViewedAt: string | null
}

export interface RoomIntent {
  roomId: string
  totalViews: number
  totalDownloads: number
  activeBuyers: number
  buyers: BuyerIntentRow[]
  topDocs: TopDocRow[]
}

interface ViewRow {
  file_id: string
  viewer_email: string | null
  viewed_at: string
  files?: { id: string; file_name: string; file_kind: string | null } | null
}
interface DownloadRow {
  file_id: string
  downloader_email: string | null
  downloaded_at: string
  files?: { id: string; file_name: string; file_kind: string | null } | null
}

/** Log a view or download of a room file. Dedupes repeat events within 60s per email+file. */
export async function logRoomFileIntent(input: IntentLogInput): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  if (!svc) return { ok: false, error: 'Database is not configured' }
  const fileId = (input.fileId || '').trim()
  const email = (input.viewerEmail || '').trim().toLowerCase()
  if (!fileId || !email || !email.includes('@')) return { ok: false, error: 'fileId and a valid viewerEmail are required' }

  // File must exist (FK-safe + prevents log spam for garbage ids). Fire-and-forget
  // callers (portal doc links) may pass non-room ids — skip silently, never error.
  const { data: file } = await svc.from('data_room_files').select('id').eq('id', fileId).maybeSingle()
  if (!file) return { ok: true, skipped: true }

  const table = input.action === 'download' ? 'data_room_download_logs' : 'data_room_view_logs'
  const emailCol = input.action === 'download' ? 'downloader_email' : 'viewer_email'

  // Dedupe: skip if the same email viewed/downloaded this file in the last 60s.
  const since = new Date(Date.now() - DEDUPE_WINDOW_MS).toISOString()
  const { count } = await svc
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('file_id', fileId)
    .eq(emailCol, email)
    .gte(input.action === 'download' ? 'downloaded_at' : 'viewed_at', since)
  if (count) return { ok: true, skipped: true }

  const row: Record<string, unknown> =
    input.action === 'download'
      ? { file_id: fileId, downloader_email: email, ip_address: input.ip || null }
      : { file_id: fileId, viewer_email: email, ip_address: input.ip || null, user_agent: input.userAgent || null }

  const { error } = await (svc.from(table) as any).insert(row)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/** Roll a room's view/download logs up into buyer intent + top docs. */
export async function fetchRoomIntent(roomId: string): Promise<{ ok: boolean; error?: string; intent?: RoomIntent }> {
  if (!svc) return { ok: false, error: 'Database is not configured' }
  if (!roomId) return { ok: false, error: 'roomId is required' }

  const { data: room } = await svc.from('data_rooms').select('id').eq('id', roomId).maybeSingle()
  if (!room) return { ok: false, error: 'Data room not found' }

  const [viewsRes, downloadsRes, filesRes] = await Promise.all([
    svc
      .from('data_room_view_logs')
      .select('file_id, viewer_email, viewed_at, files(id, file_name, file_kind)')
      .eq('data_room_files.data_room_id', roomId)
      .order('viewed_at', { ascending: false })
      .limit(2000),
    svc
      .from('data_room_download_logs')
      .select('file_id, downloader_email, downloaded_at, files(id, file_name, file_kind)')
      .eq('data_room_files.data_room_id', roomId)
      .order('downloaded_at', { ascending: false })
      .limit(2000),
    svc.from('data_room_files').select('id, file_name, file_kind').eq('data_room_id', roomId).eq('is_deleted', false).limit(1000),
  ])

  if (viewsRes.error || downloadsRes.error || filesRes.error) {
    return { ok: false, error: viewsRes.error?.message || downloadsRes.error?.message || filesRes.error?.message || 'Failed to read logs' }
  }

  const views = (viewsRes.data || []) as unknown as ViewRow[]
  const downloads = (downloadsRes.data || []) as unknown as DownloadRow[]
  const files = (filesRes.data || []) as unknown as { id: string; file_name: string; file_kind: string | null }[]

  const nowIso = new Date().toISOString()
  const byBuyer = new Map<string, BuyerIntentRow>()
  const byFile = new Map<string, TopDocRow>()

  const ensureBuyer = (email: string) => {
    let b = byBuyer.get(email)
    if (!b) {
      b = { email, views: 0, downloads: 0, distinctDocs: 0, categories: {}, lastActiveAt: null, score: 0 }
      byBuyer.set(email, b)
    }
    return b
  }
  const ensureFile = (fileId: string, name: string, kind: string | null) => {
    let f = byFile.get(fileId)
    if (!f) {
      f = { fileId, fileName: name, fileKind: kind, views: 0, downloads: 0, lastViewedAt: null }
      byFile.set(fileId, f)
    }
    return f
  }
  const fileMeta = new Map(files.map((f) => [f.id, f]))

  for (const v of views) {
    const email = (v.viewer_email || '').trim().toLowerCase()
    if (!email) continue
    const meta = v.files || fileMeta.get(v.file_id)
    const b = ensureBuyer(email)
    b.views += 1
    if (v.viewed_at && (!b.lastActiveAt || v.viewed_at > b.lastActiveAt)) b.lastActiveAt = v.viewed_at
    const kind = meta?.file_kind || 'other'
    b.categories[kind] = (b.categories[kind] || 0) + 1
    const f = ensureFile(v.file_id, meta?.file_name || 'Document', kind)
    f.views += 1
    if (v.viewed_at && (!f.lastViewedAt || v.viewed_at > f.lastViewedAt)) f.lastViewedAt = v.viewed_at
  }

  for (const d of downloads) {
    const email = (d.downloader_email || '').trim().toLowerCase()
    if (!email) continue
    const meta = d.files || fileMeta.get(d.file_id)
    const b = ensureBuyer(email)
    b.downloads += 1
    if (d.downloaded_at && (!b.lastActiveAt || d.downloaded_at > b.lastActiveAt)) b.lastActiveAt = d.downloaded_at
    const f = ensureFile(d.file_id, meta?.file_name || 'Document', meta?.file_kind || 'other')
    f.downloads += 1
  }

  // Distinct docs per buyer (count unique file ids in views+downloads).
  const seenDocs = new Map<string, Set<string>>()
  for (const v of views) {
    if (!v.viewer_email) continue
    const email = v.viewer_email.trim().toLowerCase()
    if (!seenDocs.has(email)) seenDocs.set(email, new Set())
    seenDocs.get(email)!.add(v.file_id)
  }
  for (const d of downloads) {
    if (!d.downloader_email) continue
    const email = d.downloader_email.trim().toLowerCase()
    if (!seenDocs.has(email)) seenDocs.set(email, new Set())
    seenDocs.get(email)!.add(d.file_id)
  }
  for (const [email, ids] of seenDocs) {
    const b = byBuyer.get(email)
    if (b) b.distinctDocs = ids.size
  }

  // Score each buyer (needs per-buyer recency-weighted activity).
  const buyers: BuyerIntentRow[] = []
  for (const [email, b] of byBuyer) {
    const buyerViews = views
      .filter((v) => (v.viewer_email || '').trim().toLowerCase() === email)
      .map((v) => ({ viewedAtIso: v.viewed_at, kind: (v.files || fileMeta.get(v.file_id))?.file_kind || null }))
    const buyerDownloads = downloads
      .filter((d) => (d.downloader_email || '').trim().toLowerCase() === email)
      .map((d) => ({ downloadedAtIso: d.downloaded_at }))
    b.score = computeIntentScore(buyerViews, buyerDownloads, nowIso)
    buyers.push(b)
  }
  buyers.sort((a, z) => z.score - a.score)

  const topDocs = [...byFile.values()].sort((a, z) => z.views + z.downloads * 2 - (a.views + a.downloads * 2)).slice(0, 20)

  const intent: RoomIntent = {
    roomId,
    totalViews: views.length,
    totalDownloads: downloads.length,
    activeBuyers: buyers.length,
    buyers,
    topDocs,
  }
  return { ok: true, intent }
}

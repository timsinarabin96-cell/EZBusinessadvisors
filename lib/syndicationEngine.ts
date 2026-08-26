/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// syndicationEngine — marketplace syndication for listings.
// -----------------------------------------------------------------------------
// Tracks per-listing push status across external marketplaces (BizBuySell,
// LoopNet, DealStream, Facebook Marketplace, local/manual) in `bbs_syncs`,
// and the agency's connected accounts in `marketplace_connections`.
//
// Real API pushes need marketplace credentials (stored per-connection); until
// a connection is configured, push records the intent + builds the ready-to-
// paste payload so the broker can complete the posting manually — every source
// still gets a status row (pending → synced/removed) for the dashboard.
//
// Pure logic (providers, payload builder) lives in syndicationEngineCore.ts
// so node tests can import it without path aliases; this wrapper adds the
// Supabase-backed persistence.
// =============================================================================

import { supabase } from '@/lib/supabase/client'
import { SYNDICATION_PROVIDERS, providerLabel, buildSyncPayload, type SyncStatus } from '@/lib/syndicationEngineCore.ts'

export { SYNDICATION_PROVIDERS, providerLabel, buildSyncPayload }
export type { SyncStatus, SyndicationProvider } from '@/lib/syndicationEngineCore.ts'

export interface ListingSyncRow {
  id: string
  listing_id: string
  provider: string
  external_id: string | null
  status: SyncStatus
  last_sync_at: string | null
  payload_json: Record<string, unknown> | null
  error: string | null
  created_at: string
}

/** Upsert a status row for one listing × provider (keeps history per push). */
export async function recordSync(
  listingId: string,
  provider: string,
  payload: Record<string, unknown>,
  status: SyncStatus = 'pending',
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { error } = await supabase.from('bbs_syncs').insert({
      listing_id: listingId,
      provider,
      status,
      payload_json: payload,
      last_sync_at: status === 'pending' ? null : new Date().toISOString(),
    })
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e.message || 'Failed to record sync' }
  }
}

/** Fetch sync history for a listing, newest first. */
export async function fetchListingSyncs(listingId: string): Promise<ListingSyncRow[]> {
  try {
    const { data, error } = await supabase
      .from('bbs_syncs')
      .select('*')
      .eq('listing_id', listingId)
      .order('created_at', { ascending: false })
    if (error || !data) return []
    return (data as ListingSyncRow[]).map((r) => ({
      ...r,
      status: (['pending', 'synced', 'failed', 'removed'].includes(r.status) ? r.status : 'pending') as SyncStatus,
    }))
  } catch {
    return []
  }
}

/** Current status per provider (latest row wins). */
export async function fetchListingSyncStatus(listingId: string): Promise<Record<string, SyncStatus>> {
  const rows = await fetchListingSyncs(listingId)
  const out: Record<string, SyncStatus> = {}
  for (const r of rows) {
    if (!(r.provider in out)) out[r.provider] = r.status
  }
  return out
}

/** Mark a sync row synced (broker finished the posting) or removed. */
export async function updateSyncStatus(
  syncId: string,
  status: 'synced' | 'removed',
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('bbs_syncs')
      .update({ status, last_sync_at: new Date().toISOString() })
      .eq('id', syncId)
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e.message || 'Failed to update sync' }
  }
}

/** Agency's connected marketplace accounts (for real API pushes). */
export async function fetchConnections(agencyId: string): Promise<Record<string, unknown>[]> {
  try {
    const { data } = await supabase
      .from('marketplace_connections')
      .select('*')
      .eq('agency_id', agencyId)
    return (data || []) as Record<string, unknown>[]
  } catch {
    return []
  }
}

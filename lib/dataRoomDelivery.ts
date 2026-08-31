/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Deal Room delivery helper — drops a generated deliverable (CIM/BOV/recast
// PDF) into the deal's data room so the buyer/seller can also access it inside
// the secure room, alongside the email + share link. Best-effort: a failure
// here never blocks the send (email + link already cover delivery).
// =============================================================================

import { createServerClient } from '@/lib/supabase/server'
import { DOCS_BUCKET } from '@/lib/storageBuckets'

export interface AddFileToDealRoomInput {
  agencyId: string
  listingId: string | null
  dealId: string | null
  fileName: string
  /** Object path in the documents bucket (already uploaded). */
  storagePath: string
  uploaderName?: string
  uploaderRole?: string
}

/**
 * Add a stored file to the deal's data room (creates the room if needed).
 * Returns the data_room_files row id, or null when the room can't be resolved.
 */
export async function addFileToDealRoom(input: AddFileToDealRoomInput): Promise<string | null> {
  const db = createServerClient()
  if (!db) return null

  // Resolve the deal: explicit dealId, else the listing's current deal.
  let dealId = input.dealId
  if (!dealId && input.listingId) {
    const { data: listing } = await db.from('listings').select('id').eq('id', input.listingId).maybeSingle()
    if (!listing) return null
    const { data: deal } = await db.from('deals').select('id').eq('listing_id', input.listingId).maybeSingle()
    dealId = deal?.id || null
  }
  if (!dealId) return null

  try {
    // Public URL for the stored file (documents bucket is public-read).
    const { data: pub } = await db.storage.from(DOCS_BUCKET).getPublicUrl(input.storagePath)
    const fileUrl = pub?.publicUrl || null
    if (!fileUrl) return null

    const { data: room } = await db.from('data_rooms').select('id').eq('deal_id', dealId).maybeSingle()
    if (!room?.id) return null

    const { data: row, error } = await db.from('data_room_files').insert({
      room_id: room.id,
      deal_id: dealId,
      listing_id: input.listingId,
      file_name: input.fileName,
      file_url: fileUrl,
      file_kind: 'pdf',
      file_size: null,
      access_level: 'all_parties',
      uploaded_by_name: input.uploaderName || 'Advisor',
      uploaded_by_role: input.uploaderRole || 'admin',
    }).select().maybeSingle()
    if (error || !row) return null
    return row.id as string
  } catch {
    return null
  }
}

/**
 * #14 auto-archive on close (spec Phase 8): stamp every vault entry for the
 * deal + listing into the closed-deal archive and return the count. The
 * archive is the same data_room_files rows flagged `stage_tag='closing'` +
 * `archived_at` — the deal file stays in the vault (audit trail intact), just
 * frozen and timestamped. Never throws; close response never blocked.
 */
export async function archiveDealOnClose(input: {
  dealId: string | null
  listingId: string | null
}): Promise<{ ok: boolean; error?: string; archived?: number }> {
  const db = createServerClient()
  if (!db) return { ok: false, error: 'not configured' }
  try {
    const stamp = new Date().toISOString()
    let archived = 0

    // Vault files for the deal (or listing when no deal room exists yet).
    const { data: roomFiles } = await db
      .from('data_room_files')
      .select('id')
      .or(input.dealId ? `deal_id.eq.${input.dealId}` : `listing_id.eq.${input.listingId}`)
    const ids = ((roomFiles || []) as { id: string }[]).map((r) => r.id)
    if (ids.length > 0) {
      const { error } = await db.from('data_room_files').update({
        stage_tag: 'closing',
        archived_at: stamp,
        updated_at: stamp,
      }).in('id', ids)
      if (!error) archived += ids.length
    }

    // Generated deliverables in the financial_documents table for this listing.
    if (input.listingId) {
      const { data: gen } = await db
        .from('financial_documents')
        .select('id')
        .eq('listing_id', input.listingId)
        .eq('category', 'generated_document')
      const genIds = ((gen || []) as { id: string }[]).map((r) => r.id)
      if (genIds.length > 0) {
        const { error } = await db.from('financial_documents').update({
          status: 'archived',
          notes: `Archived on close ${stamp}`,
        }).in('id', genIds)
        if (!error) archived += genIds.length
      }
    }

    return { ok: true, archived }
  } catch (e: any) {
    return { ok: false, error: e?.message || 'archive failed' }
  }
}

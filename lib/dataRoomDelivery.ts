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

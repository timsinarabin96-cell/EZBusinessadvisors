/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { createServerClient } from '@/lib/supabase/server'
import type { AuthenticatedProfileRequest } from '@/lib/supabase/auth'
import { completeSigning } from '@/lib/documentSigning'

/**
 * Shared counter-sign: the broker/owner/agent approves a document whose
 * counterparty (seller/buyer) has already signed. Used by both the NDA and
 * the Listing Agreement flows. Access = canManageListing on the document's
 * listing (agent on their own listing, broker/admin/owner agency-wide).
 */
export async function counterSignDocument(
  db: ReturnType<typeof createServerClient>,
  auth: AuthenticatedProfileRequest,
  documentId: string,
): Promise<{ ok: boolean; error?: string; allSigned?: boolean; documentId?: string; status?: number }> {
  const { data: doc } = await db
    .from('documents')
    .select('id, title, listing_id, deal_id, status, listings(agency_id, agent_id, business_name)')
    .eq('id', documentId)
    .maybeSingle()
  if (!doc) return { ok: false, error: 'Document not found', status: 404 }
  if (doc.status === 'signed') return { ok: false, error: 'This document is already fully signed.', status: 400 }

  const listing = (Array.isArray(doc.listings) ? doc.listings[0] : doc.listings) as { agency_id: string | null; agent_id?: string | null } | null
  if (!listing || !listing.agency_id) return { ok: false, error: 'Document is not linked to a listing.', status: 400 }

  const { canManageListing } = await import('@/lib/supabase/auth')
  if (!canManageListing(auth, { agency_id: listing.agency_id, agent_id: listing.agent_id })) {
    return { ok: false, error: 'Insufficient permission', status: 403 }
  }

  const { data: brokerLink } = await db
    .from('document_signing_links')
    .select('token, status')
    .eq('document_id', documentId)
    .eq('party_key', 'broker')
    .maybeSingle()
  if (!brokerLink) return { ok: false, error: 'No broker signing link on this document.', status: 400 }
  if (brokerLink.status === 'signed') return { ok: false, error: 'You already signed this document.', status: 400 }

  const res = await completeSigning(brokerLink.token, {
    name: (auth.profile as { full_name?: string | null }).full_name || 'Broker',
    title: (auth.profile as { title?: string | null }).title || undefined,
    mode: 'type',
  })
  if (!res.ok) return { ok: false, error: res.error || 'Could not record signature', status: 400 }

  // Fully signed → flip the linked buyer lead to verified_buyer (if any).
  if (res.allSigned && (doc as any).deal_id) {
    const { data: deal } = await db.from('deals').select('buyer_lead_id').eq('id', (doc as any).deal_id).maybeSingle()
    if (deal?.buyer_lead_id) {
      await db.from('buyer_leads').update({ verified_buyer: true, status: 'qualified' }).eq('id', deal.buyer_lead_id)
    }
  }

  return { ok: true, allSigned: res.allSigned, documentId }
}

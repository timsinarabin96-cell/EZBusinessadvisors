/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// NDA-Gated Deal Access
// -----------------------------------------------------------------------------
// Buyers request confidential access to a deal, digitally sign an NDA
// (typed-name consent + timestamp), and a broker approves/rejects. Approval
// grants the buyer a data-room buyer record so they can view the room.
// Server-only.
// =============================================================================

import { createClient } from '@supabase/supabase-js'
import { notify, sendEmail } from './email'

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const svc =
  SUPABASE_URL && SERVICE_KEY
    ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
    : null

export interface NdaRequestInput {
  listing_id: string
  data_room_id?: string | null
  requester_name: string
  requester_email: string
  requester_company?: string | null
  rationale?: string | null
  nda_signature: string
  ip_address?: string | null
}

/** Create a pending NDA access request + alert the agency's brokers. */
export async function requestNdaAccess(input: NdaRequestInput): Promise<{ ok: boolean; error?: string; requestId?: string }> {
  if (!svc) return { ok: false, error: 'Database is not configured' }
  if (!input.listing_id || !input.requester_name || !input.requester_email || !input.nda_signature) {
    return { ok: false, error: 'listing_id, requester_name, requester_email, and nda_signature are required' }
  }
  if (!input.requester_email.includes('@')) return { ok: false, error: 'A valid email is required' }

  const { data: listing } = await svc.from('listings').select('agency_id, business_name').eq('id', input.listing_id).maybeSingle()
  if (!listing?.agency_id) return { ok: false, error: 'Listing not found' }

  // Resolve the deal's data room if one exists.
  let dataRoomId = input.data_room_id || null
  if (!dataRoomId) {
    const { data: room } = await svc
      .from('data_rooms')
      .select('id')
      .eq('listing_id', input.listing_id)
      .eq('status', 'active')
      .maybeSingle()
    dataRoomId = room?.id || null
  }

  const { data, error } = await svc
    .from('data_room_access_requests')
    .insert({
      agency_id: listing.agency_id,
      listing_id: input.listing_id,
      data_room_id: dataRoomId,
      requester_name: input.requester_name,
      requester_email: input.requester_email,
      requester_company: input.requester_company || null,
      rationale: input.rationale || null,
      nda_signature: input.nda_signature,
      ip_address: input.ip_address || null,
      status: 'pending',
    })
    .select('id')
    .single()

  if (error) return { ok: false, error: error.message || 'Failed to create request' }

  // Alert the agency's brokers — listing owner first (ownership model).
  await notifyAgencyBrokers(listing.agency_id, input.listing_id, {
    requesterName: input.requester_name,
    requesterEmail: input.requester_email,
    businessName: listing.business_name || 'a listing',
  })

  return { ok: true, requestId: data.id }
}

export async function notifyAgencyBrokers(
  agencyId: string,
  listingId: string,
  info: { requesterName: string; requesterEmail: string; businessName: string },
) {
  if (!svc) return
  const { data: members } = await svc
    .from('agency_members')
    .select('profile_id, role, is_owner')
    .eq('agency_id', agencyId)
  if (!members?.length) return

  // Ownership model: the listing's OWNING agent is responsible for the deal,
  // so they get the NDA alert first. The overseeing broker(s) stay in the
  // loop for visibility.
  const { data: listing } = await svc.from('listings').select('agent_id').eq('id', listingId).maybeSingle()
  const ownerId = (listing as { agent_id?: string | null } | null)?.agent_id || null
  const isOwnerOfListing = (m: { profile_id: string }) => m.profile_id === ownerId

  // Owners/admins (broker oversight) + the listing's owning agent.
  const ids = [...new Set(members
    .filter((m) => m.is_owner || m.role === 'admin' || m.role === 'owner' || isOwnerOfListing(m))
    .map((m) => m.profile_id))]
  if (!ids.length) return

  const { data: profiles } = await svc.from('profiles').select('id, email').in('id', ids)
  for (const p of profiles || []) {
    if (p.email) {
      // Immediate delivery replaces the old notify('nda_request_received', ...) digest gate.
      await sendEmail({
        to: p.email,
        subject: `🛡️ NDA signed / access requested: ${info.businessName}`,
        html: `<h2>New NDA activity</h2><p><strong>${info.requesterName}</strong> (${info.requesterEmail}) signed the NDA and requested access to <strong>${info.businessName}</strong>.</p><p>Review the request in the deal room.</p>`,
        kind: 'nda_immediate',
        meta: { event_key: `nda-request:${listingId}:${info.requesterEmail}`, listing_id: listingId, agency_id: agencyId },
      })
    }
  }
}

/** Approve or reject an NDA request. Approval grants the buyer data-room access. */
export async function reviewNdaRequest(
  requestId: string,
  action: 'approve' | 'reject',
  reviewerProfileId: string,
  reviewNote?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  if (!svc) return { ok: false, error: 'Database is not configured' }

  const { data: req } = await svc.from('data_room_access_requests').select('*').eq('id', requestId).maybeSingle()
  if (!req) return { ok: false, error: 'Request not found' }
  if (req.status !== 'pending') return { ok: false, error: `Request is already ${req.status}` }

  const status = action === 'approve' ? 'approved' : 'rejected'
  const { error: updateError } = await svc
    .from('data_room_access_requests')
    .update({ status, reviewed_by: reviewerProfileId, reviewed_at: new Date().toISOString(), review_note: reviewNote || null })
    .eq('id', requestId)
  if (updateError) return { ok: false, error: updateError.message }

  if (action === 'approve' && req.data_room_id) {
    // Grant the buyer a data-room buyer record (idempotent per email).
    await svc
      .from('data_room_buyers')
      .upsert(
        {
          data_room_id: req.data_room_id,
          buyer_email: req.requester_email,
          buyer_name: req.requester_name,
          role: 'viewer',
          status: 'active',
          accepted_at: new Date().toISOString(),
        },
        { onConflict: 'data_room_id,buyer_email' },
      )
      .select()
      .maybeSingle()
  }

  const listing = req.listing_id
    ? await svc.from('listings').select('business_name').eq('id', req.listing_id).maybeSingle()
    : null

  await notify(
    action === 'approve' ? 'nda_access_granted' : 'nda_access_rejected',
    req.requester_email,
    {
      name: req.requester_name,
      businessName: listing?.data?.business_name || 'the business',
      requestId,
    },
  )

  return { ok: true }
}

/** List NDA requests for an agency (optionally filtered by status). */
export async function listNdaRequests(agencyId: string, status?: string): Promise<Record<string, unknown>[]> {
  if (!svc) return []
  let query = svc.from('data_room_access_requests').select('*, listings(business_name)').eq('agency_id', agencyId)
  if (status && status !== 'all') query = query.eq('status', status)
  const { data } = await query.order('created_at', { ascending: false }).limit(100)
  return (data || []) as Record<string, unknown>[]
}

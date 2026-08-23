// =============================================================================
// Proof of Funds
// -----------------------------------------------------------------------------
// Public buyers submit proof-of-funds for a listing (email + optional amount
// and document link); brokers review each submission as verified/rejected.
// Inserts resolve the agency from the listing, so a submission always lands in
// the right tenant. Never throws — every operation degrades to a result object.
// =============================================================================

import { createClient } from '@supabase/supabase-js'

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const svc =
  SUPABASE_URL && SERVICE_KEY
    ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
    : null

// --- Types ------------------------------------------------------------------
export type PoFStatus = 'pending' | 'verified' | 'rejected'

export interface ProofOfFunds {
  id: string
  agency_id: string
  listing_id: string
  requester_email: string
  requester_name: string | null
  amount: number | null
  document_url: string | null
  status: PoFStatus
  reviewed_by: string | null
  reviewed_at: string | null
  notes: string | null
  created_at: string
}

export interface SubmitPoFInput {
  email: string
  name?: string | null
  listingId: string
  amount?: number | null
  documentUrl?: string | null
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Insert a public proof-of-funds submission, resolving agency from the listing. */
export async function submitPoF(input: SubmitPoFInput): Promise<{ ok: boolean; error?: string; data?: ProofOfFunds }> {
  const email = (input.email || '').trim().toLowerCase()
  if (!EMAIL_RE.test(email)) return { ok: false, error: 'A valid email is required' }
  if (!input.listingId) return { ok: false, error: 'listingId is required' }
  if (!svc) return { ok: false, error: 'not configured' }

  const { data: listing } = await svc.from('listings').select('id, agency_id').eq('id', input.listingId).maybeSingle()
  if (!listing) return { ok: false, error: 'listing not found' }

  const { data, error } = await svc
    .from('proof_of_funds')
    .insert({
      agency_id: listing.agency_id,
      listing_id: input.listingId,
      requester_email: email,
      requester_name: input.name?.trim() || null,
      amount: input.amount != null && Number.isFinite(input.amount) ? input.amount : null,
      document_url: input.documentUrl?.trim() || null,
      status: 'pending',
    })
    .select()
    .maybeSingle()
  if (error) return { ok: false, error: error.message }
  return { ok: true, data: data as ProofOfFunds }
}

/** Broker review: verify or reject a submission, stamping reviewer + timestamp. */
export async function reviewPoF(
  id: string,
  action: 'verified' | 'rejected',
  reviewerId: string,
  notes?: string | null,
): Promise<{ ok: boolean; error?: string; data?: ProofOfFunds }> {
  if (!id) return { ok: false, error: 'id is required' }
  if (!['verified', 'rejected'].includes(action)) return { ok: false, error: 'action must be verified or rejected' }
  if (!svc) return { ok: false, error: 'not configured' }

  const { data, error } = await svc
    .from('proof_of_funds')
    .update({
      status: action,
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
      notes: notes || null,
    })
    .eq('id', id)
    .select()
    .maybeSingle()
  if (error) return { ok: false, error: error.message }
  if (!data) return { ok: false, error: 'proof of funds submission not found' }
  return { ok: true, data: data as ProofOfFunds }
}

/** List submissions for an agency, optionally filtered by status. */
export async function listPoF(agencyId: string, status?: PoFStatus | string | null): Promise<ProofOfFunds[]> {
  if (!svc || !agencyId) return []
  let query = svc.from('proof_of_funds').select('*').eq('agency_id', agencyId)
  if (status && ['pending', 'verified', 'rejected'].includes(status)) query = query.eq('status', status)
  const { data, error } = await query.order('created_at', { ascending: false }).limit(500)
  if (error) return []
  return (data || []) as ProofOfFunds[]
}

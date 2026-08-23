// =============================================================================
// Referral Program
// -----------------------------------------------------------------------------
// Brokers log buyer/seller referrals, advance them through the funnel
// (new -> contacted -> converted -> paid), and optionally track the commission
// percentage agreed on a converted referral. Service-role client, never
// throws - every operation degrades to a result object.
// =============================================================================

import { createClient } from '@supabase/supabase-js'

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const svc =
  SUPABASE_URL && SERVICE_KEY
    ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
    : null

// --- Types ------------------------------------------------------------------
export type ReferralType = 'buyer' | 'seller'
export type ReferralStatus = 'new' | 'contacted' | 'converted' | 'paid'

export const REFERRAL_TYPES: ReferralType[] = ['buyer', 'seller']
export const REFERRAL_STATUSES: ReferralStatus[] = ['new', 'contacted', 'converted', 'paid']

export interface Referral {
  id: string
  agency_id: string
  referrer_name: string
  referrer_email: string
  referral_type: ReferralType
  referee_name: string | null
  referee_email: string | null
  status: ReferralStatus
  commission_pct: number | null
  notes: string | null
  converted_at: string | null
  created_at: string
}

export interface CreateReferralInput {
  agencyId: string
  referrerName: string
  referrerEmail: string
  referralType?: ReferralType | string
  refereeName?: string | null
  refereeEmail?: string | null
  commissionPct?: number | null
  notes?: string | null
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Log a new referral for an agency. */
export async function createReferral(
  input: CreateReferralInput,
): Promise<{ ok: boolean; error?: string; data?: Referral }> {
  const referrerName = (input.referrerName || '').trim()
  const referrerEmail = (input.referrerEmail || '').trim().toLowerCase()
  if (!referrerName) return { ok: false, error: 'Referrer name is required' }
  if (!EMAIL_RE.test(referrerEmail)) return { ok: false, error: 'A valid referrer email is required' }
  if (!input.agencyId) return { ok: false, error: 'agencyId is required' }
  if (!svc) return { ok: false, error: 'not configured' }

  const referralType = REFERRAL_TYPES.includes(input.referralType as ReferralType) ? (input.referralType as ReferralType) : 'buyer'
  const commissionPct =
    input.commissionPct != null && Number.isFinite(Number(input.commissionPct)) ? Number(input.commissionPct) : null

  const { data, error } = await svc
    .from('referrals')
    .insert({
      agency_id: input.agencyId,
      referrer_name: referrerName,
      referrer_email: referrerEmail,
      referral_type: referralType,
      referee_name: input.refereeName?.trim() || null,
      referee_email: input.refereeEmail?.trim().toLowerCase() || null,
      commission_pct: commissionPct,
      notes: input.notes?.trim() || null,
      status: 'new',
    })
    .select()
    .maybeSingle()
  if (error) return { ok: false, error: error.message }
  return { ok: true, data: data as Referral }
}

/** Advance a referral's status; stamps converted_at when it converts. */
export async function updateReferralStatus(
  id: string,
  status: ReferralStatus | string,
  opts: { convertedAt?: string | null } = {},
): Promise<{ ok: boolean; error?: string; data?: Referral }> {
  if (!id) return { ok: false, error: 'id is required' }
  if (!REFERRAL_STATUSES.includes(status as ReferralStatus)) return { ok: false, error: 'status must be new, contacted, converted, or paid' }
  if (!svc) return { ok: false, error: 'not configured' }

  const { data: existing } = await svc.from('referrals').select('id, status, converted_at').eq('id', id).maybeSingle()
  if (!existing) return { ok: false, error: 'referral not found' }

  const patch: Record<string, unknown> = { status }
  if (status === 'converted') {
    if (opts.convertedAt) patch.converted_at = opts.convertedAt
    else if (!existing.converted_at) patch.converted_at = new Date().toISOString()
  } else if (opts.convertedAt !== undefined) {
    patch.converted_at = opts.convertedAt
  }

  const { data, error } = await svc.from('referrals').update(patch).eq('id', id).select().maybeSingle()
  if (error) return { ok: false, error: error.message }
  return { ok: true, data: data as Referral }
}

/** List an agency's referrals, optionally filtered by status. */
export async function listReferrals(agencyId: string, status?: ReferralStatus | string | null): Promise<Referral[]> {
  if (!svc || !agencyId) return []
  let query = svc.from('referrals').select('*').eq('agency_id', agencyId)
  if (status && REFERRAL_STATUSES.includes(status as ReferralStatus)) query = query.eq('status', status)
  const { data, error } = await query.order('created_at', { ascending: false }).limit(500)
  if (error) return []
  return (data || []) as Referral[]
}

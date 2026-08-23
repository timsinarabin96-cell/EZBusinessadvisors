// =============================================================================
// Commission & Payout Tracking
// -----------------------------------------------------------------------------
// Record commissions earned on deals, move them through pending -> approved ->
// paid, list them per agency, and export a CSV for the books. Service-role
// client, never throws - every operation degrades to a result object.
// =============================================================================

import { createClient } from '@supabase/supabase-js'

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const svc =
  SUPABASE_URL && SERVICE_KEY
    ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
    : null

// --- Types ------------------------------------------------------------------
export type CommissionStatus = 'pending' | 'approved' | 'paid'

export const COMMISSION_STATUSES: CommissionStatus[] = ['pending', 'approved', 'paid']

export interface CommissionRecord {
  id: string
  agency_id: string
  listing_id: string | null
  deal_id: string | null
  agent_profile_id: string | null
  amount: number | null
  commission_pct: number | null
  status: CommissionStatus
  paid_at: string | null
  notes: string | null
  created_at: string
}

/** Commission with the joined business name + agent name (when present). */
export interface CommissionWithRelations extends CommissionRecord {
  listings?: { business_name?: string | null } | null
  profiles?: { full_name?: string | null } | null
}

export interface CreateCommissionInput {
  agencyId: string
  listingId?: string | null
  dealId?: string | null
  agentProfileId?: string | null
  amount?: number | null
  commissionPct?: number | null
  notes?: string | null
}

/** Record a commission owed to an agent on a deal. */
export async function recordCommission(
  input: CreateCommissionInput,
): Promise<{ ok: boolean; error?: string; data?: CommissionRecord }> {
  if (!input.agencyId) return { ok: false, error: 'agencyId is required' }
  if (input.amount == null || !Number.isFinite(Number(input.amount)) || Number(input.amount) <= 0) {
    return { ok: false, error: 'A positive amount is required' }
  }
  if (!svc) return { ok: false, error: 'not configured' }

  const commissionPct =
    input.commissionPct != null && Number.isFinite(Number(input.commissionPct)) ? Number(input.commissionPct) : null

  const { data, error } = await svc
    .from('commission_records')
    .insert({
      agency_id: input.agencyId,
      listing_id: input.listingId || null,
      deal_id: input.dealId || null,
      agent_profile_id: input.agentProfileId || null,
      amount: Number(input.amount),
      commission_pct: commissionPct,
      status: 'pending',
      notes: input.notes?.trim() || null,
    })
    .select()
    .maybeSingle()
  if (error) return { ok: false, error: error.message }
  return { ok: true, data: data as CommissionRecord }
}

/** Move a commission through pending -> approved -> paid (stamps paid_at on paid). */
export async function updateCommissionStatus(
  id: string,
  status: CommissionStatus | string,
): Promise<{ ok: boolean; error?: string; data?: CommissionRecord }> {
  if (!id) return { ok: false, error: 'id is required' }
  if (!COMMISSION_STATUSES.includes(status as CommissionStatus)) return { ok: false, error: 'status must be pending, approved, or paid' }
  if (!svc) return { ok: false, error: 'not configured' }

  const patch: Record<string, unknown> = { status }
  if (status === 'paid') patch.paid_at = new Date().toISOString()

  const { data, error } = await svc.from('commission_records').update(patch).eq('id', id).select().maybeSingle()
  if (error) return { ok: false, error: error.message }
  if (!data) return { ok: false, error: 'commission record not found' }
  return { ok: true, data: data as CommissionRecord }
}

/** List an agency's commissions (with listing business name + agent name), optionally filtered by status. */
export async function listCommissions(
  agencyId: string,
  status?: CommissionStatus | string | null,
): Promise<CommissionWithRelations[]> {
  if (!svc || !agencyId) return []
  let query = svc
    .from('commission_records')
    .select('*, listings(business_name), profiles(full_name)')
    .eq('agency_id', agencyId)
  if (status && COMMISSION_STATUSES.includes(status as CommissionStatus)) query = query.eq('status', status)
  const { data, error } = await query.order('created_at', { ascending: false }).limit(500)
  if (error) return []
  return (data || []) as CommissionWithRelations[]
}

const csvField = (v: unknown): string => {
  const s = v == null ? '' : String(v)
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}

/** Export an agency's commissions as a CSV string (headers: business, agent, amount, pct, status, paid_at, created_at). */
export async function exportCommissionsCsv(agencyId: string): Promise<string> {
  const rows = await listCommissions(agencyId)
  const header = ['business', 'agent', 'amount', 'pct', 'status', 'paid_at', 'created_at']
  const lines = rows.map((row) =>
    [
      row.listings?.business_name ?? '',
      row.profiles?.full_name ?? '',
      row.amount ?? '',
      row.commission_pct ?? '',
      row.status,
      row.paid_at ?? '',
      row.created_at,
    ]
      .map(csvField)
      .join(','),
  )
  return [header.join(','), ...lines].join('\n')
}

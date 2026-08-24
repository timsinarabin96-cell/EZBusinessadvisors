// =============================================================================
// Closing & Escrow Tracker
// -----------------------------------------------------------------------------
// Per-deal milestone checklist (LOI → PSA → diligence → escrow → close) plus
// escrow accounts with funding/release status. Gives brokers a clear progress
// view and countdown on every active transaction. Server-only.
// =============================================================================

import { createClient } from '@supabase/supabase-js'

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const svc =
  SUPABASE_URL && SERVICE_KEY
    ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
    : null

export const DEFAULT_MILESTONES: { title: string; category: string }[] = [
  { title: 'LOI signed', category: 'loi' },
  { title: 'Purchase agreement (PSA) drafted', category: 'psa' },
  { title: 'Due diligence completed', category: 'diligence' },
  { title: 'Escrow funded', category: 'escrow' },
  { title: 'Closing documents signed', category: 'closing' },
  { title: 'Transition / training completed', category: 'transition' },
]

// Per-stage checklist templates — brokers load the stage they're entering
// and get the full item list for that phase with one click.
export const STAGE_TEMPLATES: Record<string, { title: string; category: string }[]> = {
  loi: [
    { title: 'LOI signed', category: 'loi' },
    { title: 'Earnest money deposit collected', category: 'loi' },
    { title: 'Confidentiality (NDA) confirmed for buyer', category: 'loi' },
    { title: 'Financing pre-qualification letter received', category: 'loi' },
    { title: 'Timeline for diligence agreed', category: 'loi' },
  ],
  psa: [
    { title: 'Purchase agreement (PSA) drafted', category: 'psa' },
    { title: 'PSA reviewed by seller attorney', category: 'psa' },
    { title: 'PSA signed by both parties', category: 'psa' },
    { title: 'Deposit held in escrow', category: 'psa' },
    { title: 'Closing date + price locked', category: 'psa' },
  ],
  diligence: [
    { title: '3 years financials delivered', category: 'diligence' },
    { title: 'Tax returns reviewed', category: 'diligence' },
    { title: 'Lease assignment confirmed', category: 'diligence' },
    { title: 'Equipment / FFE inventory verified', category: 'diligence' },
    { title: 'Customer concentration review', category: 'diligence' },
    { title: 'Liens / litigation search clean', category: 'diligence' },
    { title: 'Due diligence completed', category: 'diligence' },
  ],
  escrow: [
    { title: 'Escrow account opened', category: 'escrow' },
    { title: 'Escrow funded', category: 'escrow' },
    { title: 'Title / UCC search ordered', category: 'escrow' },
    { title: 'Prorations agreed (rent, utilities)', category: 'escrow' },
    { title: 'Closing statement drafted', category: 'escrow' },
  ],
  closing: [
    { title: 'Closing documents signed', category: 'closing' },
    { title: 'Bill of sale executed', category: 'closing' },
    { title: 'Funds disbursed', category: 'closing' },
    { title: 'Keys / access transferred', category: 'closing' },
    { title: 'Licenses / permits transferred', category: 'closing' },
  ],
  transition: [
    { title: 'Transition / training completed', category: 'transition' },
    { title: 'Customer / vendor introductions made', category: 'transition' },
    { title: 'Post-close 30-day check-in', category: 'transition' },
  ],
}

export interface MilestoneInput {
  listing_id: string
  deal_id?: string | null
  title: string
  category?: string
  due_date?: string | null
  notes?: string | null
}

export interface ClosingProgress {
  listing_id: string
  total: number
  completed: number
  percent: number
  overdue: number
  nextDue: string | null
  categoryBreakdown: Record<string, { total: number; completed: number }>
}

/** Add a milestone to a deal. */
export async function addMilestone(input: MilestoneInput): Promise<{ ok: boolean; error?: string; milestone?: Record<string, unknown> }> {
  if (!svc) return { ok: false, error: 'Database is not configured' }
  if (!input.listing_id || !input.title) return { ok: false, error: 'listing_id and title are required' }

  const { data: listing } = await svc.from('listings').select('agency_id').eq('id', input.listing_id).maybeSingle()
  if (!listing?.agency_id) return { ok: false, error: 'Listing not found' }

  const { data, error } = await svc
    .from('deal_closing_milestones')
    .insert({
      agency_id: listing.agency_id,
      listing_id: input.listing_id,
      deal_id: input.deal_id || null,
      title: input.title,
      category: input.category || 'milestone',
      due_date: input.due_date || null,
      notes: input.notes || null,
    })
    .select()
    .single()
  if (error) return { ok: false, error: error.message }
  return { ok: true, milestone: data as Record<string, unknown> }
}

/** Seed the standard checklist for a listing if it has none yet. */
export async function seedMilestones(listingId: string): Promise<{ ok: boolean; error?: string }> {
  if (!svc) return { ok: false, error: 'Database is not configured' }
  const { data: listing } = await svc.from('listings').select('agency_id').eq('id', listingId).maybeSingle()
  if (!listing?.agency_id) return { ok: false, error: 'Listing not found' }

  const { count } = await svc
    .from('deal_closing_milestones')
    .select('id', { count: 'exact', head: true })
    .eq('listing_id', listingId)
  if ((count || 0) > 0) return { ok: true } // already seeded

  const rows = DEFAULT_MILESTONES.map((m, i) => ({
    agency_id: listing.agency_id,
    listing_id: listingId,
    title: m.title,
    category: m.category,
    sort_order: i,
  }))
  const { error } = await svc.from('deal_closing_milestones').insert(rows)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/** Load a per-stage checklist template into a listing's tracker (append). */
export async function loadStageTemplate(listingId: string, stage: string): Promise<{ ok: boolean; error?: string; added?: number }> {
  if (!svc) return { ok: false, error: 'Database is not configured' }
  const { data: listing } = await svc.from('listings').select('agency_id').eq('id', listingId).maybeSingle()
  if (!listing?.agency_id) return { ok: false, error: 'Listing not found' }

  const template = STAGE_TEMPLATES[stage]
  if (!template || template.length === 0) return { ok: false, error: 'Unknown stage template' }

  // Skip items already on the tracker (same title).
  const { data: existing } = await svc
    .from('deal_closing_milestones')
    .select('title')
    .eq('listing_id', listingId)
  const have = new Set((existing || []).map((m: any) => String(m.title).toLowerCase().trim()))

  const { data: maxRow } = await svc
    .from('deal_closing_milestones')
    .select('sort_order')
    .eq('listing_id', listingId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()
  let order = (maxRow?.sort_order ?? -1) + 1

  const rows = template
    .filter((m) => !have.has(m.title.toLowerCase().trim()))
    .map((m) => ({
      agency_id: listing.agency_id,
      listing_id: listingId,
      title: m.title,
      category: m.category,
      sort_order: order++,
    }))

  if (rows.length === 0) return { ok: true, added: 0 }
  const { error } = await svc.from('deal_closing_milestones').insert(rows)
  if (error) return { ok: false, error: error.message }
  return { ok: true, added: rows.length }
}

/** Complete / reopen / update a milestone. */
export async function updateMilestone(
  milestoneId: string,
  patch: { completed?: boolean; title?: string; due_date?: string | null; notes?: string | null; category?: string },
  actorProfileId?: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!svc) return { ok: false, error: 'Database is not configured' }

  const update: Record<string, unknown> = {}
  if (typeof patch.title === 'string') update.title = patch.title
  if (patch.due_date !== undefined) update.due_date = patch.due_date
  if (patch.notes !== undefined) update.notes = patch.notes
  if (typeof patch.category === 'string') update.category = patch.category
  if (typeof patch.completed === 'boolean') {
    if (patch.completed) {
      update.completed_at = new Date().toISOString()
      update.completed_by = actorProfileId || null
    } else {
      update.completed_at = null
      update.completed_by = null
    }
  }

  const { error } = await svc.from('deal_closing_milestones').update(update).eq('id', milestoneId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/** Remove a milestone. */
export async function deleteMilestone(milestoneId: string): Promise<{ ok: boolean; error?: string }> {
  if (!svc) return { ok: false, error: 'Database is not configured' }
  const { error } = await svc.from('deal_closing_milestones').delete().eq('id', milestoneId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/** Add or update an escrow account for a deal. */
export async function upsertEscrow(
  input: {
    listing_id: string
    deal_id?: string | null
    id?: string | null
    escrow_company?: string | null
    account_ref?: string | null
    amount?: number | null
    status?: string
    notes?: string | null
  },
): Promise<{ ok: boolean; error?: string; escrow?: Record<string, unknown> }> {
  if (!svc) return { ok: false, error: 'Database is not configured' }
  if (!input.listing_id) return { ok: false, error: 'listing_id is required' }

  const { data: listing } = await svc.from('listings').select('agency_id').eq('id', input.listing_id).maybeSingle()
  if (!listing?.agency_id) return { ok: false, error: 'Listing not found' }

  const payload: Record<string, unknown> = {
    agency_id: listing.agency_id,
    listing_id: input.listing_id,
    deal_id: input.deal_id || null,
    escrow_company: input.escrow_company || null,
    account_ref: input.account_ref || null,
    amount: input.amount ?? null,
    notes: input.notes || null,
  }
  if (input.status) {
    payload.status = input.status
    if (input.status === 'funded' && !input.id) payload.funded_at = new Date().toISOString()
    if (input.status === 'released' || input.status === 'refunded') payload.released_at = new Date().toISOString()
  }

  let result
  if (input.id) {
    result = await svc.from('deal_escrow_accounts').update(payload).eq('id', input.id).select().maybeSingle()
  } else {
    result = await svc.from('deal_escrow_accounts').insert(payload).select().maybeSingle()
  }
  if (result?.error) return { ok: false, error: result.error.message }
  return { ok: true, escrow: result?.data as Record<string, unknown> }
}

/** Fetch milestones + escrow accounts + progress for a listing. */
export async function fetchClosingTracker(listingId: string): Promise<{
  milestones: Record<string, unknown>[]
  escrow: Record<string, unknown>[]
  progress: ClosingProgress
} | null> {
  if (!svc) return null

  const [mRes, eRes] = await Promise.all([
    svc.from('deal_closing_milestones').select('*').eq('listing_id', listingId).order('sort_order', { ascending: true }),
    svc.from('deal_escrow_accounts').select('*').eq('listing_id', listingId).order('created_at', { ascending: true }),
  ])
  const milestones = (mRes.data || []) as Record<string, unknown>[]
  const escrow = (eRes.data || []) as Record<string, unknown>[]

  const now = new Date()
  let completed = 0
  let overdue = 0
  const categoryBreakdown: Record<string, { total: number; completed: number }> = {}
  let nextDue: string | null = null

  for (const m of milestones) {
    const cat = (m.category as string) || 'milestone'
    categoryBreakdown[cat] = categoryBreakdown[cat] || { total: 0, completed: 0 }
    categoryBreakdown[cat].total++
    if (m.completed_at) {
      completed++
      categoryBreakdown[cat].completed++
    } else if (m.due_date && new Date(m.due_date as string) < now) {
      overdue++
    }
    if (!m.completed_at && m.due_date && (!nextDue || new Date(m.due_date as string) < new Date(nextDue))) {
      nextDue = m.due_date as string
    }
  }

  const total = milestones.length
  return {
    milestones,
    escrow,
    progress: {
      listing_id: listingId,
      total,
      completed,
      percent: total ? Math.round((completed / total) * 100) : 0,
      overdue,
      nextDue,
      categoryBreakdown,
    },
  }
}

/** List listings with any closing-tracker activity for an agency. */
export async function listTrackedListings(agencyId: string): Promise<Record<string, unknown>[]> {
  if (!svc) return []
  const { data } = await svc
    .from('deal_closing_milestones')
    .select('listing_id, listings(id, business_name, asking_price, status)')
    .eq('agency_id', agencyId)
    .order('created_at', { ascending: false })
  if (!data?.length) return []
  const seen = new Set<string>()
  const out: Record<string, unknown>[] = []
  for (const row of data) {
    const listing = (row.listings as any) || null
    if (!listing || seen.has(listing.id)) continue
    seen.add(listing.id)
    out.push(listing)
  }
  return out
}

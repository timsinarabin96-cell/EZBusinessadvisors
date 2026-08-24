// =============================================================================
// Seller-Readiness Incubator — readiness scoring before a listing goes to market
// -----------------------------------------------------------------------------
// computeReadiness(listingId) checks: financial recast done, CIM/BOV generated,
// data room populated, asking price set, written seller approval on file, and
// compliance review passed. Produces a 0-100 score, a component breakdown, a
// concrete action-item list, and a valuation estimate, then upserts one row per
// listing (unique listing_id). Never throws.
// =============================================================================

import { createClient } from '@supabase/supabase-js'
import { completeWithDeepSeek } from './deepseek/client'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const svc =
  SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
    : null

// --- Types ------------------------------------------------------------------
export interface ReadinessComponents {
  financials: number
  cim: number
  bov: number
  dataRoom: number
  price: number
  approval: number
  compliance: number
}

export interface ReadinessSnapshot {
  id: string
  agency_id: string
  listing_id: string
  readiness_score: number
  components: ReadinessComponents
  action_items: string[]
  valuation_estimate: number | null
  updated_at: string
}

export interface ReadinessResult {
  ok: boolean
  snapshot?: ReadinessSnapshot
  error?: string
}

const clamp = (n: number, min = 0, max = 100) => Math.max(min, Math.min(max, Math.round(n)))

const COMPLIANT_STATUSES = new Set(['approved', 'compliant', 'complete', 'passed'])

// --- Funnel -------------------------------------------------------------------
export interface ReadinessFunnel {
  agencyId: string
  totalListings: number
  scored: number
  ready: number            // scored >= 75
  needsWork: number        // scored < 75
  active: number           // live on market
  inDeal: number           // pending_sale / under_contract
  closed: number           // sold
  avgScore: number | null
  topBlockers: { item: string; count: number }[]
}

/**
 * Agency-wide readiness-to-close funnel: how many listings are scored, market-
 * ready, live, in a deal, and closed — plus the most common blockers.
 */
export async function fetchReadinessFunnel(agencyId: string): Promise<{ ok: boolean; error?: string; funnel?: ReadinessFunnel }> {
  if (!svc) return { ok: false, error: 'Database is not configured' }
  if (!agencyId) return { ok: false, error: 'agencyId is required' }

  const [listingsRes, snapshotsRes] = await Promise.all([
    svc.from('listings').select('id, status').eq('agency_id', agencyId),
    svc.from('seller_readiness').select('listing_id, readiness_score, action_items').eq('agency_id', agencyId),
  ])
  if (listingsRes.error || snapshotsRes.error) {
    return { ok: false, error: listingsRes.error?.message || snapshotsRes.error?.message || 'Failed to load funnel' }
  }

  const listings = (listingsRes.data || []) as { id: string; status: string }[]
  const snapshots = (snapshotsRes.data || []) as { listing_id: string; readiness_score: number; action_items: string[] }[]
  const byListing = new Map(snapshots.map((s) => [s.listing_id, s]))

  let scored = 0
  let ready = 0
  let needsWork = 0
  let active = 0
  let inDeal = 0
  let closed = 0
  let scoreSum = 0
  const blockerCount = new Map<string, number>()

  for (const l of listings) {
    const snap = byListing.get(l.id)
    if (snap) {
      scored += 1
      scoreSum += snap.readiness_score
      if (snap.readiness_score >= 75) ready += 1
      else needsWork += 1
      for (const item of snap.action_items || []) {
        blockerCount.set(item, (blockerCount.get(item) || 0) + 1)
      }
    }
    if (l.status === 'active') active += 1
    if (l.status === 'pending_sale' || l.status === 'under_contract') inDeal += 1
    if (l.status === 'sold') closed += 1
  }

  const topBlockers = [...blockerCount.entries()]
    .map(([item, count]) => ({ item, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)

  const funnel: ReadinessFunnel = {
    agencyId,
    totalListings: listings.length,
    scored,
    ready,
    needsWork,
    active,
    inDeal,
    closed,
    avgScore: scored > 0 ? Math.round(scoreSum / scored) : null,
    topBlockers,
  }
  return { ok: true, funnel }
}

// --- "What's blocking" summary ------------------------------------------------
export interface BlockingSummary {
  listingId: string
  score: number
  blockers: string[]
  summary: string
  model: 'deterministic' | 'ai'
}

const BLOCKER_LINES: Record<string, string> = {
  'Recast financials': 'financials have not been recast, so buyers have no clean earnings picture',
  'Generate CIM': 'no CIM exists yet, which is the key selling document for buyers',
  'Generate BOV': 'no BOV has been prepared to justify the asking price',
  'Populate data room': 'the data room is empty, so serious buyers cannot start diligence',
  'Set asking price': 'no asking price is set, so the listing cannot go to market',
  'Get written seller approval': 'written seller approval is missing, which blocks going live',
  'Complete compliance review': 'compliance review has not passed, which is required before listing',
}

/**
 * Plain-language "what's blocking this listing from closing" summary.
 * Deterministic by default; polished by DeepSeek when configured (silent fallback).
 */
export async function buildBlockingSummary(snapshot: ReadinessSnapshot): Promise<BlockingSummary> {
  const blockers = (snapshot.action_items || []).filter(Boolean)
  const summary = buildDeterministicSummary(snapshot.readiness_score, blockers)

  if (blockers.length > 0 && process.env.DEEPSEEK_API_KEY) {
    try {
      const ai = await completeWithDeepSeek({
        context: {
          kind: 'support',
          entityId: snapshot.listing_id,
          text:
            `Seller-readiness score ${snapshot.readiness_score}/100. Open blockers: ${blockers.join(', ')}. ` +
            `Write 2-3 plain sentences telling the broker exactly what to fix first and why, as if advising a colleague.`,
        },
        message: 'Summarize what is blocking this listing from closing and what to fix first.',
        system: 'You are a deal-readiness advisor for a business brokerage. Be concise, specific, and actionable.',
        maxTokens: 200,
      })
      const polished = ai.text?.trim()
      if (polished) return { listingId: snapshot.listing_id, score: snapshot.readiness_score, blockers, summary: polished, model: 'ai' }
    } catch { /* fall back to deterministic */ }
  }

  return { listingId: snapshot.listing_id, score: snapshot.readiness_score, blockers, summary, model: 'deterministic' }
}

function buildDeterministicSummary(score: number, blockers: string[]): string {
  if (blockers.length === 0) {
    return 'Nothing is blocking this listing — it is fully ready for market. Get it live and start generating buyer interest.'
  }
  const top = blockers.slice(0, 3)
  const lines = top.map((b) => BLOCKER_LINES[b] || `${b.toLowerCase()} is outstanding`)
  const lead =
    score >= 75
      ? 'This listing is close to market-ready, but a few items are still blocking a clean close:'
      : score >= 45
        ? 'This listing is partially ready. The main blockers are:'
        : 'This listing is not ready for market yet. The critical blockers are:'
  const next = top[0]
  const nextLine = BLOCKER_LINES[next]
  const nextAction = nextLine
    ? `Start with ${next.toLowerCase()} — ${nextLine}.`
    : `Start with ${next.toLowerCase()}.`
  return `${lead} ${lines.join(' ')} ${nextAction}`
}

/**
 * Compute (and persist) a seller-readiness snapshot for a listing.
 * Never throws - returns { ok: false, error } on any failure.
 */
export async function computeReadiness(listingId: string): Promise<ReadinessResult> {
  if (!svc) return { ok: false, error: 'not configured' }
  try {
    // 1. Listing itself
    const { data: listing, error: listingError } = await svc
      .from('listings')
      .select('id, agency_id, business_name, asking_price, annual_revenue, sde, status, review_stage, compliance_status, approved_at')
      .eq('id', listingId)
      .maybeSingle()
    if (listingError || !listing) return { ok: false, error: listingError?.message || 'Listing not found' }

    // 2. Financial recast: financial_documents marked recast_done
    const { count: recastCount } = await svc
      .from('financial_documents')
      .select('id', { count: 'exact', head: true })
      .eq('listing_id', listingId)
      .eq('status', 'recast_done')
    const financialsDone = (recastCount || 0) > 0

    // 3. CIM / BOV generated
    const [{ count: cimCount }, { count: bovCount }] = await Promise.all([
      svc.from('cim_versions').select('id', { count: 'exact', head: true }).eq('listing_id', listingId),
      svc.from('bov_versions').select('id', { count: 'exact', head: true }).eq('listing_id', listingId),
    ])
    const cimDone = (cimCount || 0) > 0
    const bovDone = (bovCount || 0) > 0

    // 4. Data room populated (live files across the listing's rooms)
    const { data: rooms } = await svc.from('data_rooms').select('id').eq('listing_id', listingId)
    const roomIds = (rooms || []).map((r: { id: string }) => r.id)
    let fileCount = 0
    if (roomIds.length > 0) {
      const { count } = await svc
        .from('data_room_files')
        .select('id', { count: 'exact', head: true })
        .in('data_room_id', roomIds)
        .eq('is_deleted', false)
      fileCount = count || 0
    }

    // 5. Asking price set + written seller approval + compliance
    const priceSet = listing.asking_price != null && listing.asking_price > 0
    const approvalDone = listing.approved_at != null
    const complianceDone = COMPLIANT_STATUSES.has(String(listing.compliance_status || '').toLowerCase())

    // --- Score ---------------------------------------------------------------
    const components: ReadinessComponents = {
      financials: financialsDone ? 100 : 0,
      cim: cimDone ? 100 : 0,
      bov: bovDone ? 100 : 0,
      dataRoom: clamp((fileCount / 20) * 100),
      price: priceSet ? 100 : 0,
      approval: approvalDone ? 100 : 0,
      compliance: complianceDone ? 100 : 0,
    }
    const readinessScore = clamp(
      components.financials * 0.2 +
        components.cim * 0.15 +
        components.bov * 0.1 +
        components.dataRoom * 0.2 +
        components.price * 0.15 +
        components.approval * 0.1 +
        components.compliance * 0.1,
    )

    // --- Action items ----------------------------------------------------------
    const actionItems: string[] = []
    if (!financialsDone) actionItems.push('Recast financials')
    if (!cimDone) actionItems.push('Generate CIM')
    if (fileCount === 0) actionItems.push('Populate data room')
    if (!priceSet) actionItems.push('Set asking price')
    if (!approvalDone) actionItems.push('Get written seller approval')
    if (!complianceDone) actionItems.push('Complete compliance review')

    // --- Valuation estimate -----------------------------------------------------
    let valuationEstimate: number | null = null
    if (priceSet) {
      valuationEstimate = Number(listing.asking_price)
    } else if (listing.sde != null && listing.sde > 0) {
      valuationEstimate = Number(listing.sde) * 2.5
    } else if (listing.annual_revenue != null && listing.annual_revenue > 0) {
      valuationEstimate = Number(listing.annual_revenue) * 0.6
    }
    valuationEstimate = valuationEstimate != null ? Math.round(valuationEstimate * 100) / 100 : null

    // --- Persist (idempotent per listing) --------------------------------------
    const { data: snapshot, error: upsertError } = await svc
      .from('seller_readiness')
      .upsert(
        {
          agency_id: listing.agency_id,
          listing_id: listing.id,
          readiness_score: readinessScore,
          components,
          action_items: actionItems,
          valuation_estimate: valuationEstimate,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'listing_id' },
      )
      .select('*')
      .single()
    if (upsertError || !snapshot) return { ok: false, error: upsertError?.message || 'Failed to save readiness snapshot' }

    return { ok: true, snapshot: snapshot as unknown as ReadinessSnapshot }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Readiness computation failed' }
  }
}

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

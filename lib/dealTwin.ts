// =============================================================================
// Deal Twin v1 — per-listing health scoring
// -----------------------------------------------------------------------------
// computeDealTwin(listingId) pulls live signals (data room activity, data room
// buyers, offers, closing milestone progress, listing age / momentum), scores
// the listing 0-100 with a component breakdown, builds risk flags + a one-line
// summary, and upserts a deal_twin_snapshots row (unique listing_id).
// The function never throws: every failure degrades to a graceful result.
// =============================================================================

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const svc = SUPABASE_URL && SERVICE_KEY ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } }) : null

// --- Types ------------------------------------------------------------------
export interface DealTwinComponents {
  dataRoom: number
  buyers: number
  offers: number
  milestones: number
  momentum: number
}

export interface DealTwinSnapshot {
  id: string
  agency_id: string
  listing_id: string
  deal_id: string | null
  health_score: number
  risk_flags: string[]
  components: DealTwinComponents
  summary: string
  computed_at: string
}

export interface DealTwinResult {
  ok: boolean
  snapshot?: DealTwinSnapshot
  error?: string
}

// --- Helpers -----------------------------------------------------------------
const clamp = (n: number, min = 0, max = 100) => Math.max(min, Math.min(max, Math.round(n)))

const daysSince = (iso: string | null | undefined): number | null => {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return null
  return Math.max(0, (Date.now() - t) / 86_400_000)
}

/** Score data-room engagement from activity volume (0 -> 0, 20+ -> 100). */
function scoreDataRoom(activityCount: number): number {
  if (activityCount <= 0) return 0
  return clamp((activityCount / 20) * 100)
}

/** Score buyer engagement from the number of buyers admitted to the room. */
function scoreBuyers(buyerCount: number): number {
  if (buyerCount <= 0) return 0
  return clamp((buyerCount / 10) * 100)
}

/** Score offer momentum: drafts alone are weak, anything submitted is strong. */
function scoreOffers(statuses: string[]): number {
  if (statuses.length === 0) return 0
  const meaningful = statuses.filter((s) => s && s !== 'draft')
  if (meaningful.length > 0) return 100
  return 40
}

/** Score closing milestone progress as the completion percentage. */
function scoreMilestones(completed: number, total: number): number {
  if (total <= 0) return 0
  return clamp((completed / total) * 100)
}

/** Score momentum from recency of the last data-room activity. */
function scoreMomentum(lastActivityDays: number | null): number {
  if (lastActivityDays == null) return 0
  if (lastActivityDays < 7) return 100
  if (lastActivityDays < 14) return 80
  if (lastActivityDays < 30) return 50
  return 20
}

/**
 * Compute (and persist) a Deal Twin snapshot for a listing.
 * Never throws - returns { ok: false, error } on any failure.
 */
export async function computeDealTwin(listingId: string): Promise<DealTwinResult> {
  if (!svc) return { ok: false, error: 'not configured' }
  try {
    // 1. Listing itself
    const { data: listing, error: listingError } = await svc
      .from('listings')
      .select('id, agency_id, business_name, asking_price, status, created_at')
      .eq('id', listingId)
      .maybeSingle()
    if (listingError || !listing) return { ok: false, error: listingError?.message || 'Listing not found' }

    // 2. Data room signals (rooms belong to the listing; activity/buyers live there)
    const { data: rooms } = await svc.from('data_rooms').select('id').eq('listing_id', listingId)
    const roomIds = (rooms || []).map((r: { id: string }) => r.id)

    let activityCount = 0
    let lastActivityAt: string | null = null
    if (roomIds.length > 0) {
      const { count: activityCountRes } = await svc
        .from('data_room_activities')
        .select('id', { count: 'exact', head: true })
        .in('data_room_id', roomIds)
      activityCount = activityCountRes || 0

      const { data: lastActivity } = await svc
        .from('data_room_activities')
        .select('created_at')
        .in('data_room_id', roomIds)
        .order('created_at', { ascending: false })
        .limit(1)
      lastActivityAt = lastActivity?.[0]?.created_at || null
    }

    let buyerCount = 0
    if (roomIds.length > 0) {
      const { count: buyerCountRes } = await svc
        .from('data_room_buyers')
        .select('id', { count: 'exact', head: true })
        .in('data_room_id', roomIds)
      buyerCount = buyerCountRes || 0
    }

    // 3. Offers on the listing
    const { data: offers } = await svc.from('deal_offers').select('status').eq('listing_id', listingId)
    const offerStatuses = (offers || []).map((o: { status: string }) => o.status)

    // 4. Closing milestone progress
    const { data: milestones } = await svc
      .from('deal_closing_milestones')
      .select('completed_at, due_date')
      .eq('listing_id', listingId)
    const milestoneRows = (milestones || []) as { completed_at: string | null; due_date: string | null }[]
    const completedMilestones = milestoneRows.filter((m) => m.completed_at != null).length

    // 5. Optional linked deal for the snapshot's deal_id
    const { data: deal } = await svc.from('deals').select('id').eq('listing_id', listingId).maybeSingle()

    // --- Score ---------------------------------------------------------------
    const components: DealTwinComponents = {
      dataRoom: scoreDataRoom(activityCount),
      buyers: scoreBuyers(buyerCount),
      offers: scoreOffers(offerStatuses),
      milestones: scoreMilestones(completedMilestones, milestoneRows.length),
      momentum: scoreMomentum(daysSince(lastActivityAt)),
    }
    const healthScore = clamp(
      components.dataRoom * 0.25 +
        components.buyers * 0.2 +
        components.offers * 0.2 +
        components.milestones * 0.15 +
        components.momentum * 0.2,
    )

    // --- Risk flags ------------------------------------------------------------
    const riskFlags: string[] = []
    const lastActivityDays = daysSince(lastActivityAt)
    if (lastActivityDays == null || lastActivityDays > 14) riskFlags.push('no data room activity in 14d')
    if (offerStatuses.length === 0) riskFlags.push('no offers yet')
    const overdue = milestoneRows.some(
      (m) => m.completed_at == null && m.due_date && new Date(m.due_date).getTime() < Date.now(),
    )
    if (overdue) riskFlags.push('overdue milestones')
    if (milestoneRows.length === 0) riskFlags.push('no closing milestones tracked')
    const listingAgeDays = daysSince(listing.created_at)
    if (listingAgeDays != null && listingAgeDays > 180) riskFlags.push('listing aging over 6 months')

    // --- Summary sentence ------------------------------------------------------
    const name = listing.business_name || 'This listing'
    const offerWord = offerStatuses.length === 0 ? 'No offers yet' : `${offerStatuses.length} offer(s) on the table`
    const milestoneWord =
      milestoneRows.length === 0
        ? 'no closing milestones tracked'
        : `${completedMilestones}/${milestoneRows.length} closing milestones done`
    const roomWord = activityCount > 0 ? `${activityCount} data room activities` : 'no data room activity'
    const tone = healthScore >= 75 ? 'healthy' : healthScore >= 45 ? 'building momentum' : 'needs attention'
    const summary = `${name} is ${tone} (health ${healthScore}/100): ${roomWord}, ${buyerCount} buyer(s), ${offerWord}, ${milestoneWord}.`

    // --- Persist (idempotent per listing) --------------------------------------
    const { data: snapshot, error: upsertError } = await svc
      .from('deal_twin_snapshots')
      .upsert(
        {
          agency_id: listing.agency_id,
          listing_id: listing.id,
          deal_id: deal?.id || null,
          health_score: healthScore,
          risk_flags: riskFlags,
          components,
          summary,
          computed_at: new Date().toISOString(),
        },
        { onConflict: 'listing_id' },
      )
      .select('*')
      .single()
    if (upsertError || !snapshot) return { ok: false, error: upsertError?.message || 'Failed to save snapshot' }

    return { ok: true, snapshot: snapshot as unknown as DealTwinSnapshot }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Deal Twin computation failed' }
  }
}

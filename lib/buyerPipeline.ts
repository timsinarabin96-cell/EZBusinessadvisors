/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Buyer Pipeline — server-side operations.
// -----------------------------------------------------------------------------
// Stage transitions (with auto-log to buyer_pipeline_events + communications),
// pipeline board loading (buyers + heat + recent events), NQA submission, and
// the competitive-board consent flag. Agency-scoped; caller identity enforced
// by the API routes. Never throws — returns { ok, error? }.
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import { BUYER_STAGES, computeHeatScore, scoreNqa, nqaVerdict, type BuyerStage } from '@/lib/buyerPipelineCore'

export interface PipelineBuyer {
  id: string
  buyer_name: string | null
  buyer_email: string | null
  buyer_phone: string | null
  buyer_type: string | null
  nda_signed: boolean
  nda_signed_at: string | null
  financial_qualified: boolean
  is_primary_buyer: boolean
  pipeline_stage: BuyerStage
  stage_entered_at: string | null
  heat_score: number
  competitive_consent: boolean
  created_at: string
  recent_events: Array<{ from_stage: string | null; to_stage: string; note: string | null; created_at: string }>
  offers_count: number
}

export interface PipelineBoard {
  listingId: string
  buyers: PipelineBuyer[]
  funnel: Record<string, number>
}

/** Load the kanban board for a listing (agency-scoped query done by caller). */
export async function fetchPipelineBoard(
  db: SupabaseClient,
  listingId: string,
  agencyId: string,
): Promise<{ ok: boolean; board?: PipelineBoard; error?: string }> {
  const { data: buyers, error } = await db
    .from('buyer_lists')
    .select('*')
    .eq('listing_id', listingId)
    .order('created_at', { ascending: false })

  if (error) return { ok: false, error: error.message }

  const rows = (buyers || []) as any[]
  const ids = rows.map((b) => b.id)

  // Recent stage events for each buyer (auto-log trail).
  let events: Record<string, PipelineBuyer['recent_events']> = {}
  if (ids.length > 0) {
    const { data: ev } = await db
      .from('buyer_pipeline_events')
      .select('buyer_list_id, from_stage, to_stage, note, created_at')
      .in('buyer_list_id', ids)
      .eq('agency_id', agencyId)
      .order('created_at', { ascending: false })
      .limit(300)
    if (ev) {
      for (const e of ev) {
        const list = events[e.buyer_list_id] || []
        if (list.length < 5) list.push({ from_stage: e.from_stage, to_stage: e.to_stage, note: e.note, created_at: e.created_at })
        events[e.buyer_list_id] = list
      }
    }
  }

  // Offer counts per buyer (intent signal for heat).
  let offerCounts: Record<string, number> = {}
  if (ids.length > 0) {
    const { data: offs } = await db
      .from('deal_offers')
      .select('buyer_lead_id')
      .eq('listing_id', listingId)
    if (offs) {
      for (const o of offs) {
        if (o.buyer_lead_id) offerCounts[o.buyer_lead_id] = (offerCounts[o.buyer_lead_id] || 0) + 1
      }
    }
  }

  const buyersOut: PipelineBuyer[] = rows.map((b) => {
    const stage = BUYER_STAGES.includes(b.pipeline_stage) ? (b.pipeline_stage as BuyerStage) : 'new'
    return {
      id: b.id,
      buyer_name: b.buyer_name || null,
      buyer_email: b.buyer_email || null,
      buyer_phone: b.buyer_phone || null,
      buyer_type: b.buyer_type || null,
      nda_signed: !!b.nda_signed,
      nda_signed_at: b.nda_signed_at || null,
      financial_qualified: !!b.financial_qualified,
      is_primary_buyer: !!b.is_primary_buyer,
      pipeline_stage: stage,
      stage_entered_at: b.stage_entered_at || null,
      heat_score: Number(b.heat_score) || 0,
      competitive_consent: !!b.competitive_consent,
      created_at: b.created_at,
      recent_events: events[b.id] || [],
      offers_count: b.buyer_lead_id ? offerCounts[b.buyer_lead_id] || 0 : 0,
    }
  })

  const funnel: Record<string, number> = {}
  for (const s of BUYER_STAGES) funnel[s] = 0
  for (const b of buyersOut) funnel[b.pipeline_stage] += 1

  return { ok: true, board: { listingId, buyers: buyersOut, funnel } }
}

/**
 * Move a buyer to a new stage. Auto-logs the change to buyer_pipeline_events
 * AND to the communications log (deal timeline), and refreshes heat.
 */
export async function moveBuyerStage(
  db: SupabaseClient,
  args: {
    agencyId: string
    listingId: string
    buyerListId: string
    toStage: BuyerStage
    note?: string | null
    userId?: string | null
  },
): Promise<{ ok: boolean; error?: string }> {
  const { agencyId, listingId, buyerListId, toStage, note, userId } = args
  if (!BUYER_STAGES.includes(toStage)) return { ok: false, error: 'Invalid stage' }

  const { data: buyer, error: bErr } = await db
    .from('buyer_lists')
    .select('*')
    .eq('id', buyerListId)
    .eq('listing_id', listingId)
    .maybeSingle()
  if (bErr || !buyer) return { ok: false, error: bErr?.message || 'Buyer not found' }

  const fromStage = (BUYER_STAGES.includes(buyer.pipeline_stage) ? buyer.pipeline_stage : 'new') as BuyerStage
  if (fromStage === toStage) return { ok: true }

  // Stage transition + timestamp.
  const { error: upErr } = await db
    .from('buyer_lists')
    .update({ pipeline_stage: toStage, stage_entered_at: new Date().toISOString() })
    .eq('id', buyerListId)
  if (upErr) return { ok: false, error: upErr.message }

  // Auto-log the pipeline event (deal timeline source).
  await db.from('buyer_pipeline_events').insert({
    agency_id: agencyId,
    listing_id: listingId,
    buyer_list_id: buyerListId,
    from_stage: fromStage,
    to_stage: toStage,
    note: note || null,
    created_by: userId || null,
  })

  // Auto-log to communications so the deal timeline shows it everywhere.
  try {
    const { logCommunication } = await import('@/lib/communications')
    await logCommunication({
      agency_id: agencyId,
      direction: 'outbound',
      channel: 'other',
      outcome: 'other',
      summary: `Pipeline: ${fromStage} → ${toStage}${note ? ` — ${note}` : ''}`,
      listing_id: listingId,
      contact_name: buyer.buyer_name || buyer.buyer_email || null,
    })
  } catch { /* communications log is best-effort */ }

  // Side-effects on key stage changes.
  if (toStage === 'nda_signed' && !buyer.nda_signed) {
    await db.from('buyer_lists').update({ nda_signed: true, nda_signed_at: new Date().toISOString() }).eq('id', buyerListId)
  }
  if (toStage === 'qualified' && !buyer.financial_qualified) {
    await db.from('buyer_lists').update({ financial_qualified: true }).eq('id', buyerListId)
  }
  if (toStage === 'closed') {
    try {
      const { recordLOI } = await import('@/lib/workflow')
      await recordLOI(listingId, buyerListId)
    } catch { /* listing status update is best-effort */ }
  }

  // Refresh heat after the move.
  await refreshHeat(db, agencyId, buyerListId)

  return { ok: true }
}

/** Recompute and persist a buyer's heat score from current signals. */
export async function refreshHeat(db: SupabaseClient, agencyId: string, buyerListId: string): Promise<number> {
  const { data: buyer } = await db.from('buyer_lists').select('*').eq('id', buyerListId).maybeSingle()
  if (!buyer) return 0

  // Data-room views for this buyer (best-effort; may be 0).
  let dataRoomViews = 0
  try {
    const { data: views } = await db
      .from('data_room_activity')
      .select('id')
      .eq('agency_id', agencyId)
      .or(`buyer_id.eq.${buyerListId},buyer_email.eq.${buyer.buyer_email || ''}`)
      .limit(100)
    dataRoomViews = views?.length || 0
  } catch { /* no data_room_activity table / no rows */ }

  const score = computeHeatScore({
    ndaSigned: !!buyer.nda_signed,
    financiallyQualified: !!buyer.financial_qualified,
    dataRoomViews,
    hasOffer: false,
    daysSinceActivity: null,
  })

  await db.from('buyer_lists').update({ heat_score: score }).eq('id', buyerListId)
  return score
}

/** Submit NQA answers → score → persist → auto-qualify when strong. */
export async function submitNqa(
  db: SupabaseClient,
  args: {
    agencyId: string
    listingId: string
    buyerListId: string
    answers: Record<string, string>
  },
): Promise<{ ok: boolean; error?: string; score?: number; verdict?: string; label?: string }> {
  const { agencyId, listingId, buyerListId, answers } = args
  const score = scoreNqa(answers)
  const verdict = nqaVerdict(score)

  const { error } = await db.from('buyer_nqa_responses').insert({
    agency_id: agencyId,
    listing_id: listingId,
    buyer_list_id: buyerListId,
    answers,
    score,
  })
  if (error) return { ok: false, error: error.message }

  // Strong score → auto mark financially qualified + advance stage.
  if (verdict.verdict === 'qualified') {
    await db
      .from('buyer_lists')
      .update({ financial_qualified: true, qualification_notes: `NQA ${score}/100 — ${verdict.label}` })
      .eq('id', buyerListId)
    const b = await db.from('buyer_lists').select('pipeline_stage').eq('id', buyerListId).maybeSingle()
    if (b.data && b.data.pipeline_stage === 'new') {
      await moveBuyerStage(db, { agencyId, listingId, buyerListId, toStage: 'contacted' })
    }
  } else {
    await db
      .from('buyer_lists')
      .update({ qualification_notes: `NQA ${score}/100 — ${verdict.label}` })
      .eq('id', buyerListId)
  }

  return { ok: true, score, verdict: verdict.verdict, label: verdict.label }
}

/** Set the seller-consented competitive board flag on a listing. */
export async function setCompetitiveBoard(
  db: SupabaseClient,
  listingId: string,
  enabled: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await db
    .from('listings')
    .update({
      competitive_board_enabled: enabled,
      competitive_board_consented_at: enabled ? new Date().toISOString() : null,
    })
    .eq('id', listingId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

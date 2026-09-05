/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// LEAD RE-QUALIFICATION ENGINE (in-app, advisory — NEVER emails anyone)
// -----------------------------------------------------------------------------
// Re-scores an agency's existing buyer/seller leads from data already in the
// platform (verification flags, listing attachment, notes, criteria, recency).
// Pure deterministic scoring → 0-100 + tier (hot/warm/cold) + human-readable
// reasons. Results are written to lead_qualification_events (append-only,
// advisory). No lead rows are mutated and no outreach is performed.
// =============================================================================

import { createServerClient } from '@/lib/supabase/server'

export type QualTier = 'hot' | 'warm' | 'cold'
export type QualKind = 'buyer' | 'seller'

export interface QualResult {
  lead_id: string
  kind: QualKind
  name: string
  score: number
  tier: QualTier
  reasons: string[]
}

export interface RequalifySummary {
  ok: boolean
  error?: string
  ranAt?: string
  results: QualResult[]
  counts: { buyer: number; seller: number; hot: number; warm: number; cold: number }
}

const daysAgo = (iso: string | null | undefined, days: number) => {
  if (!iso) return false
  const t = new Date(iso).getTime()
  return !Number.isNaN(t) && Date.now() - t < days * 86400000
}

const nameOf = (row: Record<string, unknown>) =>
  (row.full_name as string) || (row.contact_name as string) || (row.business_name as string) || 'Unnamed'

const textLen = (row: Record<string, unknown>, keys: string[]) =>
  keys.reduce((n, k) => n + ((row[k] as string)?.length ?? 0), 0)

function scoreBuyer(row: Record<string, unknown>): QualResult {
  const reasons: string[] = []
  let score = 0

  if (row.verified_buyer) { score += 25; reasons.push('Verified buyer') }
  if (row.listing_id) { score += 20; reasons.push('Attached to a specific listing') }
  if (['contacted', 'qualified', 'converted', 'active'].includes((row.status as string) || '')) { score += 15; reasons.push(`Status: ${row.status}`) }
  if (textLen(row, ['notes', 'message']) > 80) { score += 10; reasons.push('Detailed notes / message on file') }
  if (row.budget_range || row.funds_available) { score += 10; reasons.push('Budget / funds on file') }
  if (row.desired_business_type || row.industries_interest || row.industry_interest) { score += 10; reasons.push('Has target criteria') }
  if (row.email && row.phone) { score += 5; reasons.push('Full contact info') }
  if (daysAgo(row.created_at as string, 30)) { score += 10; reasons.push('Engaged in last 30 days') }
  else if (daysAgo(row.created_at as string, 90)) { score += 5; reasons.push('Engaged in last 90 days') }
  if (reasons.length === 0) reasons.push('No qualification signals yet')

  const s = Math.min(100, score)
  return { lead_id: row.id as string, kind: 'buyer', name: nameOf(row), score: s, tier: s >= 70 ? 'hot' : s >= 45 ? 'warm' : 'cold', reasons }
}

function scoreSeller(row: Record<string, unknown>): QualResult | null {
  // Already-converted sellers are out of the qualification pool.
  if (row.converted_listing_id) return null
  const reasons: string[] = []
  let score = 0

  if (row.business_name) { score += 15; reasons.push('Business identified') }
  if (['contacted', 'qualified', 'active'].includes((row.status as string) || '')) { score += 15; reasons.push(`Status: ${row.status}`) }
  if (row.claimed_by) { score += 10; reasons.push('Assigned to an agent') }
  if (textLen(row, ['notes', 'message']) > 80) { score += 10; reasons.push('Detailed notes / message on file') }
  if (row.revenue_range) { score += 10; reasons.push('Revenue range on file') }
  if (row.email && row.phone) { score += 5; reasons.push('Full contact info') }
  if (daysAgo(row.created_at as string, 30)) { score += 10; reasons.push('Engaged in last 30 days') }
  else if (daysAgo(row.created_at as string, 90)) { score += 5; reasons.push('Engaged in last 90 days') }
  if (reasons.length === 0) reasons.push('No qualification signals yet')

  const s = Math.min(100, score)
  return { lead_id: row.id as string, kind: 'seller', name: nameOf(row), score: s, tier: s >= 70 ? 'hot' : s >= 45 ? 'warm' : 'cold', reasons }
}

/** Run re-qualification for an agency. Writes advisory events; no emails. */
export async function runRequalification(agencyId: string, createdBy?: string | null): Promise<RequalifySummary> {
  const db = createServerClient()
  if (!db) return { ok: false, error: 'not configured', results: [], counts: { buyer: 0, seller: 0, hot: 0, warm: 0, cold: 0 } }

  const [buyersRes, sellersRes] = await Promise.all([
    db
      .from('buyer_leads')
      .select('id, full_name, contact_name, email, phone, status, listing_id, verified_buyer, notes, message, budget_range, funds_available, desired_business_type, industry_interest, industries_interest, created_at')
      .eq('agency_id', agencyId)
      .limit(500),
    db
      .from('seller_leads')
      .select('id, full_name, contact_name, business_name, email, phone, status, converted_listing_id, claimed_by, notes, message, revenue_range, created_at')
      .eq('agency_id', agencyId)
      .limit(500),
  ])

  const results: QualResult[] = []
  for (const r of (buyersRes.data ?? []) as Record<string, unknown>[]) results.push(scoreBuyer(r))
  for (const r of (sellersRes.data ?? []) as Record<string, unknown>[]) {
    const scored = scoreSeller(r)
    if (scored) results.push(scored)
  }

  const tier = (t: QualTier) => results.filter((x) => x.tier === t).length
  const counts = {
    buyer: results.filter((x) => x.kind === 'buyer').length,
    seller: results.filter((x) => x.kind === 'seller').length,
    hot: tier('hot'),
    warm: tier('warm'),
    cold: tier('cold'),
  }

  // Append-only advisory log (best-effort — a write failure must not fail the run).
  if (results.length) {
    const rows = results.map((r) => ({
      agency_id: agencyId,
      lead_id: r.lead_id,
      lead_kind: r.kind,
      lead_name: r.name,
      score: r.score,
      tier: r.tier,
      reasons: r.reasons,
      created_by: createdBy ?? null,
    }))
    await db.from('lead_qualification_events').insert(rows)
  }

  return { ok: true, ranAt: new Date().toISOString(), results, counts }
}

/** Most recent qualification events for an agency (for display). */
export async function recentQualificationEvents(agencyId: string, limit = 200): Promise<Record<string, unknown>[]> {
  const db = createServerClient()
  if (!db) return []
  const { data } = await db
    .from('lead_qualification_events')
    .select('id, lead_id, lead_kind, lead_name, score, tier, reasons, created_at')
    .eq('agency_id', agencyId)
    .order('created_at', { ascending: false })
    .limit(limit)
  return (data ?? []) as Record<string, unknown>[]
}

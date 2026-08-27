/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Offer Compare Core — pure logic for the offer comparison table + health.
// -----------------------------------------------------------------------------
// Side-by-side offer rows, per-offer health verdict (Strong/Negotiate/Weak),
// and a "which offer" recommendation built from price, cash, risk, and buyer
// strength. No I/O — shared by API + UI, unit-tested.
// =============================================================================

export interface OfferRow {
  id: string
  buyerName?: string | null
  purchasePrice?: number | null
  cashAtClosing?: number | null
  sellerNote?: number | null
  earnout?: number | null
  financingContingency?: boolean
  diligenceDays?: number | null
  trainingDays?: number | null
  status?: string | null
  createdAt?: string | null
  closingProbability?: number | null
  sellerValueScore?: number | null
}

export type OfferHealth = 'strong' | 'negotiate' | 'weak'

export interface OfferHealthDetail {
  health: OfferHealth
  label: string
  score: number // 0-100
  reasons: string[]
}

/** Percentage of asking price the offer represents (null when unknown). */
export function priceRatio(offer: OfferRow, askingPrice?: number | null): number | null {
  if (!askingPrice || !offer.purchasePrice || askingPrice <= 0) return null
  return Math.round((offer.purchasePrice / askingPrice) * 100)
}

/** Total value = price + earnout (seller note is deferred, not value-add). */
export function totalValue(offer: OfferRow): number {
  return (offer.purchasePrice || 0) + (offer.earnout || 0)
}

/** Cash-at-close share of total value (0-100). */
export function cashShare(offer: OfferRow): number {
  const total = totalValue(offer)
  if (total <= 0) return 0
  return Math.round(((offer.cashAtClosing || 0) / total) * 100)
}

/** Per-offer health verdict with human-readable reasons. */
export function offerHealth(offer: OfferRow, askingPrice?: number | null): OfferHealthDetail {
  const reasons: string[] = []
  let score = 0

  const ratio = priceRatio(offer, askingPrice)
  if (ratio !== null) {
    if (ratio >= 95) { score += 40; reasons.push(`${ratio}% of asking — strong price`) }
    else if (ratio >= 85) { score += 25; reasons.push(`${ratio}% of asking — near market`) }
    else { score += 10; reasons.push(`${ratio}% of asking — below market`) }
  }

  const cash = cashShare(offer)
  if (cash >= 80) { score += 25; reasons.push(`cash-heavy (${cash}% at close)`) }
  else if (cash >= 50) { score += 15; reasons.push(`${cash}% cash at close`) }
  else { score += 5; reasons.push(`low cash at close (${cash}%)`) }

  if (offer.sellerNote) {
    const noteShare = Math.round(((offer.sellerNote || 0) / Math.max(1, totalValue(offer))) * 100)
    score -= Math.min(20, noteShare)
    reasons.push(`seller note ${noteShare}% (deferral risk)`)
  }

  if (!offer.financingContingency) { score += 10; reasons.push('no financing contingency') }
  else { score -= 5; reasons.push('financing contingency') }

  if ((offer.diligenceDays ?? 45) <= 45) { score += 5; reasons.push(`fast diligence (${offer.diligenceDays ?? 45}d)`) }
  if ((offer.trainingDays ?? 0) >= 30) { score += 5; reasons.push(`training support (${offer.trainingDays}d)`) }

  if (offer.closingProbability && offer.closingProbability >= 60) { score += 10; reasons.push(`closing probability ${offer.closingProbability}%`) }

  const finalScore = Math.max(0, Math.min(100, score))
  const health: OfferHealth = finalScore >= 70 ? 'strong' : finalScore >= 45 ? 'negotiate' : 'weak'
  const label = health === 'strong' ? 'Strong offer' : health === 'negotiate' ? 'Negotiate' : 'Weak offer'
  return { health, label, score: finalScore, reasons: reasons.slice(0, 4) }
}

export interface CompareRecommendation {
  bestOfferId: string | null
  summary: string
  ranked: Array<{ id: string; score: number; health: OfferHealth }>
}

/** Rank offers and recommend one to the seller. */
export function recommendOffer(offers: OfferRow[], askingPrice?: number | null): CompareRecommendation {
  if (offers.length === 0) return { bestOfferId: null, summary: 'No offers yet.', ranked: [] }
  const ranked = offers
    .map((o) => {
      const h = offerHealth(o, askingPrice)
      return { id: o.id, score: h.score, health: h.health, buyerName: o.buyerName }
    })
    .sort((a, b) => b.score - a.score)
  const best = ranked[0]
  const summary =
    best && best.score >= 70
      ? `Recommend ${best.buyerName || 'the top offer'} (${best.score}/100) — strong terms, worth taking to the seller.`
      : best
        ? `Best available: ${best.buyerName || 'top offer'} (${best.score}/100) — negotiate on cash or contingencies before presenting.`
        : 'No offers to compare.'
  return { bestOfferId: best?.id ?? null, summary, ranked }
}

/** Column summary of one offer for the side-by-side table. */
export function compareColumns(offers: OfferRow[], askingPrice?: number | null): Array<{ label: string; values: Array<string | number> }> {
  return [
    { label: 'Price', values: offers.map((o) => (o.purchasePrice ? `$${o.purchasePrice.toLocaleString()}` : '—')) },
    { label: 'vs asking', values: offers.map((o) => { const r = priceRatio(o, askingPrice); return r === null ? '—' : `${r}%` }) },
    { label: 'Cash at close', values: offers.map((o) => (o.cashAtClosing ? `$${o.cashAtClosing.toLocaleString()}` : '—')) },
    { label: 'Seller note', values: offers.map((o) => (o.sellerNote ? `$${o.sellerNote.toLocaleString()}` : '—')) },
    { label: 'Earnout', values: offers.map((o) => (o.earnout ? `$${o.earnout.toLocaleString()}` : '—')) },
    { label: 'Financing', values: offers.map((o) => (o.financingContingency ? 'Contingent' : 'None')) },
    { label: 'Diligence', values: offers.map((o) => (o.diligenceDays ? `${o.diligenceDays}d` : '—')) },
    { label: 'Training', values: offers.map((o) => (o.trainingDays ? `${o.trainingDays}d` : '—')) },
    { label: 'Health', values: offers.map((o) => offerHealth(o, askingPrice).label) },
  ]
}

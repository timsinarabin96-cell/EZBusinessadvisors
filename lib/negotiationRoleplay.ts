/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Negotiation Roleplay — learn-by-doing for deal terms.
// Pure scenario data + deterministic scoring core. The broker negotiates with
// an AI buyer/seller persona via /api/training/roleplay; each round the AI
// adapts. Scoring is band-based on the final agreed terms vs. the walk-away
// range, so the core pass needs no model.
// =============================================================================

export interface RoleplayRole {
  side: 'buyer' | 'seller'
  label: string
  opening: string
}

export interface RoleplayScenario {
  id: string
  title: string
  deal: string
  asking_price: number
  sde: number
  fair_range: [number, number] // defensible closing band (price)
  walk_away: [number, number] // hard limits: buyer won't exceed, seller won't go below
  roles: { buyer: RoleplayRole; seller: RoleplayRole }
  tips: string[]
}

export const ROLEPLAY_SCENARIOS: RoleplayScenario[] = [
  {
    id: 'family-deli-sale',
    title: 'Family Deli — the classic Main Street tug-of-war',
    deal: 'A beloved corner deli asking $340,000. SDE is $128,000. The sellers (a couple) want to retire in 18 months; the buyer is a first-time owner-operator with SBA pre-approval.',
    asking_price: 340000,
    sde: 128000,
    fair_range: [280000, 320000],
    walk_away: [250000, 360000],
    roles: {
      buyer: {
        side: 'buyer',
        label: 'First-time buyer (you)',
        opening: 'I love the location and the regulars. But the asking price feels rich for a deli — the equipment is dated and I will need SBA financing, so the bank will push on price too.',
      },
      seller: {
        side: 'seller',
        label: 'Retiring founders',
        opening: 'This deli has been our life for 22 years. The price reflects 25 years of goodwill — the regulars are loyal and the numbers are real. We can help transition for a few months, but we are firm on the value.',
      },
    },
    tips: [
      'Anchor with data: 128k SDE × 2.2–2.5× = $281k–$320k. Start below the fair range, not at asking.',
      'Seller financing is a lever: a 20% seller note at 6% can bridge a $20–30k gap both sides can live with.',
      'Give a face-saving win: pay closer to $300k but ask for 3 months of paid transition training.',
      'Never bid against yourself — silence after your number is a tool.',
    ],
  },
  {
    id: 'homecare-sale',
    title: 'Home Care Agency — recurring revenue standoff',
    deal: 'A home-care agency asking $1,450,000. SDE is $310,000 (4.7× asking — above the 4–5× band). Two referral sources are 60% of revenue, which the buyer flagged in diligence.',
    asking_price: 1450000,
    sde: 310000,
    fair_range: [1200000, 1400000],
    walk_away: [1080000, 1520000],
    roles: {
      buyer: {
        side: 'buyer',
        label: 'Regional care operator (you)',
        opening: 'The care contracts are attractive, but 60% of revenue sits with two referral sources. I need a holdback tied to those contracts surviving the transition, or the price has to come down.',
      },
      seller: {
        side: 'seller',
        label: 'Founder (single-owner)',
        opening: 'We built this agency contract by contract. The referral mix is a strength — those sources have been with us for 6+ years. I am not discounting for quality relationships.',
      },
    },
    tips: [
      'Structure beats discount: offer near asking but with a 12-month earn-out on the two big referral sources.',
      'Market band is 4–5× SDE — asking at 4.7× is defensible only if concentration risk is solved.',
      'A seller note + earn-out shifts risk to the party who can control it.',
      'Write the walk-away down before you walk in: 1.08M is the floor.',
    ],
  },
  {
    id: 'franchise-resale',
    title: 'Franchise Resale — the royalty drag argument',
    deal: 'A franchise QSR asking $520,000. SDE is $196,000 (2.65×). Franchisor must approve the buyer; royalty + ad fund is 9% of revenue. The buyer wants a discount for the franchise drag.',
    asking_price: 520000,
    sde: 196000,
    fair_range: [430000, 490000],
    walk_away: [390000, 540000],
    roles: {
      buyer: {
        side: 'buyer',
        label: 'Experienced operator (you)',
        opening: 'The unit economics are solid, but 9% off the top to the franchisor is a permanent drag. Independents at this SDE trade at 3×; franchises trade at a discount. I am at $430k.',
      },
      seller: {
        side: 'seller',
        label: 'Franchisee (moving on)',
        opening: 'The franchise system is exactly why the unit prints money — the brand brings customers through the door. $520k is below what I was advised to ask.',
      },
    },
    tips: [
      'Franchise multiples run 2.0–2.8× SDE — use comps, not feelings, to defend the discount.',
      'Franchisor approval risk is a real term: make the offer contingent on approval to protect yourself.',
      'If the seller resists price, ask for equipment/fixtures inclusion or a training period instead.',
      'Your walk-away is 390k — do not let brand nostalgia move it.',
    ],
  },
]

export interface RoleplayGrade {
  scenarioId: string
  agreedPrice: number
  sdeMultiple: number
  inFairRange: boolean
  insideWalkAway: boolean
  score: number
  passed: boolean
  feedback: string[]
}

const FAIR_TOLERANCE = 0.06 // 6% around the fair band
const WALK_TOLERANCE = 0.04 // 4% inside walk-away limits

/** Grade a final agreed price against the scenario bands. Deterministic. */
export function gradeRoleplay(scenario: RoleplayScenario, agreedPrice: number): RoleplayGrade {
  const multiple = agreedPrice / scenario.sde
  const inFairRange = agreedPrice >= scenario.fair_range[0] && agreedPrice <= scenario.fair_range[1]
  const insideWalkAway = agreedPrice >= scenario.walk_away[0] && agreedPrice <= scenario.walk_away[1]

  let score = 0
  if (insideWalkAway) score += 40
  if (inFairRange) score += 60
  else if (insideWalkAway) score += 25 // closed but outside the defensible band

  const feedback: string[] = []
  feedback.push(
    inFairRange
      ? `✅ Closed at $${agreedPrice.toLocaleString()} (${multiple.toFixed(1)}× SDE) — right in the defensible band ($${scenario.fair_range[0].toLocaleString()}–$${scenario.fair_range[1].toLocaleString()}).`
      : insideWalkAway
        ? `⚠️ Closed at $${agreedPrice.toLocaleString()} (${multiple.toFixed(1)}× SDE) — inside your walk-away but outside the fair band ($${scenario.fair_range[0].toLocaleString()}–$${scenario.fair_range[1].toLocaleString()}). A better structure could have bridged this.`
        : `❌ $${agreedPrice.toLocaleString()} (${multiple.toFixed(1)}× SDE) is outside your walk-away ($${scenario.walk_away[0].toLocaleString()}–$${scenario.walk_away[1].toLocaleString()}). You overpaid or left value on the table.`,
  )
  if (score >= 60) feedback.push('💡 Great discipline — you anchored with data and stayed in the band.')
  else feedback.push(`💡 Revisit: ${scenario.tips[0]}`)

  return {
    scenarioId: scenario.id,
    agreedPrice,
    sdeMultiple: multiple,
    inFairRange,
    insideWalkAway,
    score,
    passed: score >= 65,
    feedback,
  }
}

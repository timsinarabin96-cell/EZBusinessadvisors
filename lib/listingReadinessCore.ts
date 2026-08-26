/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// listingReadinessCore — pure, dependency-free listing readiness scorer.
// Turns a snapshot of listing state into: a 0-100 readiness score, per-step
// status (done / partial / missing / optional), publish blockers, and the
// single best next action. Mirrors the 10-step guided workflow.
// Unit-testable without a database.
// =============================================================================

export interface ListingSnapshot {
  listing: {
    business_name: string | null
    headline: string | null
    description: string | null
    industry: string | null
    location_general: string | null
    asking_price: number | null
    sde: number | null
    ebitda: number | null
    annual_revenue: number | null
    status: string | null
    has_cover_image: boolean
  }
  workflow: { current_step: number; completed_steps: number[] } | null
  documents: { has_listing_agreement: boolean }
  financials: { exists: boolean; has_sde: boolean; has_revenue: boolean }
  recast: { exists: boolean }
  bov: { exists: boolean; finalized: boolean }
  cim: { exists: boolean; finalized: boolean }
  bli: { exists: boolean; finalized: boolean }
  sba: { exists: boolean }
}

export type StepStatus = 'done' | 'partial' | 'missing' | 'optional_done' | 'optional' | 'na'

export interface StepReadiness {
  step: number
  key: string
  label: string
  icon: string
  status: StepStatus
  note: string
  required: boolean // required before publish
}

export interface ReadinessResult {
  score: number // 0-100
  grade: 'A' | 'B' | 'C' | 'D' | 'F'
  steps: StepReadiness[]
  blockers: string[] // human-readable reasons publish is blocked
  nextAction: string // single best next action
  canPublish: boolean
  isListed: boolean
}

const STEP_META: { step: number; key: string; label: string; icon: string; required: boolean }[] = [
  { step: 1, key: 'legal_docs', label: 'Legal Docs', icon: '📄', required: true },
  { step: 2, key: 'financials', label: 'Financial Details', icon: '💰', required: true },
  { step: 3, key: 'recast', label: 'Recast Financials', icon: '🔄', required: true },
  { step: 4, key: 'bov', label: 'Generate BOV', icon: '⚖️', required: true },
  { step: 5, key: 'cim', label: 'Generate CIM', icon: '📑', required: true },
  { step: 6, key: 'bli', label: 'Generate BLI', icon: '📋', required: true },
  { step: 7, key: 'sba', label: 'SBA Qualification', icon: '🏦', required: false },
  { step: 8, key: 'list', label: 'List Business', icon: '🌐', required: true },
  { step: 9, key: 'buyers', label: 'Buyer Management', icon: '👥', required: false },
  { step: 10, key: 'closing', label: 'Deal Closing', icon: '🤝', required: false },
]

export function computeReadiness(s: ListingSnapshot): ReadinessResult {
  const done = new Set((s.workflow?.completed_steps || []).map(Number))
  const listed = s.listing.status === 'active'

  const stepChecks: (() => { status: StepStatus; note: string })[] = [
    // Step 1 — legal docs
    () => {
      if (!s.documents.has_listing_agreement) return { status: 'missing', note: 'No signed listing agreement on file' }
      return { status: 'done', note: 'Listing agreement on file' }
    },
    // Step 2 — financials
    () => {
      if (!s.financials.exists) return { status: 'missing', note: 'No financial details entered' }
      if (s.financials.has_sde) return { status: 'done', note: 'SDE captured' }
      return { status: 'partial', note: 'Financials started — SDE missing' }
    },
    // Step 3 — recast
    () => {
      if (!s.recast.exists) return { status: 'missing', note: 'No recast prepared' }
      return { status: 'done', note: 'Recast prepared' }
    },
    // Step 4 — BOV
    () => {
      if (!s.bov.exists) return { status: 'missing', note: 'BOV not generated' }
      if (s.bov.finalized) return { status: 'done', note: 'BOV generated & finalized' }
      return { status: 'partial', note: 'BOV generated — not finalized' }
    },
    // Step 5 — CIM
    () => {
      if (!s.cim.exists) return { status: 'missing', note: 'CIM not generated' }
      if (s.cim.finalized) return { status: 'done', note: 'CIM generated & finalized' }
      return { status: 'partial', note: 'CIM generated — not finalized' }
    },
    // Step 6 — BLI
    () => {
      if (!s.bli.exists) return { status: 'missing', note: 'BLI not generated' }
      return { status: 'done', note: 'BLI generated' }
    },
    // Step 7 — SBA (optional)
    () => (s.sba.exists ? { status: 'optional_done', note: 'SBA qualification prepared' } : { status: 'optional', note: 'Optional — not required to list' }),
    // Step 8 — publish readiness
    () => {
      const missing: string[] = []
      if (!s.listing.headline) missing.push('headline')
      if (!s.listing.description) missing.push('description')
      if (!s.listing.industry) missing.push('industry')
      if (!s.listing.location_general) missing.push('location')
      if (s.listing.asking_price == null) missing.push('asking price')
      if (!s.listing.has_cover_image) missing.push('cover image')
      if (listed) return { status: 'done', note: 'Listing is live' }
      if (missing.length === 0) return { status: 'done', note: 'Profile complete — ready to publish in Step 8' }
      return { status: 'partial', note: `Missing: ${missing.join(', ')}` }
    },
    // Step 9 — buyers (optional)
    () => (done.has(9) ? { status: 'optional_done', note: 'Buyer management active' } : { status: 'optional', note: 'Optional — set up after listing' }),
    // Step 10 — closing (na until listed)
    () => {
      if (!listed) return { status: 'na', note: 'Not started — begins after listing' }
      return done.has(10) ? { status: 'optional_done', note: 'Closing workflow active' } : { status: 'optional', note: 'Optional until a deal forms' }
    },
  ]

  const steps: StepReadiness[] = STEP_META.map((m, i) => {
    const { status, note } = stepChecks[i]()
    return { ...m, status, note }
  })

  // Score: required steps are the denominator; done/partial counts weight
  // 100%/50%. Optional steps add no penalty but can add small bonus.
  const required = steps.filter((st) => st.required)
  const doneRequired = required.filter((st) => st.status === 'done').length
  const partialRequired = required.filter((st) => st.status === 'partial').length
  const raw = (doneRequired + partialRequired * 0.5) / required.length
  const optionalBonus = steps.filter((st) => st.status === 'optional_done').length * 2
  const score = Math.max(0, Math.min(100, Math.round(raw * 100 + optionalBonus)))
  const grade: ReadinessResult['grade'] = score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 55 ? 'C' : score >= 35 ? 'D' : 'F'

  // Blockers — only required steps, in workflow order, first 3 for the UI.
  const blockers: string[] = []
  for (const st of steps) {
    if (!st.required) continue
    if (st.status === 'missing' || st.status === 'partial') blockers.push(st.note)
  }

  // Next action: first incomplete required step, else first optional gap.
  const firstBlocked = steps.find((st) => st.required && st.status !== 'done')
  const nextAction = firstBlocked
    ? `Complete ${firstBlocked.label.toLowerCase()}: ${firstBlocked.note}`
    : !listed
      ? 'Everything is ready — publish the listing to go live'
      : 'Listing is live — set up buyer management'

  const canPublish = !listed && blockers.length === 0

  return { score, grade, steps, blockers, nextAction, canPublish, isListed: listed }
}

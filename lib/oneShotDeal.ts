/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// lib/oneShotDeal.ts — ONE-SHOT DEAL BUILDER core.
// -----------------------------------------------------------------------------
// The heart and brain of the platform: a single input (paste notes / drop
// docs) → one "Build Entire Deal" action → a complete, verified, publish-ready
// deal. This module holds the pure, testable core: pipeline stage definitions,
// prompt builders, the auditor (verified vs estimated tags + red flags), and
// the comps/valuation math. Network + DB work lives in the API route.
// =============================================================================

export type StageStatus = 'pending' | 'running' | 'done' | 'skipped' | 'failed'

export interface BuildStep {
  key: string
  label: string
  status: StageStatus
  note?: string
}

export interface OneShotStageDef {
  key: string
  label: string
  hint: string
}

/** The full One-Shot pipeline — every stage runs inside one build. */
export const ONE_SHOT_STAGES: OneShotStageDef[] = [
  { key: 'intake', label: 'Capturing the deal record', hint: 'Extracts the business, financials and seller story from your notes' },
  { key: 'docs', label: 'Reading your financial documents', hint: 'Universal reader — tax returns, P&Ls, Excel, CSV, images' },
  { key: 'audit', label: 'Verifying every number', hint: 'Tags each figure verified-from-source vs estimated; flags red flags' },
  { key: 'recast', label: 'Recasting financials with add-backs', hint: 'Owner-adjusted earnings → clean SDE/EBITDA picture' },
  { key: 'documents', label: 'Generating BOV, CIM & BLI', hint: 'Broker Opinion of Value, Confidential Info Memo, Listing Info' },
  { key: 'sba', label: 'SBA eligibility check', hint: '7(a) readiness heuristic' },
  { key: 'comps', label: 'Pricing against your comps database', hint: 'Sold comps + market multiples → valuation range' },
  { key: 'buyers', label: 'Matching qualified buyers', hint: 'Scans the buyer pipeline for overlap' },
  { key: 'photos', label: 'Generating AI photos', hint: '4 professional options for the gallery' },
  { key: 'teaser', label: 'Writing the public teaser', hint: 'Anonymous title, summary and highlights' },
  { key: 'ready', label: 'Readiness score', hint: 'What is complete, what still needs a human' },
]

export function initialSteps(): BuildStep[] {
  return ONE_SHOT_STAGES.map((s) => ({ key: s.key, label: s.label, status: 'pending' as StageStatus }))
}

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

export interface RecordExtractionInput {
  notes: string
  docSummaries?: string[]
}

// ---------------------------------------------------------------------------
// Deterministic record fallback — used when the LLM extraction flakes (rate
// limit, timeout, empty JSON). Regex-extracts the key deal figures straight
// from broker notes so the pipeline NEVER produces an incomplete listing.
// Pure + testable. Returns only fields it can actually find in the text.
// ---------------------------------------------------------------------------
function labeledFigure(notes: string, label: RegExp): number | null {
  // Wrap alternations (annual revenue|revenue) so the $ figure suffix applies
  // to EVERY branch, not just the last one. Also captures shorthand suffixes
  // ($610k, $1.2M, "$3 million") which are ubiquitous in broker notes.
  const m = notes.match(
    new RegExp(`(?:${label.source})\\s*(?:of\\s*)?\\$?[\\d][\\d,]*(?:\\.\\d+)?\\s*(?:[kKmM]|thousand|million)?`, 'i'),
  )
  if (!m) return null
  const digits = m[0].match(/\$?([\d][\d,]*(?:\.\d+)?)\s*([kKmM]|thousand|million)?/)
  if (!digits) return null
  let n = Number(digits[1].replace(/,/g, ''))
  if (!Number.isFinite(n)) return null
  const suffix = (digits[2] || '').toLowerCase()
  if (suffix === 'k' || suffix === 'thousand') n *= 1_000
  else if (suffix === 'm' || suffix === 'million') n *= 1_000_000
  return n
}

export function fallbackExtractRecord(notes: string): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  const asking = labeledFigure(notes, /asking(?:\s*price)?/)
  if (asking != null) out.asking_price = asking
  const revenue = labeledFigure(notes, /annual\s+revenue|gross\s+revenue|revenue/)
  if (revenue != null) out.annual_revenue = revenue
  const sde = labeledFigure(notes, /sde|owner'?s?\s+discretionary\s+earnings/)
  if (sde != null) out.sde = sde
  const ebitda = labeledFigure(notes, /ebitda/)
  if (ebitda != null) out.ebitda = ebitda

  const emp = notes.match(/(\d{1,3})\s*(?:full[- ]time\s+)?employees?/i)
  if (emp) out.employees_full_time = Number(emp[1])
  const year = notes.match(/est(?:ablished)?\s+(?:in\s+)?((?:19|20)\d{2})/i)
  if (year) out.established_year = Number(year[1])

  // Years at current location: "at this location for 12 years" / "12 years at
  // this location" / "operated here since 2010".
  const yearsLoc = notes.match(/(\d{1,2})\s*(?:\+?)\s*years?\s+at\s+(?:this|the|same|current)\s+location/i)
  if (yearsLoc) out.years_at_location = Number(yearsLoc[1])
  else {
    const since = notes.match(/at\s+this\s+location\s+(?:since|for)\s+(?:(\d{1,2})\s+years?|(?:19|20)\d{2})/i)
    if (since) out.years_at_location = Number(since[1])
  }

  // Legal / risk flags — capture the presence + short note.
  const franchise = notes.match(/franchise(?:\s+agreement)?[^.]{0,120}/i)
  if (franchise) out.franchise_agreements = franchise[0].trim()
  const litigation = notes.match(/(?:pending\s+)?litigation[^.]{0,120}/i)
  if (litigation) out.pending_litigation = litigation[0].trim()
  const env = notes.match(/environmental[^.]{0,120}/i)
  if (env) out.environmental_issues = env[0].trim()
  const cust = notes.match(/key\s+customer[^.]{0,120}/i)
  if (cust) out.key_customer_contracts = cust[0].trim()
  const supp = notes.match(/key\s+supplier[^.]{0,120}/i)
  if (supp) out.key_supplier_contracts = supp[0].trim()

  // Location: "in Greater Philadelphia, PA" / "located in Austin, TX" — first
  // City, ST-style pair found.
  const loc = notes.match(/in\s+([A-Z][A-Za-z .-]+(?:,\s*[A-Z]{2})?)/i)
  if (loc) out.location_general = loc[1].trim()

  return out
}

/**
 * Ask the LLM to turn raw notes + doc summaries into the listing record.
 * Conservative: null for anything not actually present in the source.
 */
export function buildRecordExtractionPrompt(input: RecordExtractionInput): { system: string; user: string } {
  const docs = (input.docSummaries || []).filter(Boolean)
  const system = [
    'You are a senior business-broker intake analyst. Convert raw broker notes and document summaries into a structured deal record.',
    'Return ONLY valid JSON matching the exact schema below. Never invent figures not present in the source — use null when unknown.',
    'Numbers must be plain integers (no commas, no currency symbols), USD.',
    'industry should be a broad category (e.g. "Food & Beverage", "Laundromat", "Business Services"). sub_industry may be more specific (e.g. "Coffee Shop").',
    'location_general should be "City, ST" format when determinable, else null.',
    'If the notes mention a phone number for the listing call line, include it in contact_phone.',
  ].join('\n\n')
  const user = [
    'BROKER NOTES:',
    input.notes.trim().slice(0, 6000) || '(no notes provided)',
    docs.length ? '\n\nDOCUMENT SUMMARIES:\n' + docs.map((d) => `- ${d}`).join('\n').slice(0, 4000) : '',
    '\n\nReturn JSON:',
    '{ "business_name": string|null, "industry": string|null, "sub_industry": string|null, "location_general": string|null, "asking_price": int|null, "annual_revenue": int|null, "sde": int|null, "ebitda": int|null, "employees_full_time": int|null, "established_year": int|null, "years_at_location": int|null, "description": string|null, "reason_for_sale": string|null, "transition_support": string|null, "competitive_advantages": string|null, "growth_opportunities": string|null, "franchise_agreements": string|null, "pending_litigation": string|null, "environmental_issues": string|null, "key_customer_contracts": string|null, "key_supplier_contracts": string|null, "public_title": string|null, "public_summary": string|null, "public_highlights": string[]|null, "contact_phone": string|null }',
  ].join('\n')
  return { system, user }
}

/** Teaser copy prompt — anonymous, compelling, no invented numbers. */
export function buildTeaserPrompt(input: { businessName?: string | null; industry?: string | null; location?: string | null; revenue?: number | null; sde?: number | null }): { system: string; user: string } {
  const system = [
    'You are a business-broker marketing writer. Write an anonymous marketplace teaser for a business for sale.',
    'Do NOT reveal the business name unless it is generic (e.g. "a coffee roastery" style is fine; proper brand names stay anonymous).',
    'Do not invent numbers beyond those supplied. Keep it under 90 words for the summary.',
    'Return ONLY valid JSON: { "public_title": string, "public_summary": string, "public_highlights": string[] }',
  ].join('\n\n')
  const user = `Business: ${input.businessName || 'undisclosed'}\nIndustry: ${input.industry || 'n/a'}\nLocation: ${input.location || 'n/a'}\nAnnual revenue: ${input.revenue != null ? '$' + input.revenue.toLocaleString() : 'undisclosed'}\nSDE: ${input.sde != null ? '$' + input.sde.toLocaleString() : 'undisclosed'}`
  return { system, user }
}

/** Deterministic teaser fallback — used when the LLM flakes (rate limit /
 *  timeout). Builds an anonymous title + summary from the record fields only;
 *  never invents numbers. Pure + testable, same spirit as fallbackExtractRecord. */
export function fallbackTeaser(input: { businessName?: string | null; industry?: string | null; location?: string | null; revenue?: number | null; sde?: number | null }): { public_title: string; public_summary: string; public_highlights: string[] } {
  const industry = (input.industry || 'business').toLowerCase()
  const location = (input.location || '').trim()
  const noun = /^[aeiou]/i.test(industry) ? 'an' : 'a'
  const title = [
    industry ? `${noun} ${industry} for sale` : 'Business for sale',
    location ? `in ${location}` : '',
  ].filter(Boolean).join(' ')
  const parts: string[] = ['Established business with a trained team and steady operations.']
  if (input.revenue != null) parts.push(`Revenue of $${input.revenue.toLocaleString()}.`)
  if (input.sde != null) parts.push(`Owner earnings of $${input.sde.toLocaleString()}.`)
  if (location) parts.push(`Located in ${location}.`)
  parts.push('Confidential process — financials available after qualification and NDA.')
  const highlights: string[] = []
  if (input.revenue != null) highlights.push(`💰 $${input.revenue.toLocaleString()} annual revenue`)
  if (input.sde != null) highlights.push(`📈 $${input.sde.toLocaleString()} owner earnings`)
  if (location) highlights.push(`📍 ${location}`)
  if (highlights.length === 0) highlights.push('🤝 Confidential sale process')
  return { public_title: title, public_summary: parts.join(' '), public_highlights: highlights.slice(0, 6) }
}

// ---------------------------------------------------------------------------
// The AUDITOR — verified vs estimated + red flags (pure, testable)
// ---------------------------------------------------------------------------

export interface AuditFigure {
  field: 'annual_revenue' | 'sde' | 'ebitda'
  value: number
  source: 'document' | 'notes' | 'estimated'
  sourceName?: string
}

export interface AuditResult {
  figures: AuditFigure[]
  redFlags: string[]
  notes: string[]
}

/**
 * Tag every financial figure with its trust level and produce red flags.
 * - figures with a matching doc extraction → 'document' (verified)
 * - figures only in the broker notes → 'notes'
 * - anything derived (e.g. EBITDA from SDE) → 'estimated'
 */
export function runAudit(input: {
  docFigures: { revenue?: number | null; sde?: number | null; ebitda?: number | null; sourceName?: string }
  noteFigures: { revenue?: number | null; sde?: number | null; ebitda?: number | null }
  askingPrice?: number | null
}): AuditResult {
  const figures: AuditFigure[] = []
  const redFlags: string[] = []
  const notes: string[] = []

  const push = (field: AuditFigure['field'], value: number | null | undefined, source: AuditFigure['source'], sourceName?: string) => {
    if (value == null || isNaN(value)) return
    figures.push({ field, value, source, sourceName })
  }

  push('annual_revenue', input.docFigures.revenue, 'document', input.docFigures.sourceName || 'financial document')
  push('sde', input.docFigures.sde, 'document', input.docFigures.sourceName || 'financial document')
  push('ebitda', input.docFigures.ebitda, 'document', input.docFigures.sourceName || 'financial document')

  // Figures present ONLY in notes → trust level 'notes'.
  if (input.noteFigures.revenue != null && input.docFigures.revenue == null) {
    push('annual_revenue', input.noteFigures.revenue, 'notes')
    notes.push('Annual revenue taken from broker notes — upload source docs to verify.')
  }
  if (input.noteFigures.sde != null && input.docFigures.sde == null) {
    push('sde', input.noteFigures.sde, 'notes')
    notes.push('SDE taken from broker notes — verify with a recast of source financials.')
  }
  if (input.noteFigures.ebitda != null && input.docFigures.ebitda == null) {
    push('ebitda', input.noteFigures.ebitda, 'notes')
  }

  // Derived EBITDA when SDE known but EBITDA not stated anywhere.
  const sde = input.docFigures.sde ?? input.noteFigures.sde
  const ebitda = input.docFigures.ebitda ?? input.noteFigures.ebitda
  if (sde != null && ebitda == null) {
    const est = Math.round(sde * 0.8)
    push('ebitda', est, 'estimated')
    notes.push(`EBITDA estimated at 80% of SDE (${'$' + est.toLocaleString()}) — refine after recast.`)
  }

  // Red flags.
  if (input.docFigures.revenue != null && input.docFigures.sde != null && input.docFigures.sde > input.docFigures.revenue) {
    redFlags.push('SDE exceeds revenue — check the source documents (possible mis-extraction).')
  }
  if (input.docFigures.revenue != null && input.docFigures.sde != null && input.docFigures.sde / input.docFigures.revenue > 0.6) {
    redFlags.push('SDE margin above 60% — unusually high; verify owner-comp and add-backs.')
  }
  if (input.docFigures.revenue != null && input.docFigures.sde != null && input.docFigures.sde / input.docFigures.revenue < 0.05) {
    redFlags.push('SDE margin below 5% — thin earnings; buyers and SBA will struggle.')
  }
  if (input.askingPrice != null && sde != null && sde > 0 && input.askingPrice / sde > 6) {
    redFlags.push(`Asking price is ${(input.askingPrice / sde).toFixed(1)}× SDE — above the typical SBA range; expect pushback.`)
  }
  if (input.askingPrice != null && sde != null && sde > 0 && input.askingPrice / sde < 1) {
    redFlags.push('Asking price below 1× SDE — possible distress sale or pricing error.')
  }

  // ── Smarter red flags (P1 pass) ──────────────────────────────────────────
  // Negative or zero earnings are impossible combos — never publish those.
  const sdeVal = input.docFigures.sde ?? input.noteFigures.sde
  const revVal = input.docFigures.revenue ?? input.noteFigures.revenue
  const ebitdaVal = input.docFigures.ebitda ?? input.noteFigures.ebitda
  if (sdeVal != null && sdeVal <= 0) {
    redFlags.push('SDE is zero or negative — a business must have positive owner earnings to list.')
  }
  if (ebitdaVal != null && ebitdaVal <= 0) {
    redFlags.push('EBITDA is zero or negative — check the recast; lenders will not underwrite.')
  }
  if (revVal != null && revVal <= 0) {
    redFlags.push('Revenue is zero or negative — impossible for an operating business; verify the source.')
  }
  if (sdeVal != null && ebitdaVal != null && ebitdaVal > sdeVal) {
    redFlags.push('EBITDA exceeds SDE — mathematically impossible (SDE ≥ EBITDA by definition).')
  }
  // Asking price with NO earnings basis at all → cannot price the deal.
  if (input.askingPrice != null && input.askingPrice > 0 && sdeVal == null && ebitdaVal == null) {
    redFlags.push('Asking price set but no SDE/EBITDA — add owner earnings before going live.')
  }
  // Revenue with no SDE and no EBITDA → suspiciously incomplete.
  if (revVal != null && revVal > 0 && sdeVal == null && ebitdaVal == null) {
    notes.push('Revenue present but no earnings figure — recast the financials to derive SDE/EBITDA.')
  }

  return { figures, redFlags, notes }
}

// ---------------------------------------------------------------------------
// Comps / valuation math (pure, testable)
// ---------------------------------------------------------------------------

export interface MultiplesSummary {
  industry: string
  avgMultiple: number
  count: number
}

export interface ValuationResult {
  low: number
  mid: number
  high: number
  multiple: number
  basis: 'SDE' | 'EBITDA'
  source: string
}

const DEFAULT_MULTIPLE = 2.8
const SPREAD = 0.18

/**
 * Valuation range from an earnings basis + the agency's sold-comp multiples.
 * Falls back to a conservative default multiple when no comps exist yet.
 */
export function valuationFromMultiples(input: {
  sde?: number | null
  ebitda?: number | null
  multiples: MultiplesSummary[]
}): ValuationResult | null {
  const basis = input.ebitda != null && input.ebitda > 0 && (input.sde == null || input.ebitda >= input.sde * 0.6)
    ? 'EBITDA' as const
    : 'SDE' as const
  const earnings = basis === 'EBITDA' ? input.ebitda : input.sde
  if (earnings == null || earnings <= 0) return null

  const match = input.multiples.find((m) => m.count >= 2)
  const multiple = match?.avgMultiple ?? DEFAULT_MULTIPLE
  const source = match
    ? `${match.count} sold comp${match.count === 1 ? '' : 's'} in ${match.industry} (avg ${multiple.toFixed(1)}×)`
    : `Default ${DEFAULT_MULTIPLE}× (no comps yet in the database)`

  const mid = Math.round(earnings * multiple)
  return {
    low: Math.round(mid * (1 - SPREAD)),
    mid,
    high: Math.round(mid * (1 + SPREAD)),
    multiple: Math.round(multiple * 10) / 10,
    basis,
    source,
  }
}

/** SBA 7(a) heuristic — profitable, serviceable deals price ≤6× SDE. */
export function sbaEligibility(input: { askingPrice?: number | null; sde?: number | null }): { eligible: boolean; note: string } {
  const { askingPrice, sde } = input
  if (sde == null || sde <= 0) return { eligible: false, note: 'Needs positive SDE to qualify for SBA 7(a)' }
  if (askingPrice == null || askingPrice <= 0) return { eligible: true, note: 'SDE positive — likely SBA-eligible (price TBD)' }
  const multiple = askingPrice / sde
  if (multiple <= 6) return { eligible: true, note: `${multiple.toFixed(1)}× SDE — within the typical SBA 7(a) range` }
  return { eligible: false, note: `${multiple.toFixed(1)}× SDE — above the usual SBA ceiling; lender will need a strong story` }
}

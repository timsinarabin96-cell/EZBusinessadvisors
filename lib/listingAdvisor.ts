/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Listing Advisor — the "ask the right questions" engine.
// -----------------------------------------------------------------------------
// Given a listing + its uploaded financial docs, produces the four things a
// broker needs before deciding whether to take a listing to market:
//
//   1. questions  — what to ask the seller (gap-driven + AI-polished)
//   2. valuation  — SDE/EBITDA multiple range + AI commentary
//   3. verdict    — is it worth listing? score + band + reasons
//   4. cimChecklist — exactly what to request from the seller for the best CIM
//
// Deterministic by default (zero token cost, works offline); DeepSeek-polished
// when DEEPSEEK_API_KEY is configured. Never throws.
// =============================================================================

import { createClient } from '@supabase/supabase-js'
import { complete, isClaudeConfigured } from './claude/client'
import { computeFinancialMetrics } from './financialExtractor'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const svc =
  SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
    : null

// --- Types ------------------------------------------------------------------
export interface AdvisorQuestion {
  id: string
  question: string
  why: string
  suggestedAnswers?: string[]
}

export interface AdvisorValuation {
  low: number | null
  mid: number | null
  high: number | null
  method: string
  confidence: 'high' | 'medium' | 'low'
  reasoning: string
  aiCommentary?: string
}

export interface AdvisorVerdict {
  score: number // 0–100 listability
  band: 'Ready to list' | 'Needs work' | 'Not ready'
  worthListing: boolean
  reasons: string[]
  blockers: string[]
}

export interface AdvisorCimItem {
  item: string
  why: string
  priority: 'must' | 'should' | 'nice'
}

export interface DocSummary {
  total: number
  taxReturns: number
  financialStatements: number
  bankStatements: number
  other: number
}

export interface AdvisorReport {
  listingId: string
  businessName: string | null
  generatedAt: string
  docs: DocSummary
  questions: AdvisorQuestion[]
  valuation: AdvisorValuation
  verdict: AdvisorVerdict
  cimChecklist: AdvisorCimItem[]
  model: 'ai' | 'deterministic'
}

interface AdvisorContext {
  listing: Record<string, any>
  docs: DocSummary
  metrics: ReturnType<typeof computeFinancialMetrics> | null
  gaps: string[]
}

// --- Context builder --------------------------------------------------------

/** Summarize what docs exist for a listing (service-role read). */
async function summarizeDocs(listingId: string): Promise<DocSummary> {
  const empty: DocSummary = { total: 0, taxReturns: 0, financialStatements: 0, bankStatements: 0, other: 0 }
  if (!svc) return empty
  const { data } = await svc
    .from('financial_documents')
    .select('category, file_name')
    .eq('listing_id', listingId)
  const files = (data || []) as Array<{ category?: string | null; file_name?: string | null }>
  const cat = (c?: string | null) => String(c || '').toLowerCase()
  for (const f of files) {
    empty.total += 1
    if (cat(f.category) === 'tax_return') empty.taxReturns += 1
    else if (cat(f.category) === 'financial_statement') empty.financialStatements += 1
    else if (cat(f.category) === 'bank_statement') empty.bankStatements += 1
    else empty.other += 1
  }
  return empty
}

/** The listing fields that matter for a pre-listing opinion. */
const LISTING_SELECT = [
  'id', 'agency_id', 'business_name', 'industry', 'sub_industry', 'location_general',
  'asking_price', 'annual_revenue', 'sde', 'ebitda', 'inventory_value', 'ffe_value',
  'real_estate_included', 'reason_for_sale', 'established_year',
  'employees_full_time', 'employees_part_time', 'owner_hours_weekly',
  'growth_opportunities', 'competitive_advantages', 'customer_concentration',
  'facilities_summary', 'lease_monthly', 'lease_expires_on',
  'seller_financing_available', 'transition_support', 'training_period_weeks',
  'franchise_agreements', 'pending_litigation', 'environmental_issues',
  'key_customer_contracts', 'key_supplier_contracts', 'years_at_location',
].join(', ')

function buildGaps(listing: Record<string, any>, docs: DocSummary): string[] {
  const gaps: string[] = []
  const has = (v: unknown) => v != null && String(v).trim() !== '' && Number(v) !== 0
  if (docs.total === 0) gaps.push('No financial documents uploaded yet')
  else {
    if (docs.taxReturns === 0) gaps.push('No tax returns on file (needed to verify reported numbers)')
    if (docs.financialStatements === 0) gaps.push('No P&L / financial statements on file')
    if (docs.bankStatements === 0) gaps.push('No bank statements on file (needed for bank-vs-books check)')
  }
  if (!has(listing.annual_revenue)) gaps.push('Annual revenue not set')
  if (!has(listing.sde)) gaps.push('SDE (seller\'s discretionary earnings) not set')
  if (!has(listing.asking_price)) gaps.push('No asking price set yet')
  if (!has(listing.lease_monthly)) gaps.push('Monthly lease/rent unknown')
  if (!has(listing.lease_expires_on)) gaps.push('Lease expiration date unknown')
  if (!has(listing.inventory_value)) gaps.push('Inventory value unknown (critical for c-stores / retail)')
  if (listing.real_estate_included == null) gaps.push('Unknown whether real estate is included in the sale')
  if (!has(listing.reason_for_sale)) gaps.push('Reason for sale not documented')
  if (!has(listing.owner_hours_weekly)) gaps.push('Owner hours per week unknown (affects SDE quality)')
  if (!has(listing.customer_concentration)) gaps.push('Customer concentration unknown (top-customer risk)')
  if (!has(listing.established_year)) gaps.push('Year established unknown')
  // Intake-gap fields (Stage 0) — the CIM needs these to replace
  // "confirm during diligence" with real facts.
  if (!has(listing.franchise_agreements)) gaps.push('Franchise / licensing structure unknown (or confirm none)')
  if (!has(listing.pending_litigation)) gaps.push('Litigation status unknown (or confirm none)')
  if (!has(listing.environmental_issues)) gaps.push('Environmental status unknown (or confirm none)')
  if (!has(listing.key_customer_contracts)) gaps.push('Key customer contracts not documented')
  if (!has(listing.key_supplier_contracts)) gaps.push('Key supplier contracts not documented')
  if (!has(listing.years_at_location)) gaps.push('Years at current location unknown')
  return gaps
}

async function buildContext(listingId: string): Promise<AdvisorContext | null> {
  if (!svc) return null
  const { data: listing } = await svc.from('listings').select(LISTING_SELECT).eq('id', listingId).maybeSingle()
  if (!listing) return null
  const docs = await summarizeDocs(listingId)
  const metrics = computeFinancialMetrics(listing as any)
  return { listing, docs, metrics, gaps: buildGaps(listing, docs) }
}

// --- Deterministic generation ------------------------------------------------

function buildDeterministicQuestions(ctx: AdvisorContext): AdvisorQuestion[] {
  const q: AdvisorQuestion[] = []
  const { listing, docs, gaps } = ctx
  const seen = new Set<string>()
  const add = (question: string, why: string, suggestedAnswers?: string[]) => {
    if (seen.has(question)) return
    seen.add(question)
    q.push({ id: `q${q.length + 1}`, question, why, suggestedAnswers })
  }

  // Docs coverage
  if (docs.total === 0) {
    add('Can you send the last 3 years of tax returns, P&Ls, and 6 months of bank statements?',
      'Without source financials we cannot verify revenue or build a defensible valuation.')
  } else {
    if (docs.taxReturns === 0) add('Are the 2023–2025 tax returns available to send over?',
      'Tax returns are the ground truth buyers and lenders will ask for first.')
    if (docs.financialStatements === 0) add('Do you have monthly/quarterly P&L statements for the last 2–3 years?',
      'P&Ls show seasonality and expense trends a single-year snapshot hides.')
    if (docs.bankStatements === 0) add('Can you provide the last 6–12 months of business bank statements?',
      'Bank statements let us run the bank-vs-books check that serious buyers expect.')
  }

  // Fuel / inventory / real estate specifics
  const industry = String(listing.industry || listing.sub_industry || '').toLowerCase()
  if (industry.includes('gas') || industry.includes('fuel') || industry.includes('convenience') || industry.includes('c-store') || industry.includes('mart')) {
    add('Do you have fuel gallonage and margin reports (e.g., Carroll Fuel consignment summaries)?',
      'Fuel gross profit is often a large part of a gas station\'s real earnings — net settlements alone hide the margin.',
      ['Yes, I have gallonage reports', 'I can get them from the fuel supplier', 'No fuel — store sales only'])
  }
  if (!listing.inventory_value) add('What is the approximate inventory value at cost?',
    'Inventory is a working-capital item buyers need to price and fund at close.',
    ['Under $25k', '$25k–$75k', '$75k–$150k', 'Over $150k'])

  // Lease / real estate
  if (!listing.lease_monthly || !listing.lease_expires_on) {
    add('What are the current lease terms — monthly rent and expiration date?',
      'Lease transferability and remaining term are deal-breakers for most buyers.',
      ['Rent is set (will send the lease)', 'Lease is month-to-month', 'Business owns the building'])
  }
  if (listing.real_estate_included == null) {
    add('Is the real estate included in the sale, or is this a leasehold business sale?',
      'Property + business vs. business-only changes the value range and the buyer pool dramatically.',
      ['Business + real estate', 'Business only (leasehold)', 'Buyer could option the building'])
  }

  // Owner involvement
  if (!listing.owner_hours_weekly) {
    add('How many hours per week does the owner work in the business?',
      'Owner hours define whether the earnings are truly discretionary (SDE quality).',
      ['Full-time (40+ hrs)', 'Part-time (under 30 hrs)', 'Absent owner'])
  }

  // Customer concentration
  if (!listing.customer_concentration) {
    add('What does the customer base look like — is any single customer over 10% of revenue?',
      'High customer concentration is the #1 red flag buyers and lenders will probe.',
      ['No single customer over 10%', 'One customer is 10–25%', 'One customer is over 25%'])
  }

  // Reason for sale
  if (!listing.reason_for_sale) {
    add('What is the reason for selling?',
      'The reason for sale shapes the story, the timing, and buyer trust.',
      ['Retirement', 'Health / family reasons', 'Pursuing other opportunities', 'Business underperforming'])
  }

  // Seasonality / recent trend
  add('Are sales trending up, flat, or down over the last 12 months — and is the business seasonal?',
    'Trend tells us whether the trailing numbers are the right baseline or a stale one.',
    ['Up', 'Flat', 'Down', 'Highly seasonal'])

  return q
}

function buildDeterministicValuation(ctx: AdvisorContext): AdvisorValuation {
  const m = ctx.metrics
  if (!m || (!m.sde && !m.ebitda && !m.revenue)) {
    return {
      low: null, mid: null, high: null,
      method: 'Insufficient data',
      confidence: 'low',
      reasoning: 'No SDE, EBITDA, or revenue on file yet — upload financials or answer the questions above and re-run.',
    }
  }
  const base = m.sde || m.ebitda || Math.round(m.revenue * 0.2)
  const multiple = m.sde ? 'SDE' : m.ebitda ? 'EBITDA' : '20% of revenue'
  const low = Math.round(base * 2.5)
  const high = Math.round(base * 4.0)
  const mid = Math.round((low + high) / 2)
  const confidence = m.sde && m.sde > 0 ? 'medium' : 'low'
  const reasoning = `Based on ${multiple} of ${base.toLocaleString()}, applying a 2.5x–4.0x range typical for this size of business. ` +
    (m.sde ? 'SDE-based multiples are the standard for small businesses; refine with comparables and industry data.' :
      m.ebitda ? 'EBITDA multiple used because SDE is not set — confirm owner compensation to derive SDE.' :
        'Revenue-based proxy used because neither SDE nor EBITDA is set.')
  return { low, mid, high, method: `${multiple} × ${multiple === 'SDE' ? '2.5–4.0' : multiple === 'EBITDA' ? '2.5–4.0' : '0.20'}`, confidence, reasoning }
}

function buildDeterministicVerdict(ctx: AdvisorContext): AdvisorVerdict {
  const { gaps, listing, docs } = ctx
  const has = (v: unknown) => v != null && String(v).trim() !== '' && Number(v) !== 0

  let score = 100
  const blockers: string[] = []
  if (docs.total === 0) { score -= 25; blockers.push('No financial documents uploaded') }
  if (!has(listing.annual_revenue) || !has(listing.sde)) { score -= 20; blockers.push('Revenue / SDE not set') }
  if (!has(listing.asking_price)) { score -= 15; blockers.push('No asking price set') }
  if (!has(listing.lease_monthly) || !has(listing.lease_expires_on)) { score -= 10; blockers.push('Lease terms unknown') }
  if (listing.real_estate_included == null) { score -= 10; blockers.push('Real-estate-included question unanswered') }
  if (!has(listing.reason_for_sale)) { score -= 10; blockers.push('Reason for sale not documented') }
  if (!has(listing.inventory_value)) { score -= 5; blockers.push('Inventory value unknown') }
  if (!has(listing.owner_hours_weekly)) { score -= 5; blockers.push('Owner hours unknown') }
  score = Math.max(0, score)

  const band = score >= 70 ? 'Ready to list' : score >= 40 ? 'Needs work' : 'Not ready'
  const reasons = score >= 70
    ? ['Core financials and listing facts are in place — this can go to market.', 'Re-run after closing any remaining gaps for a higher-confidence valuation.']
    : score >= 40
      ? ['The basics are taking shape, but key data (docs / price / lease) is still missing.', 'Answer the questions above and upload documents, then re-run.']
      : ['Too little verified information to responsibly take this to market yet.', 'Gather the requested documents and answers first.']

  return { score, band, worthListing: score >= 40, reasons, blockers: blockers.slice(0, 6) }
}

function buildDeterministicCimChecklist(ctx: AdvisorContext): AdvisorCimItem[] {
  const items: AdvisorCimItem[] = []
  const add = (item: string, why: string, priority: 'must' | 'should' | 'nice') => items.push({ item, why, priority })
  const { listing } = ctx
  const industry = String(listing.industry || '').toLowerCase()

  add('Last 3 years of tax returns (corporate + personal if owner-operated)', 'The backbone of any CIM — buyers and lenders verify everything against these.', 'must')
  add('2–3 years of monthly P&L statements', 'Shows seasonality, expense trends, and add-back candidates.', 'must')
  add('6–12 months of business bank statements', 'Enables the bank-vs-books verification serious buyers run.', 'must')
  add('Current lease agreement + landlord consent-to-assign', 'Lease transferability is a make-or-break for leasehold sales.', 'must')
  add('Inventory valuation at cost (latest count)', 'Working-capital item every buyer prices into the deal.', 'must')
  add('FF&E / equipment list with approximate values', 'Shows what physically transfers and supports the asset price.', 'must')
  add('Owner compensation detail (salary, benefits, perks)', 'Needed to recast SDE accurately — the single most important add-back.', 'must')
  if (industry.includes('gas') || industry.includes('fuel') || industry.includes('convenience') || industry.includes('c-store') || industry.includes('mart')) {
    add('Fuel supplier reports — gallonage + margin by month', 'Fuel margin is material earnings for gas stations; net settlements hide it.', 'must')
    add('Environmental compliance (tank tests, permits)', 'UST compliance questions come up in every gas-station diligence.', 'should')
  }
  if (listing.real_estate_included) {
    add('Real estate appraisal or tax assessment + property condition notes', 'Property value belongs in the CIM when real estate is included.', 'should')
  }
  add('Customer / revenue concentration breakdown', 'Top-customer exposure is the #1 question from buyers and lenders.', 'should')
  add('Employee roster (FT/PT, wages, tenure)', 'Lets buyers assess payroll and retention risk.', 'should')
  add('Reason for sale (broker-verified)', 'A credible reason for sale builds trust and speeds diligence.', 'must')
  add('Recent 12-month sales trend vs. prior year', 'Proves momentum or flags decline before a buyer discovers it.', 'should')
  add('Supplier contracts + key vendor terms', 'Shows supply stability and any concentration risk.', 'nice')
  add('Licenses & permits list', 'Confirms the business can legally operate post-sale.', 'should')
  add('Photos / video of premises and equipment', 'Visuals lift buyer response rates dramatically.', 'nice')
  return items
}

// --- AI polish ----------------------------------------------------------------

async function polishWithAi(ctx: AdvisorContext, deterministic: AdvisorReport): Promise<AdvisorReport> {
  const { listing, docs } = ctx
  const compactListing = Object.fromEntries(
    Object.entries(listing).filter(([, v]) => v != null && String(v).trim() !== ''),
  )
  try {
    const result = await complete({
      context: { kind: 'support', entityId: listing.id, text: JSON.stringify(compactListing) },
      message:
        'Act as a senior business-broker advisor. Based on the listing facts and the uploaded-doc summary below, return JSON with exactly: ' +
        '{"questions": [{"question","why","suggestedAnswers":[]}...] (up to 8, the smartest questions a top broker would ask this seller), ' +
        '"valuation": {"low","mid","high","method","confidence","reasoning"} (numbers as integers; null if impossible), ' +
        '"verdict": {"score","band","worthListing","reasons":[],"blockers":[]}, ' +
        '"cimChecklist": [{"item","why","priority":"must|should|nice"}...] (up to 14)}. ' +
        'Docs on file: ' + JSON.stringify(docs) + '. ' +
        'Gaps identified: ' + JSON.stringify(ctx.gaps) + '.',
      system: 'You are a senior business broker. Be specific, practical, and conservative. Return only valid JSON.',
      jsonMode: true,
      maxTokens: 1600,
    })
    const d = result.data as Record<string, any> | undefined
    if (!d) return deterministic
    const questions = Array.isArray(d.questions)
      ? d.questions.slice(0, 8).map((q: any, i: number) => ({
          id: `q${i + 1}`,
          question: String(q?.question || '').slice(0, 300),
          why: String(q?.why || '').slice(0, 300),
          suggestedAnswers: Array.isArray(q?.suggestedAnswers) ? q.suggestedAnswers.map(String) : undefined,
        })).filter((q: AdvisorQuestion) => q.question)
      : deterministic.questions
    const v = (d.valuation || {}) as Record<string, any>
    const verdict = (d.verdict || {}) as Record<string, any>
    const cim = Array.isArray(d.cimChecklist)
      ? d.cimChecklist.slice(0, 14).map((c: any) => ({
          item: String(c?.item || '').slice(0, 200),
          why: String(c?.why || '').slice(0, 250),
          priority: ['must', 'should', 'nice'].includes(c?.priority) ? c.priority : 'should',
        })).filter((c: AdvisorCimItem) => c.item)
      : deterministic.cimChecklist

    // Valuation: the deterministic engine is the anchor. AI numbers are only
    // trusted when they stay within a sane envelope of the deterministic mid;
    // otherwise keep the defensible range and surface AI reasoning as commentary.
    const detLow = deterministic.valuation.low ?? 0
    const detHigh = deterministic.valuation.high ?? 0
    const detMid = deterministic.valuation.mid ?? (detLow + detHigh) / 2
    const aiLow = typeof v.low === 'number' ? Math.round(v.low) : null
    const aiMid = typeof v.mid === 'number' ? Math.round(v.mid) : null
    const aiHigh = typeof v.high === 'number' ? Math.round(v.high) : null
    const aiMidValue = aiMid ?? ((aiLow ?? 0) + (aiHigh ?? 0)) / 2
    const inEnvelope = detMid > 0 && aiMidValue >= detMid * 0.5 && aiMidValue <= detMid * 1.8
    const useAiValuation = (aiLow != null || aiHigh != null) && inEnvelope
    const valuation: AdvisorValuation = useAiValuation
      ? {
          low: aiLow ?? deterministic.valuation.low,
          mid: aiMid ?? deterministic.valuation.mid,
          high: aiHigh ?? deterministic.valuation.high,
          method: String(v.method || deterministic.valuation.method),
          confidence: ['high', 'medium', 'low'].includes(v.confidence) ? v.confidence : deterministic.valuation.confidence,
          reasoning: String(v.reasoning || deterministic.valuation.reasoning),
          aiCommentary: String(v.reasoning || ''),
        }
      : {
          ...deterministic.valuation,
          aiCommentary: String(v.reasoning || ''),
        }

    // Verdict: the deterministic gap-driven score is the anchor — it is
    // explainable ("you lose points for missing docs/lease/RE") and stable.
    // The AI enriches reasons/blockers but can never override the math.
    const score = deterministic.verdict.score
    const band: AdvisorVerdict['band'] = score >= 70 ? 'Ready to list' : score >= 40 ? 'Needs work' : 'Not ready'
    const verdictOut: AdvisorVerdict = {
      score,
      band,
      worthListing: score >= 40,
      reasons: Array.isArray(verdict.reasons) && verdict.reasons.length
        ? verdict.reasons.map(String).slice(0, 5)
        : deterministic.verdict.reasons,
      blockers: Array.isArray(verdict.blockers) && verdict.blockers.length
        ? verdict.blockers.map(String).slice(0, 6)
        : deterministic.verdict.blockers,
    }

    return {
      ...deterministic,
      questions: questions.length ? questions : deterministic.questions,
      valuation,
      verdict: verdictOut,
      cimChecklist: cim.length ? cim : deterministic.cimChecklist,
      model: 'ai',
    }
  } catch {
    return deterministic
  }
}

// --- Entry point --------------------------------------------------------------

/** Full advisor run for a listing. Never throws. */
export async function runListingAdvisor(listingId: string): Promise<AdvisorReport | { ok: false; error: string }> {
  try {
    const ctx = await buildContext(listingId)
    if (!ctx) return { ok: false, error: 'Listing not found' }

    const deterministic: AdvisorReport = {
      listingId,
      businessName: ctx.listing.business_name || null,
      generatedAt: new Date().toISOString(),
      docs: ctx.docs,
      questions: buildDeterministicQuestions(ctx),
      valuation: buildDeterministicValuation(ctx),
      verdict: buildDeterministicVerdict(ctx),
      cimChecklist: buildDeterministicCimChecklist(ctx),
      model: 'deterministic',
    }

    if (isClaudeConfigured()) {
      return await polishWithAi(ctx, deterministic)
    }
    return deterministic
  } catch (e) {
    return { ok: false, error: (e as Error)?.message || 'Advisor failed' }
  }
}

// Re-export for tests / UI convenience.
export { buildDeterministicQuestions, buildDeterministicValuation, buildDeterministicVerdict, buildDeterministicCimChecklist, buildGaps }

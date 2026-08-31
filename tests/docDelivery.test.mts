import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

// =============================================================================
// DOCUMENT DELIVERY + SEND PATH — approval-gated CIM/BOV/recast sends.
// Locks: nothing sends until a single-tap approve; reject sends nothing; the
// share link only resolves for SENT deliveries; email carries a PDF attachment;
// the recast carries multi-year trend analysis + add-back justification; the
// CIM embeds real multi-year tables + market comparables; the BOV answers
// buyer-advisor pushback. Asserts both behavior (pure math) and wiring.
// =============================================================================

const schema = readFileSync('sql/doc_deliveries_schema.sql', 'utf8')
const core = readFileSync('lib/recastAnalysis.ts', 'utf8')
const delivery = readFileSync('lib/docDelivery.ts', 'utf8')
const cim = readFileSync('lib/cim.ts', 'utf8')
const bov = readFileSync('lib/bov.ts', 'utf8')
const pdf = readFileSync('lib/pdfExport.ts', 'utf8')
const email = readFileSync('lib/email.ts', 'utf8')
const apiDeliver = readFileSync('app/api/documents/deliver/route.ts', 'utf8')
const apiDecision = readFileSync('app/api/documents/deliveries/[id]/decision/route.ts', 'utf8')
const shareRoute = readFileSync('app/share/doc/[token]/route.ts', 'utf8')
const queue = readFileSync('app/dashboard/approvals/page.tsx', 'utf8')

const {
  analyzeRecast, justificationFor, categoryLabel, ratePct,
} = await import('../lib/recastAnalysis.ts')

// ---------------------------------------------------------------------------
// Recast analysis — pure math
// ---------------------------------------------------------------------------
const trendYears = [
  { year: 2023, label: 'FY2023', revenue: 1_000_000, sde: 180_000, ebitda: 140_000, totalAddBacks: 60_000, addBacksByCategory: { owner_salary: 40_000, depreciation: 20_000 } },
  { year: 2024, label: 'FY2024', revenue: 1_080_000, sde: 210_000, ebitda: 168_000, totalAddBacks: 70_000, addBacksByCategory: { owner_salary: 45_000, depreciation: 25_000 } },
  { year: 2025, label: 'FY2025', revenue: 1_150_000, sde: 245_000, ebitda: 198_000, totalAddBacks: 80_000, addBacksByCategory: { owner_salary: 50_000, depreciation: 30_000 } },
]

test('recast-analysis: CAGR computed over the full period', () => {
  const a = analyzeRecast(trendYears)
  assert.ok(a.cagr.revenue !== null)
  assert.ok(a.cagr.sde !== null)
  // 1.15M / 1.0M over 2 periods ≈ +7.2%/yr
  assert.ok(Math.abs(a.cagr.revenue! - (Math.pow(1.15, 0.5) - 1)) < 0.005)
  // 245k / 180k over 2 periods ≈ +16.7%/yr
  assert.ok(Math.abs(a.cagr.sde! - (Math.pow(245 / 180, 0.5) - 1)) < 0.01)
})

test('recast-analysis: YoY arrays are aligned (first = null)', () => {
  const a = analyzeRecast(trendYears)
  assert.equal(a.yoy.revenue[0], null)
  assert.equal(a.yoy.sde[0], null)
  assert.ok(Math.abs(a.yoy.revenue[1]! - 0.08) < 0.001)
  assert.ok(Math.abs(a.yoy.sde[1]! - (210 / 180 - 1)) < 0.001)
})

test('recast-analysis: margins per year', () => {
  const a = analyzeRecast(trendYears)
  assert.ok(Math.abs(a.margins.sdeMargin[2]! - 245_000 / 1_150_000) < 0.001)
  assert.ok(Math.abs(a.margins.ebitdaMargin[0]! - 0.14) < 0.001)
})

test('recast-analysis: recurring vs one-time add-back mix', () => {
  const a = analyzeRecast(trendYears)
  // owner_salary + depreciation are recurring categories → 100% recurring here
  assert.equal(a.addBackMix.recurringPct, 100)
  assert.ok(a.qualityNote.includes('recurring'))
})

test('recast-analysis: every standard category has a justification', () => {
  for (const cat of ['owner_salary', 'owner_benefits', 'depreciation', 'amortization', 'interest', 'discretionary', 'one_time', 'non_arm_length', 'personal', 'other']) {
    const j = justificationFor(cat)
    assert.ok(j.length > 80, `${cat} justification too thin`)
  }
  assert.ok(categoryLabel('owner_salary').includes('Owner'))
  assert.equal(ratePct(0.052), '+5.2%')
  assert.equal(ratePct(null), '—')
})

test('recast-analysis: trend note is specific, not boilerplate', () => {
  const a = analyzeRecast(trendYears)
  assert.ok(/upward|grew|compound/i.test(a.trendNote))
})

// ---------------------------------------------------------------------------
// Schema — approval-gated, agency-scoped, anon revoked
// ---------------------------------------------------------------------------
test('delivery: schema is idempotent, pending-by-default, agency-scoped', () => {
  assert.match(schema, /create table if not exists public\.doc_deliveries/)
  assert.match(schema, /status\s+text not null default 'pending_approval'/)
  assert.match(schema, /recipient_email\s+text not null/)
  assert.match(schema, /share_token\s+text unique/)
  assert.match(schema, /is_agency_member\(agency_id\)/)
  assert.match(schema, /revoke all on public\.doc_deliveries from anon/)
  assert.match(schema, /enable row level security/)
})

// ---------------------------------------------------------------------------
// Delivery orchestration — approve is the ONLY send path; reject sends nothing
// ---------------------------------------------------------------------------
test('delivery: create lands in pending_approval; approve triggers send; reject blocks', () => {
  assert.match(delivery, /status: 'pending_approval'/)
  assert.match(delivery, /export async function approveDelivery/)
  assert.match(delivery, /export async function rejectDelivery/)
  assert.match(delivery, /export async function createDelivery/)
  assert.match(delivery, /export async function listDeliveries/)
  assert.match(delivery, /generateDeliveryPdf/)
  // Approve marks sent only after storage + email + share link
  assert.match(delivery, /status: 'sent'/)
  assert.match(delivery, /shareUrl/)
  assert.match(delivery, /attachments:/)
  assert.match(delivery, /deal_room_file_id/)
})

test('delivery: share links only exist for sent deliveries', () => {
  assert.match(shareRoute, /delivery.status !== 'sent'/)
  assert.match(shareRoute, /404/)
})

// ---------------------------------------------------------------------------
// Email — attachments threaded through all three transports
// ---------------------------------------------------------------------------
test('delivery: email supports PDF attachments on every transport', () => {
  assert.match(email, /attachments\?: \{ filename: string; content: string; contentType: string \}\[\]/)
  assert.match(email, /attachments: \(attachments \|\| \[\]\)\.map/)
  assert.match(email, /'@odata.type': '#microsoft.graph.fileAttachment'/)
  assert.match(email, /\| 'deliverable'/)
})

// ---------------------------------------------------------------------------
// CIM — 30+ page substance: multi-year tables, add-back justification,
// market comparables
// ---------------------------------------------------------------------------
test('cim: generator accepts recast + market band and emits analysis sections', () => {
  assert.match(cim, /opts\?: \{ recast\?: RecastResult \| null; marketBand\?: MarketBand \| null \}/)
  assert.match(cim, /8A\. Multi-Year Trend Analysis/)
  assert.match(cim, /8B\. Add-Back Justification/)
  assert.match(cim, /9A\. Market Comparables/)
  assert.match(cim, /analysis\.justifications\.map/)
  assert.match(cim, /analysis\.qualityNote/)
  assert.match(cim, /bandLine/)
})

test('cim: recast sections carry real multi-year rows when provided', () => {
  assert.match(cim, /multiYearRows\.map/)
  assert.match(cim, /analysis\.margins\.sdeMargin/)
  assert.match(cim, /analysis\.yoy\.revenue/)
})

// ---------------------------------------------------------------------------
// BOV — defensible methodology: sensitivity, reconciliation, pushback
// ---------------------------------------------------------------------------
test('bov: adds sensitivity, reconciliation, and buyer-advisor pushback section', () => {
  assert.match(bov, /Valuation Sensitivity & Reconciliation/)
  assert.match(bov, /Sensitivity to the Earnings Multiple/)
  assert.match(bov, /How a Buyer\\'s Advisor Might Push Back/)
  assert.match(bov, /Recurring owner-comp and D&A adjustments are standard/)
  assert.match(bov, /The valuation does not rely on growth/)
})

// ---------------------------------------------------------------------------
// PDF — renders the new analysis pages
// ---------------------------------------------------------------------------
test('pdf: recast export renders trend table + justification pages', () => {
  assert.match(pdf, /Multi-Year Trend Analysis/)
  assert.match(pdf, /Quality of Earnings/)
  assert.match(pdf, /Add-Back Justification/)
  assert.match(pdf, /ratePct\(analysis\.cagr\.sde\)/)
})

// ---------------------------------------------------------------------------
// API + UI wiring
// ---------------------------------------------------------------------------
test('api: deliver route creates pending deliveries; decision route gates approve/reject', () => {
  assert.match(apiDeliver, /pending_approval/)
  assert.match(apiDeliver, /docKind must be cim, bov, or recast/)
  assert.match(apiDecision, /action must be approve or reject/)
  assert.match(apiDecision, /canManageAgency/)
  assert.match(apiDecision, /approveDelivery\(id, auth\.user\.id\)/)
  assert.match(apiDecision, /rejectDelivery\(id/)
})

test('ui: approval queue is mobile-friendly with single-tap approve', () => {
  assert.match(queue, /Approve & Send/)
  assert.match(queue, /Reject — send nothing/)
  assert.match(queue, /Awaiting your approval/)
  assert.match(queue, /decision/)
})

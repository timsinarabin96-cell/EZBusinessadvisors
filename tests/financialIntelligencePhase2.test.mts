import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

// =============================================================================
// FIC Phase 2 — broker review/override, multi-year ledger, auto-feed.
// Locks in: review states, broker override as source of truth, monthly ledger
// RPCs, and the generate pipeline consuming reviewed extractions first.
// =============================================================================

const sql = readFileSync('sql/financial_intelligence_phase2_2026_08_26.sql', 'utf8')
const extRoute = readFileSync('app/api/financial/extractions/route.ts', 'utf8')
const ledgerRoute = readFileSync('app/api/financial/ledger/route.ts', 'utf8')
const review = readFileSync('components/financial/ExtractionReview.tsx', 'utf8')
const ledgerView = readFileSync('components/financial/FinancialLedgerView.tsx', 'utf8')
const autoGen = readFileSync('lib/autoGenerate.ts', 'utf8')

test('fic2: SQL creates the monthly ledger + review RPCs', () => {
  assert.match(sql, /create table if not exists public\.financial_ledger/)
  assert.match(sql, /unique \(listing_id, fiscal_year, month\)/)
  assert.match(sql, /upsert_ledger_month/)
  assert.match(sql, /upsert_ledger_year/)
  assert.match(sql, /get_financial_ledger/)
  assert.match(sql, /source\s+text not null default 'extraction'/)
})

test('fic2: review API supports approve + override (override becomes truth)', () => {
  assert.match(extRoute, /action: z\.enum\(\['approve', 'override'\]\)/)
  assert.match(extRoute, /review_state: 'approved'/)
  assert.match(extRoute, /broker_override: override/)
  assert.match(extRoute, /review_state: 'overridden'/)
  assert.match(extRoute, /agencyGate/)
})

test('fic2: ledger API rebuilds months from extractions via RPC', () => {
  assert.match(ledgerRoute, /get_financial_ledger/)
  assert.match(ledgerRoute, /upsert_ledger_year/)
  assert.match(ledgerRoute, /overridden.*broker_override/s)
  assert.match(ledgerRoute, /byYear/)
})

test('fic2: review UI shows confidence + approve/correct actions', () => {
  assert.match(review, /confidence/)
  assert.match(review, /Approve/)
  assert.match(review, /Correct numbers/)
  assert.match(review, /broker_override/)
  assert.match(review, /review_state/)
})

test('fic2: ledger view renders monthly P&L per year with override marks', () => {
  assert.match(ledgerView, /Rebuild from extractions/)
  assert.match(ledgerView, /MONTHS/)
  assert.match(ledgerView, /fiscal_year/)
  assert.match(ledgerView, /override/)
})

test('fic2: generate pipeline consumes reviewed extractions as source of truth', () => {
  assert.match(autoGen, /loadReviewedExtractions/)
  assert.match(autoGen, /review_state.*approved.*overridden/s)
  assert.match(autoGen, /reviewedExtractions/)
  assert.match(autoGen, /broker override/)
})

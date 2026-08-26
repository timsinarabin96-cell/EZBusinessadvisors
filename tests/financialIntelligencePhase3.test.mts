import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

// =============================================================================
// FIC Phase 3 — seller portal self-upload, bank-vs-books verification,
// seller accuracy interview, and the sellable add-on flag.
// =============================================================================

const sql = readFileSync('sql/financial_intelligence_phase3_2026_08_26.sql', 'utf8')
const interviewSql = readFileSync('sql/financial_interviews_2026_08_26.sql', 'utf8')
const portalRoute = readFileSync('app/api/seller-portal/route.ts', 'utf8')
const interviewRoute = readFileSync('app/api/seller-portal/interview/route.ts', 'utf8')
const verifyRoute = readFileSync('app/api/financial/verify/route.ts', 'utf8')
const verificationLib = readFileSync('lib/bankBooksVerification.ts', 'utf8')
const interviewLib = readFileSync('lib/financialInterview.ts', 'utf8')
const portalPage = readFileSync('app/seller/[token]/page.tsx', 'utf8')
const whiteLabel = readFileSync('app/admin/white-label/page.tsx', 'utf8')

test('fic3: SQL adds add-on flag, upload_source, verification detail', () => {
  assert.match(sql, /financial_intelligence_enabled/)
  assert.match(sql, /upload_source text not null default 'broker'/)
  assert.match(sql, /verification_detail jsonb/)
})

test('fic3: interview SQL creates transcript table + seller attestation', () => {
  assert.match(interviewSql, /create table if not exists public\.financial_interviews/)
  assert.match(interviewSql, /qa\s+jsonb/)
  assert.match(interviewSql, /seller_confirmed_at timestamptz/)
})

test('fic3: seller portal supports upload (POST) + delete (DELETE) token-gated', () => {
  assert.match(portalRoute, /export async function POST/)
  assert.match(portalRoute, /export async function DELETE/)
  assert.match(portalRoute, /upload_source: 'seller'/)
  assert.match(portalRoute, /resolveListingByToken/)
  assert.match(portalRoute, /financials\.preview/)
})

test('fic3: bank-vs-books verification computes verdict + syncs badge', () => {
  assert.match(verificationLib, /computeBankBooksVerdict/)
  assert.match(verificationLib, /verified_revenue_basis: 'bank_deposits'/)
  assert.match(verificationLib, /revenue_verified: verdict\.status === 'verified'/)
  assert.match(verifyRoute, /runBankBooksVerification/)
})

test('fic3: interview engine is deterministic + context-driven', () => {
  assert.match(interviewLib, /buildInterviewQuestions/)
  assert.match(interviewLib, /bank_variance/)
  assert.match(interviewLib, /owner_comp/)
  assert.match(interviewLib, /isInterviewComplete/)
  assert.match(interviewRoute, /financial_interviews/)
})

test('fic3: seller page has upload preview/delete + live recast + interview UI', () => {
  assert.match(portalPage, /Upload your P&L/)
  assert.match(portalPage, /financials\.preview/)
  assert.match(portalPage, /PreviewMetric/)
  assert.match(portalPage, /Financial accuracy check/)
  assert.match(portalPage, /deleteDoc/)
})

test('fic3: add-on is sellable per agency from the white-label admin', () => {
  assert.match(whiteLabel, /Financial Intelligence/)
  assert.match(whiteLabel, /toggleAddon/)
})

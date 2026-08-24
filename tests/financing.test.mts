import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const core = readFileSync('lib/financingCore.ts', 'utf8')
const lib = readFileSync('lib/financing.ts', 'utf8')
const page = readFileSync('app/(public)/marketplace/financing/page.tsx', 'utf8')
const nav = readFileSync('components/public/PublicNav.tsx', 'utf8')

const { assessLoanReadiness } = await import('../lib/financingCore.ts')

test('financing: loan-ready listing scores excellent with package complete', () => {
  const r = assessLoanReadiness({
    askingPrice: 1000000, sde: 300000, annualRevenue: 1200000,
    yearsOfFinancials: 3, businessAgeYears: 5, collateralAvailable: true,
    sellerFinancingAvailable: true, realEstateIncluded: true,
  })
  assert.ok(r.score >= 85, `score ${r.score}`)
  assert.equal(r.band, 'excellent')
  assert.ok(r.dscr !== null && r.dscr >= 1.25, `dscr ${r.dscr}`)
  assert.equal(r.requiredDownPayment, 100000)
  assert.ok(r.estMonthlyPayment !== null && r.estMonthlyPayment > 0)
  assert.ok(r.packageItems.every((i) => !i.required || i.ready))
  assert.equal(r.blockers.length, 0)
})

test('financing: weak listing — no SDE, short history, no collateral', () => {
  const r = assessLoanReadiness({ askingPrice: 2000000, annualRevenue: 300000, businessAgeYears: 1 })
  assert.equal(r.band, 'weak')
  assert.ok(r.dscr === null)
  assert.ok(r.blockers.some((b) => /SDE|EBITDA/i.test(b)))
  assert.ok(r.blockers.some((b) => /2 years/i.test(b)))
  assert.ok(r.blockers.some((b) => /collateral/i.test(b)))
  assert.ok(r.packageItems.some((i) => i.key === 'pfs' && !i.ready === false))
})

test('financing: DSCR below 1.25 flagged as blocker', () => {
  const r = assessLoanReadiness({ askingPrice: 2000000, sde: 120000, yearsOfFinancials: 3, businessAgeYears: 5, collateralAvailable: true })
  assert.ok(r.dscr !== null && r.dscr < 1.25, `dscr ${r.dscr}`)
  assert.ok(r.blockers.some((b) => /1.25/i.test(b)))
  assert.ok(['excellent', 'good', 'fair', 'weak'].includes(r.band))
})

test('financing: engine exports package items, bands, and SBA math', () => {
  assert.match(core, /export function assessLoanReadiness/)
  assert.match(core, /export interface FinancingAssessment/)
  assert.match(core, /export interface LoanPackageItem/)
  assert.match(core, /pfs/)
  assert.match(core, /projections/)
  assert.match(core, /collateral/)
  assert.match(core, /dscr/)
  assert.match(core, /1\.25/)
  assert.match(core, /10% down/)
  assert.match(core, /FINANCING_BAND_LABELS/)
  assert.match(core, /Loan-ready/)
})

test('financing: wrapper loads listing snapshot + matches lenders', () => {
  assert.match(lib, /export async function loadFinancingSnapshot/)
  assert.match(lib, /export async function assessListingFinancing/)
  assert.match(lib, /export async function matchLendersForListing/)
  assert.match(lib, /export async function fetchFinancingHubStats/)
  assert.match(lib, /financial_history/)
  assert.match(lib, /deal_professionals/)
  assert.match(lib, /type: 'lender'/)
})

test('financing: public page renders playbook, lenders, metrics, CTAs', () => {
  assert.match(page, /How Buyers Finance a Business/)
  assert.match(page, /The SBA 7\(a\) Playbook/)
  assert.match(page, /Debt service coverage/)
  assert.match(page, /Down payment/)
  assert.match(page, /Vetted Lenders/)
  assert.match(page, /fetchFinancingHubStats/)
  assert.match(page, /fetchPublicProfessionals/)
  assert.match(page, /Am I qualified\? Check instantly/)
  assert.match(page, /Browse Businesses/)
  assert.match(page, /FinancialService/)
})

test('financing: public nav links to Financing', () => {
  assert.match(nav, /marketplace\/financing/)
  assert.match(nav, />Financing</)
})

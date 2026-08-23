import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const core = readFileSync('lib/underwritingCore.mts', 'utf8')
const lib = readFileSync('lib/underwriting.ts', 'utf8')
const page = readFileSync('app/(public)/marketplace/qualify/page.tsx', 'utf8')
const nav = readFileSync('components/public/PublicNav.tsx', 'utf8')

const { qualifyBuyer, LEVEL_LABELS } = await import('../lib/underwritingCore.mts')

test('underwriting: funded buyer — 20% liquid, strong income, good credit', () => {
  const r = qualifyBuyer({ targetPrice: 500000, liquidCapital: 120000, annualIncome: 150000, creditTier: 'good' })
  assert.equal(r.level, 'funded')
  assert.equal(r.levelLabel, 'Funded ✅')
  assert.ok(r.score >= 60, `score ${r.score}`)
  assert.ok(r.actions.some((a) => /lender/i.test(a)))
})

test('underwriting: pre-approved with SBA letter + adequate liquidity', () => {
  const r = qualifyBuyer({ targetPrice: 800000, liquidCapital: 100000, annualIncome: 90000, creditTier: 'excellent', sbaPreApproved: true })
  assert.equal(r.level, 'pre_approved')
  assert.ok(r.badges.some((b) => /SBA pre-approval/i.test(b)))
})

test('underwriting: exploring buyer — thin liquidity and income', () => {
  const r = qualifyBuyer({ targetPrice: 1000000, liquidCapital: 40000, annualIncome: 60000, creditTier: 'fair' })
  assert.equal(r.level, 'exploring')
  assert.ok(r.actions.some((a) => /lender|reserves/i.test(a)))
})

test('underwriting: score is bounded 0–100, badges/actions always present', () => {
  for (const input of [
    { targetPrice: 300000, liquidCapital: 90000, annualIncome: 120000, creditTier: 'excellent' as const },
    { targetPrice: 2000000, liquidCapital: 500000, annualIncome: 400000, creditTier: 'good' as const, sbaPreApproved: true },
    { targetPrice: 0, liquidCapital: 0, annualIncome: 0, creditTier: 'poor' as const },
  ]) {
    const r = qualifyBuyer(input)
    assert.ok(r.score >= 0 && r.score <= 100)
    assert.ok(['funded', 'pre_approved', 'qualified', 'exploring'].includes(r.level))
    assert.ok(Array.isArray(r.badges) && Array.isArray(r.actions) && Array.isArray(r.reasons))
    assert.ok(r.levelLabel.length > 0)
  }
})

test('underwriting: engine exposes levels, labels, and SBA-style heuristics', () => {
  assert.match(core, /export type QualificationLevel = 'funded' \| 'pre_approved' \| 'qualified' \| 'exploring'/)
  assert.match(core, /export function qualifyBuyer/)
  assert.match(core, /10% of price/)
  assert.match(core, /debt-service coverage/)
  assert.match(core, /SBA 7\(a\)/)
  assert.match(core, /LEVEL_LABELS/)
  assert.equal(LEVEL_LABELS.funded, 'Funded ✅')
})

test('underwriting: wrapper saves leads, exposes credit options + colors', () => {
  assert.match(lib, /export async function saveUnderwritingLead/)
  assert.match(lib, /instant_underwriting/)
  assert.match(lib, /buyer_leads/)
  assert.match(lib, /CREDIT_OPTIONS/)
  assert.match(lib, /LEVEL_COLORS/)
  assert.match(lib, /Excellent \(720\+\)/)
})

test('underwriting: public page has sliders, result card, lead capture', () => {
  assert.match(page, /Are you qualified to buy\?/)
  assert.match(page, /qualifyBuyer/)
  assert.match(page, /result\.levelLabel/)
  assert.match(page, /result\.badges/)
  assert.match(page, /result\.actions/)
  assert.match(page, /saveUnderwritingLead/)
  assert.match(page, /Get Matched with Deals/)
  assert.match(page, /Funded, Pre-approved, Qualified, or Exploring/)
})

test('underwriting: public nav links to Pre-Qualify', () => {
  assert.match(nav, /marketplace\/qualify/)
  assert.match(nav, /Pre-Qualify/)
})

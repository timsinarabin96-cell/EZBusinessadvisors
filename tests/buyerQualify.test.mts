import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const qualify = await import('../lib/buyerQualify.ts')

test('qualify: question set covers funds, financing, budget, timeline, location', () => {
  const keys = qualify.QUALIFY_QUESTIONS.map((q: any) => q.key)
  for (const k of ['funds', 'financing', 'budget', 'timeline', 'location']) {
    assert.ok(keys.includes(k), `missing question ${k}`)
  }
})

test('qualify: cash-rich buyer with matching budget → qualified, next:nda', () => {
  const r = qualify.scoreQualification(
    [
      { key: 'funds', value: '$500k+' },
      { key: 'financing', value: 'All cash' },
      { key: 'budget', value: '$250k–$500k' },
      { key: 'timeline', value: 'ASAP (0–3 months)' },
      { key: 'location', value: 'Harrisburg, PA' },
    ],
    { askingPrice: 400000, sde: 96000, industry: 'Business Services' }
  )
  assert.equal(r.decision, 'qualified')
  assert.equal(r.next, 'nda')
  assert.ok(r.score >= 70)
  assert.ok(r.reasons.length > 0)
})

test('qualify: thin funds + low budget vs price → not_now, next:hold', () => {
  const r = qualify.scoreQualification(
    [
      { key: 'funds', value: 'Under $50k' },
      { key: 'financing', value: 'Conventional loan' },
      { key: 'budget', value: 'Under $250k' },
      { key: 'timeline', value: 'Just exploring' },
      { key: 'location', value: 'Any' },
    ],
    { askingPrice: 900000, sde: 200000, industry: 'Manufacturing' }
  )
  assert.equal(r.decision, 'not_now')
  assert.equal(r.next, 'hold')
  assert.ok(r.score < 40)
})

test('qualify: middle ground → maybe, next:proof_of_funds', () => {
  const r = qualify.scoreQualification(
    [
      { key: 'funds', value: '$150k–$500k' },
      { key: 'financing', value: 'SBA loan' },
      { key: 'budget', value: '$250k–$500k' },
      { key: 'timeline', value: '3–6 months' },
      { key: 'location', value: 'PA' },
    ],
    { askingPrice: 550000, sde: 120000, industry: 'Retail' }
  )
  assert.equal(r.decision, 'maybe')
  assert.equal(r.next, 'proof_of_funds')
  assert.ok(r.score >= 40 && r.score < 70)
})

test('qualify: funds band parsing — "$500k+" → 500000', () => {
  assert.equal(qualify.fundsLowerBound('$500k+'), 500000)
  assert.equal(qualify.fundsLowerBound('$150k–$500k'), 150000)
  assert.equal(qualify.fundsLowerBound(250000), 250000)
  assert.equal(qualify.budgetUpperBound('$250k–$500k'), 500000)
})

test('qualify: missing answers still score conservatively (never throws)', () => {
  const r = qualify.scoreQualification([], { askingPrice: 300000 })
  assert.ok(r.score >= 0 && r.score <= 100)
  assert.ok(['qualified', 'maybe', 'not_now'].includes(r.decision))
})

test('qualify: API route exists + gate UI wires the funnel', () => {
  const route = readFileSync('app/api/public/qualify/route.ts', 'utf8')
  assert.match(route, /scoreQualification/)
  assert.match(route, /buyer_leads/)
  assert.match(route, /get_public_listing_feed/)
  const gate = readFileSync('components/public/NdaFinancialsGate.tsx', 'utf8')
  assert.match(gate, /Request Confidential Access/)
  assert.match(gate, /Quick Qualification/)
  assert.match(gate, /Check my eligibility/)
  assert.match(gate, /QUALIFY_QUESTIONS/)
  assert.match(gate, /qualificationScore/)
})

test('qualify: NDA sign auto counter-signs + archives + emails buyer copy', () => {
  const sign = readFileSync('app/api/public/nda/sign/route.ts', 'utf8')
  assert.match(sign, /AUTO COUNTER-SIGN/)
  assert.match(sign, /counter_signed_at/)
  assert.match(sign, /signing_name/)
  assert.match(sign, /listing_documents/)
  assert.match(sign, /category: 'nda'/)
  assert.match(sign, /nda_access_granted/)
  const migration = readFileSync('migrations/0004_qualify_nda_auto_sign.sql', 'utf8')
  assert.match(migration, /signing_name/)
  assert.match(migration, /counter_signed_at/)
  assert.match(migration, /qualification_decision/)
})

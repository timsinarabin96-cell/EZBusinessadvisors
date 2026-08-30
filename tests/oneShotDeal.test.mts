import assert from 'node:assert/strict'
import test from 'node:test'

// lib/oneShotDeal.ts is a pure, dependency-free module — safe to import directly.
const { fallbackExtractRecord } = await import('../lib/oneShotDeal.ts')

test('fallbackExtractRecord: extracts asking price, revenue, SDE, EBITDA from broker notes', () => {
  const notes = [
    'Family-owned auto repair shop for sale. Asking price $495,000.',
    'Annual revenue $1,200,000 with SDE of $180,000.',
    'EBITDA $140,000, 8 full-time employees.',
    'Established in 1998, located in Philadelphia, PA.',
  ].join('\n')
  const r = fallbackExtractRecord(notes)
  assert.equal(r.asking_price, 495000)
  assert.equal(r.annual_revenue, 1200000)
  assert.equal(r.sde, 180000)
  assert.equal(r.ebitda, 140000)
  assert.equal(r.employees_full_time, 8)
  assert.equal(r.established_year, 1998)
  assert.match(String(r.location_general), /Philadelphia, PA/i)
})

test('fallbackExtractRecord: handles "$X for sale" / "asking" without the word price + k/M shorthand', () => {
  const r = fallbackExtractRecord('Asking 250,000 for this profitable laundromat. Gross revenue $610k.')
  assert.equal(r.asking_price, 250000)
  assert.equal(r.annual_revenue, 610000)
  const r2 = fallbackExtractRecord('Asking $1.2M. Annual revenue of $4.5 million, SDE $380k.')
  assert.equal(r2.asking_price, 1200000)
  assert.equal(r2.annual_revenue, 4500000)
  assert.equal(r2.sde, 380000)
})

test('fallbackExtractRecord: revenue label alternation is safe ("annual revenue" branch)', () => {
  const r = fallbackExtractRecord('Annual revenue of $2,500,000. Owner discretionary earnings $310,000.')
  assert.equal(r.annual_revenue, 2500000)
  assert.equal(r.sde, 310000)
})

test('fallbackExtractRecord: nothing invented when figures absent', () => {
  const r = fallbackExtractRecord('Vague notes without any deal figures here.')
  assert.deepEqual(r, {})
})

test('fallbackExtractRecord: no false positives on unrelated numbers', () => {
  const r = fallbackExtractRecord('3 locations, 45 parking spots. Cash flow strong.')
  assert.equal(r.employees_full_time, undefined)
  assert.equal(r.asking_price, undefined)
  assert.equal(r.annual_revenue, undefined)
})

test('fallbackExtractRecord: employees without "full-time" qualifier', () => {
  const r = fallbackExtractRecord('SDE $95,000, 12 employees, established in 2005.')
  assert.equal(r.employees_full_time, 12)
  assert.equal(r.established_year, 2005)
})

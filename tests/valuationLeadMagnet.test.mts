import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const intake = readFileSync('app/api/public/seller-intake/route.ts', 'utf8')

test('lead magnet: intake auto-generates a branded valuation PDF for sellers with financials', () => {
  assert.match(intake, /generateValuationPdf/)
  assert.match(intake, /valuation-reports\/lead-\$\{portalToken\}\.pdf/)
  assert.match(intake, /financial_docs/)
  assert.match(intake, /tier: 'standard'/)
  assert.match(intake, /revenueNum > 0 \|\| askingNum > 0/)
})

test('lead magnet: emails the seller the PDF link + private portal link', () => {
  assert.match(intake, /Your confidential valuation/)
  assert.match(intake, /Download your valuation report \(PDF\)/)
  assert.match(intake, /private portal/)
  assert.match(intake, /portalUrl/)
})

test('lead magnet: best-effort — never breaks intake on failure', () => {
  assert.match(intake, /try \{/)
  assert.match(intake, /catch \{/)
  assert.match(intake, /best-effort/)
  assert.match(intake, /already recorded/)
})

test('lead magnet: parses revenue + asking from raw strings safely', () => {
  assert.match(intake, /parseFloat\(String\(revenueRange \|\| ''\)\.replace/)
  assert.match(intake, /parseFloat\(String\(asking \|\| ''\)\.replace/)
})

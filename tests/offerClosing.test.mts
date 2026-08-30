import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  priceRatio,
  totalValue,
  cashShare,
  offerHealth,
  recommendOffer,
  compareColumns,
  type OfferRow,
} from '../lib/offerCompareCore.ts'
import {
  tieredSuccessFee,
  estimateClosingCosts,
  fmtMoney,
} from '../lib/closingCostsCore.ts'

const compareApi = readFileSync('app/api/offers/compare/route.ts', 'utf8')
const runwayApi = readFileSync('app/api/closing/runway/route.ts', 'utf8')
const costsApi = readFileSync('app/api/closing/costs/route.ts', 'utf8')
const insights = readFileSync('components/studio/StudioInsights.tsx', 'utf8')
const studio = readFileSync('components/studio/OneShotDealBuilder.tsx', 'utf8')

const base: OfferRow = { id: 'a', purchasePrice: 500000, cashAtClosing: 450000, financingContingency: false, diligenceDays: 30, trainingDays: 30 }

// --- Offer compare core ------------------------------------------------------
test('price ratio compares offer to asking', () => {
  assert.equal(priceRatio(base, 500000), 100)
  assert.equal(priceRatio(base, 600000), 83)
  assert.equal(priceRatio(base, null), null)
})

test('total value includes earnout, cash share is percentage of total', () => {
  const withEarnout = { ...base, earnout: 50000 }
  assert.equal(totalValue(withEarnout), 550000)
  assert.equal(cashShare(withEarnout), 82)
  assert.equal(cashShare(base), 90)
})

test('offer health grades strong/negotiate/weak with reasons', () => {
  const strong = offerHealth({ ...base, purchasePrice: 500000 }, 500000)
  assert.equal(strong.health, 'strong')
  assert.ok(strong.reasons.length > 0)

  const weak = offerHealth({ purchasePrice: 300000, cashAtClosing: 100000, financingContingency: true, sellerNote: 150000 }, 500000)
  assert.equal(weak.health, 'weak')
  assert.ok(weak.score < strong.score)
})

test('recommendation ranks offers and picks the best', () => {
  const good: OfferRow = { ...base, id: 'good', buyerName: 'Alice' }
  const bad: OfferRow = { id: 'bad', buyerName: 'Bob', purchasePrice: 200000, cashAtClosing: 50000, financingContingency: true }
  const rec = recommendOffer([bad, good], 500000)
  assert.equal(rec.bestOfferId, 'good')
  assert.equal(rec.ranked.length, 2)
  assert.equal(rec.ranked[0].id, 'good')
  assert.ok(rec.summary.includes('Alice'))
})

test('recommendation handles empty offers', () => {
  const rec = recommendOffer([])
  assert.equal(rec.bestOfferId, null)
  assert.match(rec.summary, /No offers yet/)
})

test('compare columns cover price, cash, note, earnout, financing, diligence, training, health', () => {
  const cols = compareColumns([base], 500000)
  const labels = cols.map((c) => c.label)
  for (const l of ['Price', 'vs asking', 'Cash at close', 'Seller note', 'Earnout', 'Financing', 'Diligence', 'Training', 'Health']) {
    assert.ok(labels.includes(l), `missing column ${l}`)
  }
})

// --- Closing cost core --------------------------------------------------------
test('tiered success fee: 10% up to $1M, 8% above', () => {
  assert.equal(tieredSuccessFee(500000), 50000)
  assert.equal(tieredSuccessFee(1500000), 100000 + 0.08 * 500000) // 140000
  assert.equal(tieredSuccessFee(500000, 0.1, 0.08, 15000), 50000)
  assert.equal(tieredSuccessFee(100000, 0.1, 0.08, 15000), 15000) // min applied
})

test('closing cost estimate computes seller net and buyer total', () => {
  const c = estimateClosingCosts({ purchasePrice: 1000000, inventoryValue: 100000, ffeValue: 50000 })
  assert.equal(c.successFee, 100000)
  assert.equal(c.salesTax, 9000) // 6% of 150k taxable
  assert.ok(c.sellerNet < 1000000)
  assert.ok(c.buyerTotalEstimate > 1000000)
})

test('co-broker split halves the success fee', () => {
  const solo = estimateClosingCosts({ purchasePrice: 500000 })
  const split = estimateClosingCosts({ purchasePrice: 500000, coBrokerShare: 0.5 })
  assert.equal(split.coBrokerFee, Math.round(solo.successFee * 0.5))
})

test('money formatter is readable', () => {
  assert.equal(fmtMoney(1234567), '$1,234,567')
})

// --- APIs ----------------------------------------------------------------------
test('compare API is agency-gated and requires listingId', () => {
  assert.match(compareApi, /listingId query param is required/)
  assert.match(compareApi, /canManageAgency/)
  assert.match(compareApi, /forbiddenResponse\(\)/)
})

test('runway API validates date format', () => {
  assert.match(runwayApi, /closeDate \(YYYY-MM-DD\) is required/)
  assert.match(runwayApi, /computeClosingRunway/)
})

test('costs API requires a positive price', () => {
  assert.match(costsApi, /price is required/)
  assert.match(costsApi, /estimateClosingCosts/)
})

// --- UI -------------------------------------------------------------------------
test('Wave B cards exist in the studio insights', () => {
  assert.match(insights, /export function OfferCompareCard/)
  assert.match(insights, /export function ClosingRunwayCard/)
  assert.match(insights, /export function ClosingCostCard/)
})

test('One-Shot Deal Builder wires the deal review (photos, valuation, buyers, go-live)', () => {
  assert.match(studio, /AiPhotoStudioCard/)
  assert.match(studio, /Approve & Go Live/)
  assert.match(studio, /valuation/)
  assert.match(studio, /buyerCount/)
})

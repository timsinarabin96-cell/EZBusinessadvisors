import assert from 'node:assert/strict'
import test from 'node:test'

const { buildFinanceStatement, emptyFinanceRaw } = await import('../lib/digestFinance.ts')
const { EMPTY_DIGEST_ACTIVITY, renderHourlyDigest } = await import('../lib/notificationV2.ts')

test('digest finance: converts cents and dollars into revenue/expense lines', () => {
  const stmt = buildFinanceStatement({
    ordersPaidCents: 125000, // $1,250
    valuationsPaidCents: 5000, // $50
    featuredPaidCents: 0,
    invoicesPaid: 99, // dollars
    commissionsPaid: 250.5,
    storeProfit: 40,
    expensesCents: 40000, // $400
    contractorPaid: 75,
    paidCount: 4,
  })
  assert.equal(stmt.revenueTotal, 1689.5) // 1250+50+99+250.5+40
  assert.equal(stmt.expenseTotal, 475) // 400+75
  assert.equal(stmt.net, 1214.5)
  assert.ok(stmt.revenueLines.some((l) => l.label === 'Listing orders' && l.amount === 1250))
  assert.ok(stmt.revenueLines.some((l) => l.label === 'Commissions earned' && l.amount === 250.5))
  assert.ok(stmt.expenseLines.some((l) => l.label === 'Operating expenses' && l.amount === 400))
  assert.ok(stmt.expenseLines.some((l) => l.label === 'Contractor (1099) payouts' && l.amount === 75))
})

test('digest finance: empty window yields zeroed statement (no throw, quiet state)', () => {
  const stmt = buildFinanceStatement(emptyFinanceRaw())
  assert.equal(stmt.revenueTotal, 0)
  assert.equal(stmt.expenseTotal, 0)
  assert.equal(stmt.net, 0)
  assert.equal(stmt.revenueLines.length, 0)
  assert.equal(stmt.expenseLines.length, 0)
})

test('digest finance: zero-amount lines are omitted (no empty rows)', () => {
  const stmt = buildFinanceStatement({
    ordersPaidCents: 0,
    valuationsPaidCents: 0,
    featuredPaidCents: 0,
    invoicesPaid: 0,
    commissionsPaid: 0,
    storeProfit: 0,
    expensesCents: 0,
    contractorPaid: 0,
    paidCount: 0,
  })
  assert.equal(stmt.revenueLines.length, 0)
  assert.equal(stmt.expenseLines.length, 0)
})

test('digest premium: P&L block renders when finance provided', () => {
  const activity = { ...EMPTY_DIGEST_ACTIVITY }
  const stmt = buildFinanceStatement({
    ordersPaidCents: 50000,
    valuationsPaidCents: 0,
    featuredPaidCents: 0,
    invoicesPaid: 0,
    commissionsPaid: 0,
    storeProfit: 0,
    expensesCents: 10000,
    contractorPaid: 0,
    paidCount: 1,
  })
  const rendered = renderHourlyDigest({
    agencyName: 'Concord Deal Platform',
    activity,
    windowStart: '2026-09-02T17:00:00Z',
    windowEnd: '2026-09-02T18:00:00Z',
    platformRollup: true,
    finance: { statement: stmt, windowLabel: 'today (ET)' },
  })
  assert.match(rendered.html, /Profit &amp; Loss/)
  assert.match(rendered.html, /today \(ET\)/)
  assert.match(rendered.html, /Net income/)
  assert.match(rendered.html, /\$400\.00/) // 50000c - 10000c = $400 net
  assert.match(rendered.html, /Listing orders/)
  assert.match(rendered.html, /Operating expenses/)
})

test('digest premium: quiet P&L shows elegant empty state, never throws', () => {
  const rendered = renderHourlyDigest({
    agencyName: 'EZ Business Advisors',
    activity: EMPTY_DIGEST_ACTIVITY,
    windowStart: '2026-09-02T17:00:00Z',
    windowEnd: '2026-09-02T18:00:00Z',
    finance: { statement: buildFinanceStatement(emptyFinanceRaw()), windowLabel: 'today (ET)' },
  })
  assert.match(rendered.html, /Profit &amp; Loss/)
  assert.match(rendered.html, /No revenue or expenses recorded/)
  assert.match(rendered.html, /\$0\.00/)
})

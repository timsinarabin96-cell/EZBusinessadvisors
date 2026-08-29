import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const core = readFileSync('lib/redFlagCore.ts', 'utf8')
const lib = readFileSync('lib/redFlag.ts', 'utf8')
const page = readFileSync('components/ai/panels/RedFlagsPanel.tsx', 'utf8')
const shell = readFileSync('components/layout/navConfig.ts', 'utf8')

const { analyzeRedFlags } = await import('../lib/redFlagCore.ts')

const baseYears = [
  { year: 2023, label: '2023', grossRevenue: 800000, netIncome: 120000, ownerComp: 90000 },
  { year: 2024, label: '2024', grossRevenue: 850000, netIncome: 130000, ownerComp: 95000 },
  { year: 2025, label: '2025', grossRevenue: 900000, netIncome: 140000, ownerComp: 100000 },
]

test('red-flags: clean financials produce no flags', () => {
  const r = analyzeRedFlags({
    businessName: 'Stable Laundromat',
    years: baseYears,
    addBacks: [
      { id: 'a1', category: 'owner_salary', description: 'Owner salary', amount: 90000, recurring: true, year: 2025 },
      { id: 'a2', category: 'depreciation', description: 'D&A', amount: 20000, recurring: true, year: 2025 },
    ],
    avgSDE: 250000,
  })
  assert.equal(r.flags.length, 0)
  assert.equal(r.riskBand, 'clean')
  assert.equal(r.score, 0)
  assert.match(r.summary, /No material red flags/)
})

test('red-flags: revenue spike in final year is flagged high', () => {
  const years = [
    { year: 2023, label: '2023', grossRevenue: 500000, netIncome: 80000, ownerComp: 90000 },
    { year: 2024, label: '2024', grossRevenue: 550000, netIncome: 90000, ownerComp: 95000 },
    { year: 2025, label: '2025', grossRevenue: 1000000, netIncome: 250000, ownerComp: 100000 },
  ]
  const r = analyzeRedFlags({ years, addBacks: [] })
  const spike = r.flags.find((f) => f.code === 'revenue_spike')
  assert.ok(spike, 'expected revenue_spike flag')
  assert.equal(spike!.severity, 'high')
  assert.ok(r.score >= 40)
  assert.ok(['moderate', 'high'].includes(r.riskBand), `riskBand ${r.riskBand}`)
})

test('red-flags: add-back overload and one-time dominance flagged', () => {
  const r = analyzeRedFlags({
    years: baseYears,
    addBacks: [
      { id: 'a1', category: 'one_time', description: 'One-off sale of equipment', amount: 300000, recurring: false, year: 2025 },
      { id: 'a2', category: 'discretionary', description: 'Owner travel', amount: 40000, recurring: true, year: 2025 },
    ],
    avgSDE: 450000,
  })
  assert.ok(r.flags.some((f) => f.code === 'addback_overload'))
  assert.ok(r.flags.some((f) => f.code === 'one_time_dominance'))
  assert.ok(r.score > 0)
})

test('red-flags: declining revenue trend is flagged', () => {
  const years = [
    { year: 2023, label: '2023', grossRevenue: 1000000, netIncome: 150000, ownerComp: 90000 },
    { year: 2024, label: '2024', grossRevenue: 850000, netIncome: 120000, ownerComp: 90000 },
    { year: 2025, label: '2025', grossRevenue: 700000, netIncome: 90000, ownerComp: 90000 },
  ]
  const r = analyzeRedFlags({ years, addBacks: [] })
  assert.ok(r.flags.some((f) => f.code === 'revenue_decline'))
})

test('red-flags: score bounded 0-100, bands exhaustive, summary present', () => {
  for (const input of [
    { years: baseYears, addBacks: [] },
    { years: baseYears, addBacks: [{ id: 'x', category: 'personal', description: 'X', amount: 400000, recurring: false, year: 2025 }], avgSDE: 500000 },
    { years: [{ year: 2025, label: '2025', grossRevenue: 0, netIncome: 0, ownerComp: 0 }], addBacks: [] },
  ]) {
    const r = analyzeRedFlags(input as any)
    assert.ok(r.score >= 0 && r.score <= 100)
    assert.ok(['clean', 'low', 'moderate', 'high'].includes(r.riskBand))
    assert.ok(r.summary.length > 0)
    assert.ok(Array.isArray(r.flags))
  }
})

test('red-flags: core engine exposes severity, codes, and advisory framing', () => {
  assert.match(core, /export type FlagSeverity = 'high' \| 'medium' \| 'low'/)
  assert.match(core, /export function analyzeRedFlags/)
  assert.match(core, /revenue_spike/)
  assert.match(core, /addback_overload/)
  assert.match(core, /one_time_dominance/)
  assert.match(core, /owner_comp_jump/)
  assert.match(core, /margin_anomaly/)
  assert.match(core, /not an accusation/)
})

test('red-flags: wrapper loads listing snapshot + agency scan', () => {
  assert.match(lib, /export async function forensicReportForListing/)
  assert.match(lib, /export async function forensicScanForAgency/)
  assert.match(lib, /financial_history/)
  assert.match(lib, /recast_add_backs/)
  assert.match(lib, /analyzeRedFlags/)
  assert.match(lib, /business_name/)
})

test('red-flags: dashboard page renders scan rows, stat cards, flag cards', () => {
  assert.match(page, /Red-Flag Forensics/)
  assert.match(page, /forensicScanForAgency/)
  assert.match(page, /report\.score/)
  assert.match(page, /report\.riskBand/)
  assert.match(page, /f\.severity/)
  assert.match(page, /f\.title/)
  assert.match(page, /Need verification/)
})

test('red-flags: AI cockpit exposes Red Flags tab', () => {
  const cockpit = readFileSync('components/ai/AICockpit.tsx', 'utf8')
  assert.match(cockpit, /key: 'flags'/)
  assert.match(cockpit, /Red Flags/)
})

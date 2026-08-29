import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const lib = readFileSync('lib/dealDoctor.ts', 'utf8')
const core = readFileSync('lib/dealDoctorCore.ts', 'utf8')
const page = readFileSync('components/ai/panels/DealDoctorPanel.tsx', 'utf8')
const shell = readFileSync('components/layout/navConfig.ts', 'utf8')

// Import the pure scorer directly (dependency-free core — no path aliases).
const { scoreDeal, BAND_LABELS, BAND_COLORS } = await import('../lib/dealDoctorCore.ts')

test('deal-doctor: hot deal — late stage, recent activity, near-asking price', () => {
  const d = scoreDeal({
    id: 'd1', stage: 'closing',
    created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 2 * 86400000).toISOString(),
    purchase_price: 950000, asking_price: 1000000,
    business_name: 'Hot Deal', engagementCount: 6, engagementLast14d: 4,
  })
  assert.equal(d.band, 'hot')
  assert.ok(d.score >= 70, `expected score >= 70, got ${d.score}`)
  assert.match(d.action, /Push to close/)
})

test('deal-doctor: stale deal — old, untouched, no engagement', () => {
  const d = scoreDeal({
    id: 'd2', stage: 'letter_of_intent',
    created_at: new Date(Date.now() - 250 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 45 * 86400000).toISOString(),
    purchase_price: 500000, asking_price: 900000,
    business_name: 'Stale Deal', engagementCount: 0, engagementLast14d: 0,
  })
  assert.equal(d.band, 'stale')
  assert.ok(d.score < 30, `expected score < 30, got ${d.score}`)
  assert.match(d.action, /Consider dropping/)
})

test('deal-doctor: score is bounded 0–100 and bands are exhaustive', () => {
  const inputs = [
    { stage: 'under_contract', purchase_price: 800000, asking_price: 900000, engagementCount: 2, engagementLast14d: 1 },
    { stage: 'due_diligence', purchase_price: 700000, asking_price: 800000, engagementCount: 4, engagementLast14d: 2 },
    { stage: 'letter_of_intent', purchase_price: 100000, asking_price: 900000, engagementCount: 1, engagementLast14d: 0 },
    { stage: 'closing', purchase_price: 990000, asking_price: 1000000, engagementCount: 8, engagementLast14d: 5 },
  ]
  for (const input of inputs) {
    const d = scoreDeal({ id: 'x', ...input })
    assert.ok(d.score >= 0 && d.score <= 100)
    assert.ok(['hot', 'healthy', 'at_risk', 'stale'].includes(d.band))
    assert.ok(d.factors.length > 0)
    assert.ok(d.action.length > 0)
  }
})

test('deal-doctor: lib exposes pipeline diagnosis + band labels', () => {
  assert.match(lib, /export async function diagnosePipeline/)
  assert.match(lib, /fetchPipelineDeals/)
  assert.match(lib, /fetchActivityFeed/)
  assert.match(lib, /getAgencyContext/)
  assert.match(core, /export function scoreDeal/)
  assert.match(core, /export type DealBand = 'hot' \| 'healthy' \| 'at_risk' \| 'stale'/)
  assert.match(core, /BAND_LABELS/)
  assert.match(core, /BAND_COLORS/)
  assert.match(core, /STAGE_BASE/)
  assert.match(core, /No activity in/)
  assert.match(core, /3\+ touches in the last 14 days/)
})

test('deal-doctor: dashboard page renders scores, bands, actions, stat cards', () => {
  assert.match(page, /Deal Doctor/)
  assert.match(page, /diagnosePipeline/)
  assert.match(page, /\{d\.score\}%/)
  assert.match(page, /BAND_COLORS\[d\.band\]/)
  assert.match(page, /d\.action/)
  assert.match(page, /d\.factors/)
  assert.match(page, /Avg close score/)
})

test('deal-doctor: AI cockpit exposes Deal Doctor tab', () => {
  const cockpit = readFileSync('components/ai/AICockpit.tsx', 'utf8')
  assert.match(cockpit, /key: 'doctor'/)
  assert.match(cockpit, /Deal Doctor/)
})

test('deal-doctor: band labels and colors exported', () => {
  assert.equal(BAND_LABELS.hot, 'Hot — close now')
  assert.equal(BAND_LABELS.stale, 'Stale — consider dropping')
  assert.ok(BAND_COLORS.hot && BAND_COLORS.stale)
})

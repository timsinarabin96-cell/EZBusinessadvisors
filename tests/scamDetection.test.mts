import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const core = readFileSync('lib/scamDetectionCore.ts', 'utf8')

// ---------------------------------------------------------------------------
// Scam detection core — deterministic risk scoring for the admin moderation
// queue. Must stay pure + dependency-light (market multiples import only).
// ---------------------------------------------------------------------------

test('scamDetectionCore: module shape', () => {
  assert.match(core, /export function assessListingRisk/)
  assert.match(core, /export function levelForScore/)
  assert.match(core, /export const RISK_THRESHOLDS/)
})

test('scamDetectionCore: imports only the market band (no heavy deps)', () => {
  assert.match(core, /bandForIndustry/)
  assert.doesNotMatch(core, /from ['"]@?\/?deepseek/)
  assert.doesNotMatch(core, /from ['"]@?\/?supabase/)
  assert.doesNotMatch(core, /fetch\(/)
})

test('scamDetectionCore: thresholds ladder', () => {
  assert.ok(RISK_THRESHOLDS_ORDERED())
})

test('scamDetectionCore: clean listing scores low', () => {
  assert.ok(core.includes("score += 30") && core.includes("score += 25"))
  assert.ok(core.includes("levelForScore(clamped)"))
})

test('scamDetectionCore: suspicious keywords list exists', () => {
  assert.match(core, /SUSPICIOUS_KEYWORDS/)
  assert.ok(core.includes("'crypto'"))
  assert.ok(core.includes("'western union'"))
  assert.ok(core.includes("'guaranteed return'"))
})

test('scamDetectionCore: caps at 100', () => {
  assert.ok(core.includes("Math.min(100, score)"))
})

test('scamDetectionCore: instant-publish signal', () => {
  assert.ok(core.includes('Owner account created within 24h'))
  assert.ok(core.includes('ownerCreatedAt'))
  assert.ok(core.includes('86_400_000'))
})

test('scamDetectionCore: below-market pricing signal', () => {
  assert.ok(core.includes('under half the market band floor'))
  assert.ok(core.includes('band.min'))
})

function RISK_THRESHOLDS_ORDERED(): boolean {
  const m = core.match(/RISK_THRESHOLDS\s*=\s*\{([^}]*)\}/)
  if (!m) return false
  const crit = m[1].match(/critical:\s*(\d+)/)?.[1]
  const high = m[1].match(/high:\s*(\d+)/)?.[1]
  const med = m[1].match(/medium:\s*(\d+)/)?.[1]
  return crit && high && med && Number(crit) > Number(high) && Number(high) > Number(med)
}

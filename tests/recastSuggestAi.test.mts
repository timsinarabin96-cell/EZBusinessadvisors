import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

// recastSuggestAi imports @/lib/deepseek/client which node can't resolve
// (alias), so like other suite tests we assert on file content + test the
// pure rule engine separately (recastSuggestions.test.mts).
const ai = readFileSync('lib/recastSuggestAi.ts', 'utf8')
const route = readFileSync('app/api/listings/recast-suggest/route.ts', 'utf8')

test('recast AI pass: server-only module using DeepSeek client', () => {
  assert.match(ai, /lib\/deepseek\/client/)
  assert.match(ai, /completeWithDeepSeek/)
  assert.match(ai, /isDeepSeekConfigured/)
  assert.doesNotMatch(ai, /'use client'/)
})

test('recast AI pass: fail-safe — returns baseline on any error', () => {
  assert.match(ai, /catch \{/)
  assert.match(ai, /return baseline/)
  assert.match(ai, /if \(!isDeepSeekConfigured\(\)\) return baseline/)
})

test('recast AI pass: caps total add-backs at 40% of SDE', () => {
  assert.match(ai, /sde \* 0\.4/)
  assert.match(ai, /cap/)
})

test('recast AI pass: sanitizes AI output (positive amounts, labels, confidence)', () => {
  assert.match(ai, /Math\.max\(0, Math\.round\(Number\(it\.amount\)/)
  assert.match(ai, /confidence === 'high'/)
  assert.match(ai, /amount <= 0/)
})

test('recast AI pass: route calls enhancer after rule baseline', () => {
  assert.match(route, /enhanceRecastSuggestions/)
  assert.match(route, /aiEnhanced/)
  assert.match(route, /suggestAddBacks\(input\)/)
})

test('recast AI pass: context payload includes kind (AgentContextPayload)', () => {
  assert.match(ai, /kind: 'listing'/)
})

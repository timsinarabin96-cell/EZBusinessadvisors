import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const lib = readFileSync('lib/dealRadar.ts', 'utf8')
const publish = readFileSync('lib/publish.ts', 'utf8')

test('deal radar: engine matches buyers, alerts top fits, marks notified', () => {
  assert.match(lib, /export async function fireDealRadar/)
  assert.match(lib, /runMatchingForListing/)
  assert.match(lib, /buyer_match_events/)
  assert.match(lib, /status: 'notified'/)
  assert.match(lib, /notification_channel/)
  assert.match(lib, /DEAL_RADAR_DEFAULTS/)
  assert.match(lib, /minScore: 65/)
  assert.match(lib, /maxBuyers: 5/)
})

test('deal radar: only opted-in, high-scoring buyers get email alerts', () => {
  assert.match(lib, /m\.match_score >= minScore/)
  assert.match(lib, /slice\(0, maxBuyers\)/)
  assert.match(lib, /notification_email === false/)
  assert.match(lib, /notify\('match_alert'/)
  assert.match(lib, /email_disabled/)
})

test('deal radar: never throws — publish must not break on radar failure', () => {
  assert.match(lib, /Never throws/)
  assert.match(lib, /try \{/)
  assert.match(lib, /catch \(e\)/)
  assert.match(lib, /errors: \[\]/)
  assert.match(lib, /best-effort/)
})

test('deal radar: publish blast fires the radar on go-live', () => {
  assert.match(publish, /fireDealRadar/)
  assert.match(publish, /Deal Radar/)
  assert.match(publish, /best-effort/)
})

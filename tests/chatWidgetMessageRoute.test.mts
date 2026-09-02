import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const route = readFileSync('app/api/chat-widget/message/route.ts', 'utf8')

test('chat-widget message route loads prior transcript and passes it as history to the AI', () => {
  assert.match(route, /call_transcripts[\s\S]*?\.order\('sequence', \{ ascending: true \}\)/)
  assert.match(route, /const history = toHistory\(priorRows \|\| \[\]\)/)
  assert.match(route, /chatSensitive\(\{ system, userMessage: message, maxTokens: 400, history \}\)/)
})

test('chat-widget route only creates a lead once per session (lead_created flag) and uses server-side extraction, not raw model text', () => {
  assert.match(route, /sessionMeta\.lead_created/)
  assert.match(route, /extractLeadFromTranscript\(fullTranscriptText, /)
  assert.match(route, /extraction\.ready && extraction\.email && EMAIL_RE\.test\(extraction\.email\)/)
  assert.match(route, /lead_created: true/)
})

test('chat-widget route dedupes by email before inserting a lead (mirrors capturePublicLead)', () => {
  assert.match(route, /ilike\('email', extraction\.email\)/)
  assert.match(route, /duplicate: true/)
})

test('chat-widget route notifies the broker in-app and via email on lead creation, and never trusts insert to always succeed', () => {
  assert.match(route, /createNotification\(\{/)
  assert.match(route, /notify\('generic', 'info@ezbusinessadvisors\.com'/)
  assert.match(route, /if \(leadErr\) \{/)
})

test('chat-widget route wraps AI call in try/catch and falls back gracefully on failure', () => {
  assert.match(route, /catch \(e\) \{\s*aiError = e instanceof Error/)
})

test('CRM mode still gets history but skips lead capture (brokers, not leads)', () => {
  assert.match(route, /if \(!isCrm && !sessionMeta\.lead_created\)/)
})

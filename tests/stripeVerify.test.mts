import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { parseStripeSignature, verifyStripeSignature } from '../lib/stripeVerify.ts'

const SECRET = 'whsec_test_0123456789abcdef'

function sign(body: string, secret = SECRET, timestamp = Math.floor(Date.now() / 1000)): string {
  const hmac = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')
  return `t=${timestamp},v1=${hmac}`
}

test('verifyStripeSignature accepts a valid signature', () => {
  const body = JSON.stringify({ type: 'checkout.session.completed', data: { object: { id: 'cs_123' } } })
  assert.equal(verifyStripeSignature(body, sign(body), SECRET), true)
})

test('verifyStripeSignature rejects a tampered body', () => {
  const body = JSON.stringify({ type: 'checkout.session.completed', data: { object: { id: 'cs_123' } } })
  const header = sign(body)
  const tampered = body.replace('cs_123', 'cs_EVIL')
  assert.equal(verifyStripeSignature(tampered, header, SECRET), false)
})

test('verifyStripeSignature rejects a wrong secret', () => {
  const body = '{"type":"checkout.session.completed"}'
  assert.equal(verifyStripeSignature(body, sign(body, 'whsec_wrong'), SECRET), false)
})

test('verifyStripeSignature rejects a missing header', () => {
  assert.equal(verifyStripeSignature('{}', null, SECRET), false)
  assert.equal(verifyStripeSignature('{}', '', SECRET), false)
  assert.equal(verifyStripeSignature('{}', 'garbage', SECRET), false)
})

test('verifyStripeSignature rejects replayed (old) signatures outside the tolerance window', () => {
  const body = '{"type":"checkout.session.completed"}'
  const old = Math.floor(Date.now() / 1000) - 3600 // 1 hour old
  const header = sign(body, SECRET, old)
  assert.equal(verifyStripeSignature(body, header, SECRET), false) // default 300s window
  assert.equal(verifyStripeSignature(body, header, SECRET, Infinity), true) // window disabled
})

test('verifyStripeSignature accepts a fresh signature inside the window', () => {
  const body = '{"type":"checkout.session.completed"}'
  const recent = Math.floor(Date.now() / 1000) - 60 // 60s ago
  assert.equal(verifyStripeSignature(body, sign(body, SECRET, recent), SECRET), true)
})

test('verifyStripeSignature handles multiple v1 signatures (Stripe rotation)', () => {
  const body = '{"type":"checkout.session.completed"}'
  const stale = sign(body, 'whsec_old_secret')
  const fresh = sign(body, SECRET)
  const header = `${stale},${fresh}`
  assert.equal(verifyStripeSignature(body, header, SECRET), true)
})

test('parseStripeSignature extracts timestamp and all v1 signatures', () => {
  const parsed = parseStripeSignature('t=1700000000,v1=aaa,v1=bbb')
  assert.deepEqual(parsed, { timestamp: 1700000000, signatures: ['aaa', 'bbb'] })
  assert.equal(parseStripeSignature(null), null)
  assert.equal(parseStripeSignature('v1=only_no_timestamp'), null)
})

import assert from 'node:assert/strict'
import test from 'node:test'
import { validateExtraction, extractLeadFromTranscript } from '@/lib/ai/chatLeadExtraction'

test('validateExtraction: seller with name + valid email is ready', () => {
  const out = validateExtraction({
    kind: 'seller',
    name: 'Jane Doe',
    email: 'Jane@Example.com',
    business_name: 'Doe Bakery',
    industry: 'Food',
  })
  assert.equal(out.ready, true)
  assert.equal(out.email, 'jane@example.com') // lowercased
  assert.equal(out.business_name, 'Doe Bakery')
})

test('validateExtraction: invalid email is dropped and lead is not ready', () => {
  const out = validateExtraction({ kind: 'seller', name: 'Jane Doe', email: 'not-an-email' })
  assert.equal(out.email, null)
  assert.equal(out.ready, false)
})

test('validateExtraction: missing kind is not ready even with name+email', () => {
  const out = validateExtraction({ name: 'Jane Doe', email: 'jane@example.com' })
  assert.equal(out.kind, null)
  assert.equal(out.ready, false)
})

test('validateExtraction: placeholder values (n/a, none, unknown) become null', () => {
  const out = validateExtraction({ kind: 'buyer', name: 'Bob', email: 'bob@x.com', phone: 'n/a', budget_range: 'unknown' })
  assert.equal(out.phone, null)
  assert.equal(out.budget_range, null)
  assert.equal(out.ready, true)
})

test('validateExtraction: garbage/non-object input never throws, returns not-ready', () => {
  assert.doesNotThrow(() => validateExtraction(null))
  assert.doesNotThrow(() => validateExtraction(undefined))
  // @ts-expect-error deliberately wrong shape
  assert.doesNotThrow(() => validateExtraction('nonsense'))
  const out = validateExtraction(null)
  assert.equal(out.ready, false)
})

test('validateExtraction: kind is restricted to seller|buyer, rejects arbitrary strings', () => {
  const out = validateExtraction({ kind: 'sponsor', name: 'X', email: 'x@x.com' })
  assert.equal(out.kind, null)
  assert.equal(out.ready, false)
})

test('extractLeadFromTranscript: empty transcript never calls the AI and returns not-ready', async () => {
  let called = false
  const out = await extractLeadFromTranscript('', async () => { called = true; return { text: '{}' } })
  assert.equal(called, false)
  assert.equal(out.ready, false)
})

test('extractLeadFromTranscript: uses structured jsonMode data field when present', async () => {
  const out = await extractLeadFromTranscript('visitor: I want to sell my bakery, name is Jane, email jane@example.com', async (input) => {
    assert.equal(input.jsonMode, true)
    return { text: '', data: { kind: 'seller', name: 'Jane', email: 'jane@example.com', business_name: 'Bakery' } }
  })
  assert.equal(out.ready, true)
  assert.equal(out.name, 'Jane')
})

test('extractLeadFromTranscript: falls back to parsing text as JSON when data is absent', async () => {
  const out = await extractLeadFromTranscript('visitor: sell my shop, jane@example.com', async () => ({
    text: JSON.stringify({ kind: 'seller', name: 'Jane', email: 'jane@example.com' }),
  }))
  assert.equal(out.ready, true)
})

test('extractLeadFromTranscript: AI throwing never propagates, returns not-ready', async () => {
  const out = await extractLeadFromTranscript('visitor: hello', async () => { throw new Error('boom') })
  assert.equal(out.ready, false)
})

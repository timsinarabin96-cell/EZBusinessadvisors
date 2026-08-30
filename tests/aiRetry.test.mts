import assert from 'node:assert/strict'
import test from 'node:test'
import { withRetry, defaultShouldRetry, isRetryableStatus, errorStatus } from '../lib/aiRetry.ts'

test('retry: succeeds on first attempt', async () => {
  let calls = 0
  const out = await withRetry(async () => { calls++; return 'ok' })
  assert.equal(out, 'ok')
  assert.equal(calls, 1)
})

test('retry: retries transient failure then succeeds', async () => {
  let calls = 0
  const out = await withRetry(async () => {
    calls++
    if (calls < 3) throw Object.assign(new Error('DeepSeek request failed with status 429'), { status: 429 })
    return 'recovered'
  }, { baseDelayMs: 1, maxDelayMs: 5 })
  assert.equal(out, 'recovered')
  assert.equal(calls, 3)
})

test('retry: gives up after attempts exhausted and rethrows last error', async () => {
  let calls = 0
  await assert.rejects(
    withRetry(async () => { calls++; throw Object.assign(new Error('boom'), { status: 503 }) }, { attempts: 3, baseDelayMs: 1, maxDelayMs: 5 }),
    /boom/,
  )
  assert.equal(calls, 3)
})

test('retry: does NOT retry non-retryable (4xx) errors', async () => {
  let calls = 0
  await assert.rejects(
    withRetry(async () => {
      calls++
      throw Object.assign(new Error('DeepSeek request failed with status 401'), { status: 401 })
    }, { attempts: 3, baseDelayMs: 1, maxDelayMs: 5 }),
    /401/,
  )
  assert.equal(calls, 1)
})

test('retry: custom shouldRetry wins', async () => {
  let calls = 0
  const out = await withRetry(async () => {
    calls++
    if (calls === 1) throw new Error('custom-flaky')
    return 'ok'
  }, { attempts: 2, baseDelayMs: 1, maxDelayMs: 5, shouldRetry: (e) => (e as Error).message === 'custom-flaky' })
  assert.equal(out, 'ok')
  assert.equal(calls, 2)
})

test('retry: onRetry callback fires with delay', async () => {
  const seen: number[] = []
  let calls = 0
  await withRetry(async () => {
    calls++
    if (calls < 3) throw Object.assign(new Error('rate limited'), { status: 429 })
    return 'ok'
  }, { attempts: 3, baseDelayMs: 1, maxDelayMs: 5, onRetry: (_e, attempt, delay) => seen.push(attempt) })
  assert.deepEqual(seen, [1, 2])
})

test('retry status helpers', () => {
  assert.equal(isRetryableStatus(429), true)
  assert.equal(isRetryableStatus(500), true)
  assert.equal(isRetryableStatus(503), true)
  assert.equal(isRetryableStatus(404), false)
  assert.equal(isRetryableStatus(401), false)
  assert.equal(isRetryableStatus(undefined), false)
  assert.equal(errorStatus(Object.assign(new Error('x'), { status: 429 })), 429)
  assert.equal(errorStatus(new Error('no status')), undefined)
  assert.equal(errorStatus({ response: { status: 502 } }), 502)
})

test('defaultShouldRetry: 429/5xx + network-ish messages are retryable', () => {
  assert.equal(defaultShouldRetry(Object.assign(new Error('rate limit'), { status: 429 })), true)
  assert.equal(defaultShouldRetry(Object.assign(new Error('server'), { status: 503 })), true)
  assert.equal(defaultShouldRetry(new Error('fetch failed')), true)
  assert.equal(defaultShouldRetry(new Error('socket hang up')), true)
  assert.equal(defaultShouldRetry(new Error('ETIMEDOUT')), true)
  assert.equal(defaultShouldRetry(new Error('DeepSeek request failed with status 429')), true)
  assert.equal(defaultShouldRetry(Object.assign(new Error('bad request'), { status: 400 })), false)
})

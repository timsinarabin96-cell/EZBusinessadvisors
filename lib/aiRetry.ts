/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// lib/aiRetry.ts — exponential-backoff retry for AI/network calls.
// -----------------------------------------------------------------------------
// Rate limits (429) and transient failures (5xx, network drops, timeouts) are
// normal for LLM providers. This helper makes them survivable: retry with
// exponential backoff + jitter, and only give up after N attempts. Pure and
// testable — no I/O beyond the fn you pass in.
// =============================================================================

export interface RetryOptions {
  /** Total attempts including the first (default 3). */
  attempts?: number
  /** Base delay in ms (default 800). Doubles each attempt. */
  baseDelayMs?: number
  /** Cap per-attempt delay in ms (default 10_000). */
  maxDelayMs?: number
  /** Jitter multiplier — randomizes delay to avoid thundering herd (default true). */
  jitter?: boolean
  /** Decide whether a thrown error is retryable (default: status 429/5xx or network). */
  shouldRetry?: (err: unknown, attempt: number) => boolean
  /** Called before each retry (for logging). */
  onRetry?: (err: unknown, attempt: number, delayMs: number) => void
}

/** True for 429 rate limits + 5xx server errors (the transient ones). */
export function isRetryableStatus(status: number | undefined | null): boolean {
  if (status == null) return false
  return status === 429 || (status >= 500 && status <= 599)
}

/** Extract an HTTP status from a thrown error, when one was attached. */
export function errorStatus(err: unknown): number | undefined {
  const e = err as { status?: unknown; response?: { status?: unknown } } | null
  if (!e) return undefined
  const s = typeof e.status === 'number' ? e.status : typeof e.response?.status === 'number' ? e.response.status : undefined
  return s as number | undefined
}

/** Default retry predicate — 429/5xx, or a network-ish failure (no status). */
export function defaultShouldRetry(err: unknown): boolean {
  const status = errorStatus(err)
  if (status != null) return isRetryableStatus(status)
  // Network failure / timeout / abort → fetch throws without an HTTP status.
  const msg = String((err as Error)?.message || err || '').toLowerCase()
  return /fetch failed|network|timeout|timedout|abort|econnreset|socket|dns|rate ?limit|too many requests|429|503|502|504/i.test(msg)
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Run `fn`, retrying on retryable failures with exponential backoff + jitter.
 * Throws the last error once attempts are exhausted.
 */
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const attempts = Math.max(1, opts.attempts ?? 3)
  const baseDelayMs = opts.baseDelayMs ?? 800
  const maxDelayMs = opts.maxDelayMs ?? 10_000
  const jitter = opts.jitter ?? true
  const shouldRetry = opts.shouldRetry ?? defaultShouldRetry

  let lastErr: unknown
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (attempt >= attempts) break
      if (!shouldRetry(err, attempt)) break
      const backoff = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1))
      const delay = jitter ? Math.round(backoff * (0.6 + Math.random() * 0.8)) : backoff
      opts.onRetry?.(err, attempt, delay)
      await sleep(delay)
    }
  }
  throw lastErr
}

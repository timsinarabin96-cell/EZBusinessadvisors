/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Rate limiter for public (unauthenticated) endpoints.
// -----------------------------------------------------------------------------
// Two backends, one API:
//   1. Upstash Redis (distributed) — used automatically when
//      UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN are set. Correct
//      across multiple serverless instances (real traffic).
//   2. In-memory sliding-window counter keyed by client IP — the fallback
//      when Upstash isn't configured, so dev/staging keeps working with
//      zero infra. Server-only. Memory-bounded: the map prunes stale keys
//      on every check.
// Call sites should use `await rateLimitAsync(...)` — it resolves to the
// distributed limiter when configured and the in-memory one otherwise.
// =============================================================================

interface Bucket {
  count: number
  windowStart: number
}

const buckets = new Map<string, Bucket>()
const MAX_BUCKETS = 10_000

export interface RateLimitOptions {
  /** Max requests allowed per window per IP. */
  limit?: number
  /** Window length in milliseconds. */
  windowMs?: number
}

// ---------------------------------------------------------------------------
// Upstash REST backend (zero extra deps — plain fetch)
// ---------------------------------------------------------------------------
const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL || ''
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || ''
const UPSTASH_ENABLED = Boolean(UPSTASH_URL && UPSTASH_TOKEN)

export function upstashRateLimitConfigured(): boolean {
  return UPSTASH_ENABLED
}

async function upstashCommand(command: string): Promise<number> {
  const res = await fetch(`${UPSTASH_URL}/${command}`, {
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`upstash ${res.status}`)
  const body = (await res.json()) as unknown
  const value = Array.isArray(body) ? body[0] : body
  return Number(value) || 0
}

async function rateLimitUpstash(ip: string, { limit = 20, windowMs = 60_000 }: RateLimitOptions = {}): Promise<boolean> {
  // Fixed window: key = rl:{ip}:{windowIndex} → INCR, then EXPIRE on first hit.
  const windowIndex = Math.floor(Date.now() / windowMs)
  const key = `rl:${ip}:${windowIndex}`
  const count = await upstashCommand(`incr/${encodeURIComponent(key)}`)
  if (count === 1) {
    // Fire-and-forget TTL; a failure here doesn't fail the request.
    await upstashCommand(`expire/${encodeURIComponent(key)}/${Math.ceil(windowMs / 1000)}`).catch(() => {})
  }
  return count <= limit
}

// ---------------------------------------------------------------------------
// In-memory backend (fallback)
// ---------------------------------------------------------------------------

/**
 * Check + increment the rate bucket for an IP (in-memory, synchronous).
 * Returns true when the request is allowed; false when it exceeds the limit.
 */
export function rateLimit(ip: string, { limit = 20, windowMs = 60_000 }: RateLimitOptions = {}): boolean {
  if (!ip) return true // can't key — don't block legit traffic

  const now = Date.now()
  const existing = buckets.get(ip)

  if (!existing || now - existing.windowStart >= windowMs) {
    // Fresh window (or expired): reset and allow.
    if (buckets.size >= MAX_BUCKETS) {
      // Evict one expired bucket to bound memory.
      for (const [key, bucket] of buckets) {
        if (now - bucket.windowStart >= windowMs) {
          buckets.delete(key)
          break
        }
      }
      if (buckets.size >= MAX_BUCKETS) buckets.clear()
    }
    buckets.set(ip, { count: 1, windowStart: now })
    return true
  }

  existing.count += 1
  return existing.count <= limit
}

/**
 * Preferred entry point: distributed when Upstash is configured,
 * in-memory otherwise. Always resolves — never throws.
 */
export async function rateLimitAsync(ip: string, opts: RateLimitOptions = {}): Promise<boolean> {
  if (!ip) return true
  if (UPSTASH_ENABLED) {
    try {
      return await rateLimitUpstash(ip, opts)
    } catch {
      // Upstash hiccup → degrade to the in-memory limiter, don't block traffic.
      return rateLimit(ip, opts)
    }
  }
  return rateLimit(ip, opts)
}

/** Client IP from a NextRequest, honoring proxy headers. */
export function clientIp(req: { headers: { get(name: string): string | null } }): string {
  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return req.headers.get('x-real-ip') || 'unknown'
}

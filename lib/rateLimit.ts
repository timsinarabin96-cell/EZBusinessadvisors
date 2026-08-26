// =============================================================================
// Lightweight in-memory rate limiter for public (unauthenticated) endpoints.
// -----------------------------------------------------------------------------
// Sliding-window counter keyed by client IP. Keeps public POST routes
// (contact forms, lead captures, notifications) from being spammed without
// adding infra. Server-only. Memory-bounded: the map prunes stale keys on
// every check.
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

/**
 * Check + increment the rate bucket for an IP.
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

/** Client IP from a NextRequest, honoring proxy headers. */
export function clientIp(req: { headers: { get(name: string): string | null } }): string {
  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return req.headers.get('x-real-ip') || 'unknown'
}

// =============================================================================
// Stripe webhook signature verification (no SDK — raw REST + node crypto).
// -----------------------------------------------------------------------------
// Stripe signs every webhook payload: the `stripe-signature` header carries
// `t=<timestamp>,v1=<hmac>`. The HMAC is SHA-256 of `${timestamp}.${rawBody}`
// keyed with the webhook signing secret (STRIPE_WEBHOOK_SECRET). Constant-time
// comparison + tolerance window guard against replay/forgery.
// Server-only.
// =============================================================================

import { createHmac, timingSafeEqual } from 'node:crypto'

export interface StripeSignatureParts {
  timestamp: number
  signatures: string[]
}

/** Parse a `stripe-signature` header into its `t=` and `v1=` parts. */
export function parseStripeSignature(header: string | null | undefined): StripeSignatureParts | null {
  if (!header) return null
  const timestamp = Number(header.match(/(?:^|,)\s*t=(\d+)/)?.[1] ?? NaN)
  const signatures = [...header.matchAll(/(?:^|,)\s*v1=([^,]+)/g)].map((m) => m[1])
  if (!Number.isFinite(timestamp) || signatures.length === 0) return null
  return { timestamp, signatures }
}

/**
 * Verify a raw webhook body against the `stripe-signature` header.
 * - Returns true when any `v1` signature matches the expected HMAC.
 * - Rejects signatures older than `toleranceSeconds` (default 5 min) to prevent
 *   replay attacks. Set toleranceSeconds = Infinity to skip the window check
 *   (useful in tests / demo mode).
 */
export function verifyStripeSignature(
  rawBody: string | Buffer,
  header: string | null | undefined,
  secret: string,
  toleranceSeconds = 300,
): boolean {
  if (!secret || !header) return false
  const parsed = parseStripeSignature(header)
  if (!parsed) return false

  const nowSec = Math.floor(Date.now() / 1000)
  if (toleranceSeconds !== Infinity && Math.abs(nowSec - parsed.timestamp) > toleranceSeconds) {
    return false
  }

  const body = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8')
  const expected = createHmac('sha256', secret).update(`${parsed.timestamp}.${body}`).digest('hex')

  return parsed.signatures.some((sig) => {
    const a = Buffer.from(sig)
    const b = Buffer.from(expected)
    return a.length === b.length && timingSafeEqual(a, b)
  })
}

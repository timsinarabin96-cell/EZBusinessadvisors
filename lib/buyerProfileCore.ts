// =============================================================================
// Buyer profile core — pure, testable logic for the buyer self-service
// profile API. sanitizeBuyerProfilePatch whitelists updatable fields and
// normalizes values before they touch the DB.
// =============================================================================

export const BUYER_PROFILE_FIELDS = [
  'name', 'industries', 'locations', 'min_price', 'max_price', 'min_revenue',
  'min_sde', 'available_cash', 'financing_methods', 'owner_involvement',
  'timeline', 'notification_email', 'notification_sms', 'notification_frequency',
  'ai_match_enabled', 'active',
] as const

export type BuyerProfilePatch = Partial<Record<(typeof BUYER_PROFILE_FIELDS)[number], unknown>>

const STRING_FIELDS = new Set(['name', 'owner_involvement', 'timeline', 'notification_frequency'])
const BOOLEAN_FIELDS = new Set(['notification_email', 'notification_sms', 'ai_match_enabled', 'active'])
const ARRAY_FIELDS = new Set(['industries', 'locations', 'financing_methods'])
const NUMERIC_FIELDS = new Set(['min_price', 'max_price', 'min_revenue', 'min_sde', 'available_cash'])

/**
 * Whitelist + normalize an incoming buyer profile patch.
 * - Arrays: split/normalize into trimmed non-empty strings.
 * - Booleans: coerce via Boolean.
 * - Numbers: accept finite numbers, null clears, everything else is dropped.
 * - Strings: trim; null is kept (clears).
 * Unknown keys are ignored entirely.
 */
export function sanitizeBuyerProfilePatch(body: Record<string, unknown>): BuyerProfilePatch {
  const patch: BuyerProfilePatch = {}
  for (const key of BUYER_PROFILE_FIELDS) {
    if (body[key] === undefined) continue
    const value = body[key]
    if (ARRAY_FIELDS.has(key)) {
      patch[key] = Array.isArray(value)
        ? value.filter((v) => v !== null && v !== undefined && String(v).trim() !== '').map((v) => String(v).trim())
        : []
    } else if (BOOLEAN_FIELDS.has(key)) {
      patch[key] = Boolean(value)
    } else if (NUMERIC_FIELDS.has(key)) {
      if (value === null) patch[key] = null
      else if (typeof value === 'number' && Number.isFinite(value)) patch[key] = value
    } else if (STRING_FIELDS.has(key)) {
      patch[key] = value === null ? null : String(value).trim()
    }
  }
  return patch
}

/** Human-friendly summary of the buyer's criteria for alert emails / UI. */
export function describeBuyerCriteria(profile: {
  industries?: string[]
  locations?: string[]
  min_price?: number | null
  max_price?: number | null
  min_sde?: number | null
}): string {
  const parts: string[] = []
  if (profile.industries?.length) parts.push(`Industries: ${profile.industries.join(', ')}`)
  if (profile.locations?.length) parts.push(`Locations: ${profile.locations.join(', ')}`)
  if (profile.min_price != null && profile.max_price != null) parts.push(`Price $${profile.min_price.toLocaleString()}–$${profile.max_price.toLocaleString()}`)
  else if (profile.min_price != null) parts.push(`Price from $${profile.min_price.toLocaleString()}`)
  else if (profile.max_price != null) parts.push(`Price up to $${profile.max_price.toLocaleString()}`)
  if (profile.min_sde != null) parts.push(`Min SDE $${profile.min_sde.toLocaleString()}`)
  return parts.length ? parts.join(' · ') : 'Open to all businesses'
}

// =============================================================================
// listingIntakeCore — pure, dependency-free parsing for the AI intake flow.
// Turns a raw AI extraction (JSON object of free-form strings) into a safe
// partial IntelligentListingInput: normalizes money, trims, drops unknown
// keys, and applies privacy rules (private fields never leak into public
// fields; public fields must stay anonymous).
// Unit-testable without a database.
// =============================================================================

export const INTAKE_NUMERIC_FIELDS = [
  'asking_price', 'annual_revenue', 'sde', 'ebitda', 'inventory_value', 'ffe_value',
  'established_year', 'employees_full_time', 'employees_part_time', 'owner_hours_weekly',
  'lease_monthly', 'lease_square_feet', 'square_footage', 'land_acres', 'year_built',
  'property_value', 'training_period_weeks',
] as const

export const INTAKE_TEXT_FIELDS = [
  'business_name', 'headline', 'industry', 'sub_industry', 'location_general',
  'description', 'reason_for_sale', 'growth_opportunities', 'competitive_advantages',
  'customer_concentration', 'facilities_summary', 'lease_expires_on',
  'property_address', 'property_city', 'property_description', 'financing_notes',
  'transition_support', 'public_title', 'public_summary', 'public_highlights',
  'seller_approval_reference', 'video_url',
] as const

export const INTAKE_BOOLEAN_FIELDS = [
  'real_estate_included', 'ffe_included', 'inventory_included', 'goodwill_included',
  'asset_sale', 'seller_financing_available', 'show_financials',
] as const

export type IntakeDraft = Partial<Record<string, string | boolean | number | null>>

/** Normalize a money/number string: strip $, commas, spaces; keep decimals. */
export function normalizeNumber(raw: unknown): string {
  if (raw === null || raw === undefined) return ''
  const s = String(raw).trim()
  if (!s) return ''
  const cleaned = s.replace(/[$,€£\s]/g, '')
  if (!/^-?\d*\.?\d*$/.test(cleaned)) return ''
  return cleaned
}

/** Strip obvious privacy leaks from buyer-facing public fields. */
export function anonymizePublic(text: string): string {
  return text
    .replace(/\b\d{3}[-.)]\s?\d{3}[-.]\s?\d{4}\b/g, '[phone]')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]')
    .replace(/\b\d{2,6}\s+[A-Za-z0-9]+\s+(?:st|street|ave|avenue|rd|road|blvd|bvd|ln|lane|dr|drive|ct|court|cir|circle|pike|hwy|highway|route|way)\b/gi, '[address]')
    .trim()
}

const TRUTHY = new Set(['true', 'yes', 'y', '1', 'on', 'include', 'included', 'available'])
const FALSEY = new Set(['false', 'no', 'n', '0', 'off', 'not included', 'unavailable'])

function toBool(v: unknown): boolean | null {
  if (typeof v === 'boolean') return v
  const s = String(v ?? '').trim().toLowerCase()
  if (TRUTHY.has(s)) return true
  if (FALSEY.has(s)) return false
  return null
}

/**
 * Convert a raw AI extraction into a safe partial listing draft.
 * Only known fields pass through; numbers are normalized; booleans coerced;
 * public fields are anonymized; private values never overwrite public fields
 * (the AI should draft public copy, not copy private data).
 */
export function sanitizeIntakeDraft(raw: Record<string, unknown> | null | undefined): IntakeDraft {
  if (!raw || typeof raw !== 'object') return {}
  const out: IntakeDraft = {}

  for (const key of INTAKE_NUMERIC_FIELDS) {
    if (key in raw) {
      const n = normalizeNumber(raw[key])
      if (n) out[key] = n
    }
  }
  for (const key of INTAKE_TEXT_FIELDS) {
    if (key in raw) {
      const v = String(raw[key] ?? '').trim()
      if (v) out[key] = v
    }
  }
  for (const key of INTAKE_BOOLEAN_FIELDS) {
    if (key in raw) {
      const b = toBool(raw[key])
      if (b !== null) out[key] = b
    }
  }

  // Privacy: public buyer-facing fields must not carry private identifiers.
  if (typeof out.public_summary === 'string') out.public_summary = anonymizePublic(out.public_summary)
  if (typeof out.public_highlights === 'string') out.public_highlights = anonymizePublic(out.public_highlights)
  if (typeof out.public_title === 'string') out.public_title = anonymizePublic(out.public_title)

  return out
}

/** Count how many meaningful fields a draft actually filled. */
export function draftCoverage(draft: IntakeDraft): { filled: number; total: number } {
  const filled = Object.values(draft).filter((v) => {
    if (typeof v === 'string') return v.trim().length > 0
    return v !== null && v !== undefined
  }).length
  const total = INTAKE_TEXT_FIELDS.length + INTAKE_NUMERIC_FIELDS.length + INTAKE_BOOLEAN_FIELDS.length
  return { filled, total }
}

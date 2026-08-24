// =============================================================================
// Sold-Comps Core — pure helpers (zero imports, unit-testable under Node)
// =============================================================================

const US_STATES = new Set([
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY','DC',
])

/** Extract a trailing US state code from "City, ST" style locations. */
export function extractState(location: string | null | undefined): string | null {
  if (!location) return null
  const match = location.match(/\b([A-Za-z]{2})\b\s*$/)
  if (!match) return null
  const candidate = match[1].toUpperCase()
  return US_STATES.has(candidate) ? candidate : null
}

export function daysBetween(fromIso: string | null | undefined, toIso?: string): number | null {
  if (!fromIso) return null
  const from = new Date(fromIso).getTime()
  if (Number.isNaN(from)) return null
  const to = toIso ? new Date(toIso).getTime() : Date.now()
  return Math.max(0, Math.round((to - from) / 86400000))
}

// =============================================================================
// Location page resolver — maps /marketplace/location/[slug] to the US
// locations table (33k+ cities/counties/states) so EVERY city, county, and
// state gets a real SEO page — even with zero listings right now.
// =============================================================================

import { createServerClient } from '@/lib/supabase/server'

export interface ResolvedLocation {
  slug: string
  label: string          // "Harrisburg, PA"
  name: string           // "Harrisburg"
  stateCode: string | null
  stateName: string | null
  placeType: 'city' | 'county' | 'state' | 'zip'
  /** URL-safe slug for nearby-location links */
  nearby: { slug: string; label: string; placeType: string }[]
}

const STATE_NAMES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado',
  CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho',
  IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana',
  ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi',
  MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
  NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio',
  OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia',
  WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming', DC: 'District of Columbia',
  PR: 'Puerto Rico',
}

const STATE_CODES = new Set(Object.keys(STATE_NAMES))

/** "harrisburg-pa" → { name: "harrisburg", state: "PA" } ; "pennsylvania" → state-only. */
function parseSlug(slug: string): { name: string; state: string | null; stateOnly: boolean } {
  const parts = slug.toLowerCase().split('-')
  const last = parts[parts.length - 1]?.toUpperCase() || ''
  if (STATE_CODES.has(last) && parts.length > 1) {
    return { name: parts.slice(0, -1).join(' '), state: last, stateOnly: false }
  }
  // State-only slug: "pennsylvania" or "pa"
  const full = parts.join(' ')
  for (const [code, name] of Object.entries(STATE_NAMES)) {
    if (full === name.toLowerCase() || full === code.toLowerCase()) {
      return { name: '', state: code, stateOnly: true }
    }
  }
  return { name: parts.join(' '), state: null, stateOnly: false }
}

const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase())

/** Resolve a location slug against the locations table. Null when unknown. */
export async function resolveLocationSlug(slug: string): Promise<ResolvedLocation | null> {
  const db = createServerClient()
  if (!db) return null

  const { name, state, stateOnly } = parseSlug(slug)

  try {
    if (stateOnly && state) {
      // State page: "pennsylvania" / "pa"
      return {
        slug,
        label: STATE_NAMES[state],
        name: STATE_NAMES[state],
        stateCode: state,
        stateName: STATE_NAMES[state],
        placeType: 'state',
        nearby: await nearbyCities(db, state, slug, 24),
      }
    }

    // City/county: match name + state (prefer exact state when given).
    let q = db.from('locations').select('name, state_code, state_name, place_type, display')
    q = q.ilike('name', name)
    if (state) q = q.eq('state_code', state)
    const { data } = await q.order('place_type', { ascending: true }).limit(5)

    if (!data || data.length === 0) return null

    // Prefer city over county when both match; prefer exact case match.
    const pick = data.find((r) => r.place_type === 'city') || data[0]
    const placeType = (pick.place_type || 'city') as ResolvedLocation['placeType']

    return {
      slug,
      label: pick.display || `${titleCase(pick.name)}, ${pick.state_code}`,
      name: pick.name,
      stateCode: pick.state_code || null,
      stateName: pick.state_name || (pick.state_code ? STATE_NAMES[pick.state_code] : null) || null,
      placeType,
      nearby: await nearbyCities(db, pick.state_code, slug, 24),
    }
  } catch {
    return null
  }
}

/** Nearby cities in the same state for interlinking (SEO). */
async function nearbyCities(
  db: NonNullable<ReturnType<typeof createServerClient>>,
  stateCode: string | null,
  currentSlug: string,
  limit: number,
): Promise<ResolvedLocation['nearby']> {
  if (!stateCode) return []
  const { data } = await db
    .from('locations')
    .select('name, state_code, place_type')
    .eq('state_code', stateCode)
    .eq('place_type', 'city')
    .order('name', { ascending: true })
    .limit(500)
  const out: ResolvedLocation['nearby'] = []
  for (const r of data || []) {
    const s = `${r.name.toLowerCase().replace(/\s+/g, '-')}-${(r.state_code || '').toLowerCase()}`
    if (s === currentSlug) continue
    out.push({ slug: s, label: `${titleCase(r.name)}, ${r.state_code}`, placeType: r.place_type || 'city' })
    if (out.length >= limit) break
  }
  return out
}

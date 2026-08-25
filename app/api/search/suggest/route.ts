import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

// ---------------------------------------------------------------------------
// GET /api/search/suggest?q=H&type=location|category
// Autocomplete suggestions for the public marketplace + CRM search.
//   type=location  → cities / counties / states from the US locations table
//                    (33k+ rows: Harrisburg PA, Harris County TX, states…)
//                    plus listing-derived locations ranked first.
//   type=category  → industries / business categories from listings
// Typing "H" in location suggests Harrisburg, PA · Hershey, PA · Harris
// County, TX · Hawaii… instantly. Zero tokens, instant.
// ---------------------------------------------------------------------------

const CATEGORY_COLS = ['industry', 'sub_industry', 'business_type']

export interface LocationSuggestion {
  display: string
  state_code: string | null
  place_type: 'city' | 'county' | 'state' | 'zip' | 'listing'
}

export async function GET(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  const q = (req.nextUrl.searchParams.get('q') || '').trim().toLowerCase()
  const type = req.nextUrl.searchParams.get('type') || 'location'
  const limit = Math.min(Math.max(Number(req.nextUrl.searchParams.get('limit')) || 8, 1), 15)

  try {
    if (type === 'category') {
      const { data } = await db
        .from('listings')
        .select('industry, sub_industry, business_type')
        .eq('status', 'active')
        .limit(500)
      const seen = new Set<string>()
      const out: string[] = []
      for (const row of data || []) {
        for (const col of CATEGORY_COLS) {
          const v = String((row as any)[col] || '').trim()
          if (v && !seen.has(v.toLowerCase())) {
            seen.add(v.toLowerCase())
            out.push(v)
          }
        }
      }
      const filtered = q ? out.filter((v) => v.toLowerCase().includes(q)) : out
      return NextResponse.json({ ok: true, suggestions: filtered.slice(0, limit), type: 'category' })
    }

    // ---- location: cities / counties / states from the locations table ----
    const suggestions: LocationSuggestion[] = []

    // 1) Listing-derived locations first (your own cities rank highest).
    const { data: listingLocs } = await db
      .from('listings')
      .select('location_general, property_city, property_state')
      .eq('status', 'active')
      .limit(500)
    const seenListing = new Set<string>()
    for (const row of listingLocs || []) {
      for (const col of ['location_general', 'property_city', 'property_state'] as const) {
        const v = String((row as any)[col] || '').trim()
        if (!v) continue
        const key = v.toLowerCase()
        if (seenListing.has(key)) continue
        seenListing.add(key)
        if (!q || key.includes(q)) {
          suggestions.push({ display: v, state_code: null, place_type: 'listing' })
        }
      }
    }

    // 2) US locations table — cities, counties, states (case-insensitive prefix).
    const prefix = `${q}%`
    const { data: cityRows } = await db
      .from('locations')
      .select('display, state_code, place_type')
      .or(`name.ilike.${prefix},display.ilike.${prefix}`)
      .order('place_type', { ascending: true }) // cities before counties/states
      .limit(40)

    const seenLoc = new Set<string>()
    for (const row of cityRows || []) {
      const display = String((row as any).display || '')
      if (!display || seenLoc.has(display.toLowerCase())) continue
      seenLoc.add(display.toLowerCase())
      suggestions.push({
        display,
        state_code: (row as any).state_code || null,
        place_type: ((row as any).place_type || 'city') as LocationSuggestion['place_type'],
      })
    }

    // Dedup (listing loc vs table) preserving order.
    const seen = new Set<string>()
    const merged: LocationSuggestion[] = []
    for (const s of suggestions) {
      const key = s.display.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      merged.push(s)
    }

    return NextResponse.json({ ok: true, suggestions: merged.slice(0, limit), type: 'location' })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Suggest failed' }, { status: 500 })
  }
}

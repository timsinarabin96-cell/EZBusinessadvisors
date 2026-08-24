import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

// ---------------------------------------------------------------------------
// GET /api/search/suggest?q=H&type=location|category
// Autocomplete suggestions for the public marketplace + CRM search.
//   type=location  → cities / counties / states (from listings data)
//   type=category  → industries / business categories
// Typing "H" in location suggests cities starting with H; typing "R" in
// category suggests Retail, Restaurants, etc. Zero tokens, instant.
// ---------------------------------------------------------------------------

const LOCATION_COLS = ['location_general', 'property_city', 'property_state']
const CATEGORY_COLS = ['industry', 'sub_industry', 'business_type']

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

    // location: cities, counties, states
    const { data } = await db
      .from('listings')
      .select('location_general, property_city, property_state')
      .eq('status', 'active')
      .limit(800)
    const seen = new Set<string>()
    const out: string[] = []
    for (const row of data || []) {
      for (const col of LOCATION_COLS) {
        const v = String((row as any)[col] || '').trim()
        if (v && !seen.has(v.toLowerCase())) {
          seen.add(v.toLowerCase())
          out.push(v)
        }
      }
    }
    // Normalize: "Houston, TX" and "Houston" both count as Houston.
    const filtered = q ? out.filter((v) => v.toLowerCase().includes(q)) : out
    return NextResponse.json({ ok: true, suggestions: filtered.slice(0, limit), type: 'location' })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Suggest failed' }, { status: 500 })
  }
}

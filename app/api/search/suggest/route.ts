/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { suggestBusinessCategories, titleCaseCategory } from '@/lib/businessCategories'

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
    if (type === 'category' || type === 'keyword') {
      // Raw listing-derived values are cleaned (title-cased, trimmed) and then
      // merged with the curated business-category taxonomy so suggestions are
      // always real categories (Retail, Restaurant…) — never junk free-text.
      const { data } = await db
        .from('listings')
        .select('industry, sub_industry, business_type')
        .eq('status', 'active')
        .limit(500)
      const listingValues: string[] = []
      for (const row of data || []) {
        for (const col of CATEGORY_COLS) {
          const v = titleCaseCategory(String((row as any)[col] || ''))
          if (v) listingValues.push(v)
        }
      }
      const suggestions = suggestBusinessCategories(q, listingValues)
      return NextResponse.json({ ok: true, suggestions: suggestions.slice(0, limit), type })
    }

    if (type === 'state') {
      const prefix = `${q}%`
      const { data: stateRows } = await db
        .from('locations')
        .select('display, state_code, place_type')
        .eq('place_type', 'state')
        .or(`name.ilike.${prefix},display.ilike.${prefix}`)
        .order('display', { ascending: true })
        .limit(60)
      const suggestions = (stateRows || []).map((r) => ({
        display: String((r as any).display || ''),
        state_code: (r as any).state_code || null,
        place_type: 'state',
      }))
      return NextResponse.json({ ok: true, suggestions: suggestions.slice(0, limit), type: 'state' })
    }

    if (type === 'county') {
      const stateFilter = req.nextUrl.searchParams.get('state') || ''
      const prefix = `${q}%`
      let query = db
        .from('locations')
        .select('display, state_code, place_type')
        .eq('place_type', 'county')
      if (stateFilter) query = query.eq('state_code', stateFilter.toUpperCase())
      query = query.or(`name.ilike.${prefix},display.ilike.${prefix}`).order('display', { ascending: true }).limit(80)
      const { data: countyRows } = await query
      const suggestions = (countyRows || []).map((r) => ({
        display: String((r as any).display || ''),
        state_code: (r as any).state_code || null,
        place_type: 'county',
      }))
      return NextResponse.json({ ok: true, suggestions: suggestions.slice(0, limit), type: 'county' })
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

    // 2) US locations table — states first, then counties, then cities, so
    //    typing "H" surfaces Hawaii AND Harris County AND cities (boss: list of
    //    City or state starting with the letter).
    const prefix = `${q}%`
    const { data: stateRows } = await db
      .from('locations')
      .select('display, state_code, place_type')
      .eq('place_type', 'state')
      .or(`name.ilike.${prefix},display.ilike.${prefix}`)
      .order('display', { ascending: true })
      .limit(20)

    const seenLoc = new Set<string>()
    for (const row of stateRows || []) {
      const display = String((row as any).display || '')
      if (!display || seenLoc.has(display.toLowerCase())) continue
      seenLoc.add(display.toLowerCase())
      suggestions.push({
        display,
        state_code: (row as any).state_code || null,
        place_type: 'state' as LocationSuggestion['place_type'],
      })
    }

    const { data: countyRows } = await db
      .from('locations')
      .select('display, state_code, place_type')
      .eq('place_type', 'county')
      .or(`name.ilike.${prefix},display.ilike.${prefix}`)
      .order('display', { ascending: true })
      .limit(40)

    for (const row of countyRows || []) {
      const display = String((row as any).display || '')
      if (!display || seenLoc.has(display.toLowerCase())) continue
      seenLoc.add(display.toLowerCase())
      suggestions.push({
        display,
        state_code: (row as any).state_code || null,
        place_type: 'county' as LocationSuggestion['place_type'],
      })
    }

    const { data: cityRows } = await db
      .from('locations')
      .select('display, state_code, place_type')
      .eq('place_type', 'city')
      .or(`name.ilike.${prefix},display.ilike.${prefix}`)
      .order('display', { ascending: true })
      .limit(40)

    for (const row of cityRows || []) {
      const display = String((row as any).display || '')
      if (!display || seenLoc.has(display.toLowerCase())) continue
      seenLoc.add(display.toLowerCase())
      suggestions.push({
        display,
        state_code: (row as any).state_code || null,
        place_type: 'city' as LocationSuggestion['place_type'],
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

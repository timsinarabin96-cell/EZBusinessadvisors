/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Natural-Language Search Parser (zero-token "AI" search)
// -----------------------------------------------------------------------------
// Turns free-text queries like "laundromat under $500k in queens with
// financing" into structured SearchFilters — using pure rules, NOT an LLM,
// so it costs $0 per query and scales to millions of searches.
//
// Design: industry dictionary + price/revenue money patterns + location
// extraction + boolean flags. Deterministic, instant, private (nothing
// leaves the browser/server). If a query is too complex for rules, we
// degrade gracefully to a plain keyword search — never a token bill.
// =============================================================================

import type { SearchFilters } from '@/lib/marketplace'

const INDUSTRY_ALIASES: Record<string, string> = {
  laundromat: 'Laundromat', 'laundromats': 'Laundromat', 'laundry': 'Laundromat',
  'car wash': 'Car Wash', 'carwash': 'Car Wash', 'auto wash': 'Car Wash',
  restaurant: 'Restaurant', restaurants: 'Restaurant', diner: 'Restaurant', cafe: 'Restaurant', pizzeria: 'Restaurant',
  'gas station': 'Gas Station', 'gas stations': 'Gas Station', 'convenience store': 'Convenience Store',
  'convenience stores': 'Convenience Store', bodega: 'Convenience Store',
  'daycare': 'Daycare', 'childcare': 'Daycare', 'day care': 'Daycare',
  'home care': 'Home Care', 'homecare': 'Home Care', 'healthcare': 'Healthcare',
  'auto repair': 'Auto Repair', 'mechanic': 'Auto Repair', 'auto shop': 'Auto Repair',
  salon: 'Salon', 'beauty salon': 'Salon', barbershop: 'Barbershop', barber: 'Barbershop',
  'pet grooming': 'Pet Grooming', 'pet store': 'Pet Store',
  'e-commerce': 'E-Commerce', ecommerce: 'E-Commerce', 'online business': 'E-Commerce', 'amazon': 'E-Commerce',
  'dental': 'Dental', dentist: 'Dental',
  'pharmacy': 'Pharmacy',
  'warehouse': 'Warehouse', 'logistics': 'Logistics', 'distribution': 'Distribution',
  'manufacturing': 'Manufacturing', 'manufacturer': 'Manufacturing',
  'construction': 'Construction', 'landscaping': 'Landscaping', 'landscaper': 'Landscaping',
  'janitorial': 'Janitorial', cleaning: 'Cleaning', 'cleaning service': 'Cleaning', 'maid': 'Cleaning',
  'vending': 'Vending', 'vending machine': 'Vending', 'franchise': 'Franchise',
  hotel: 'Hotel', motel: 'Hotel', 'bed and breakfast': 'Bed & Breakfast',
  'gym': 'Gym', fitness: 'Gym', 'personal training': 'Fitness',
  'storage': 'Storage', 'self storage': 'Storage', 'self-storage': 'Storage',
  'liquor': 'Liquor Store', 'liquor store': 'Liquor Store', 'wine': 'Liquor Store',
  'bakery': 'Bakery', 'coffee': 'Coffee Shop', 'coffee shop': 'Coffee Shop',
  'trucking': 'Trucking', 'freight': 'Trucking',
  'plumbing': 'Plumbing', 'hvac': 'HVAC', 'electrical': 'Electrical',
  'print': 'Printing', 'printing': 'Printing',
  'funeral': 'Funeral Home', 'funeral home': 'Funeral Home',
  'veterinary': 'Veterinary', 'vet clinic': 'Veterinary', 'animal hospital': 'Veterinary',
}

const MONEY_PATTERN = /(?:under|below|less than|up to|at most|max|≤|<)?\s*\$?\s*(\d[\d,]*(?:\.\d+)?)\s*(k|m|million|thousand|billion)?\b/gi

/** Normalize a money token like "500k" → 500000. */
function parseMoney(raw: string, suffix?: string): number | null {
  const value = Number(raw.replace(/,/g, ''))
  if (!Number.isFinite(value) || value <= 0) return null
  const s = (suffix || '').toLowerCase()
  if (s.startsWith('m')) return value * 1_000_000
  if (s.startsWith('b')) return value * 1_000_000_000
  if (s.startsWith('k') || s === 'thousand') return value * 1_000
  return value
}

const STATE_ABBREVS = new Set(['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'])

const CITY_SUFFIXES = [' city', ' town', ' village', ' borough', ' heights', ' beach', ' springs', ' park', ' grove', ' creek', ' junction', ' falls', ' ridge', 'view', 'mont', 'field', 'port', 'ville']

/**
 * Parse free-text into structured filters. Always returns a usable object
 * (falls back to keyword query). Zero tokens, zero cost.
 */
export function parseNaturalQuery(raw: string): { filters: SearchFilters; keywords: string[]; note?: string } {
  const text = raw.trim()
  const keywords: string[] = []
  const filters: SearchFilters = {}
  if (!text) return { filters, keywords }

  let rest = text.toLowerCase()

  // --- Industry detection ---
  for (const [alias, canonical] of Object.entries(INDUSTRY_ALIASES)) {
    if (rest.includes(alias)) {
      filters.industry = canonical
      rest = rest.replace(alias, ' ')
      keywords.push(canonical)
      break // first match wins; avoid double-matching "laundromat" + "laundry"
    }
  }

  // --- Money detection: max price (default) or min price ("over $X") ---
  const moneyMatches = [...rest.matchAll(MONEY_PATTERN)]
  for (const m of moneyMatches) {
    const amount = parseMoney(m[1], m[2])
    if (amount == null) continue
    const before = rest.slice(Math.max(0, (m.index || 0) - 8), m.index || 0)
    if (/over|above|more than|min|at least|≥|>/.test(before)) {
      filters.minPrice = amount
    } else {
      filters.maxPrice = filters.maxPrice ? Math.min(filters.maxPrice, amount) : amount
    }
  }

  // --- Location extraction (state abbreviations + "in <place>" / city-ish tokens) ---
  const stateMatch = rest.match(/\b([A-Za-z]{2})\b/g)
  if (stateMatch) {
    for (const token of stateMatch) {
      if (STATE_ABBREVS.has(token.toUpperCase())) {
        filters.location = token.toUpperCase()
        rest = rest.replace(token, ' ')
        break
      }
    }
  }
  const inMatch = rest.match(/in\s+([a-z][a-z\s'-]{2,40}?)(?:\s+(?:with|and|under|over|financ|for|under|below|max)|\s*$)/)
  if (!filters.location && inMatch) {
    filters.location = inMatch[1].trim()
    rest = rest.replace(inMatch[0], ' ')
  }

  // --- Boolean flags ---
  if (/\b(absentee|passive|semi-absentee|semi absentee)\b/.test(rest)) {
    filters.absenteeOnly = true
    rest = rest.replace(/\b(absentee|passive|semi-absentee|semi absentee)\b/g, ' ')
  }
  if (/\b(franchise|franchised)\b/.test(rest)) {
    filters.franchiseOnly = true
    rest = rest.replace(/\b(franchise|franchised)\b/g, ' ')
  }
  if (/\b(financ(ing|ed)?|seller financing|sba)\b/.test(rest)) {
    filters.financingAvailable = true
    rest = rest.replace(/\b(financ(ing|ed)?|seller financing|sba)\b/g, ' ')
  }
  if (/\brelocat(able|ed|ing)?\b/.test(rest)) {
    filters.relocatableOnly = true
    rest = rest.replace(/\brelocat(able|ed|ing)?\b/g, ' ')
  }

  // --- SDE multiple (e.g. "2x sde", "under 3x") ---
  const multipleMatch = rest.match(/(?:under|below|less than|max|≤|<)?\s*(\d(?:\.\d)?)\s*x\s*(?:sde|earnings)/)
  if (multipleMatch) {
    filters.maxSdeMultiple = Number(multipleMatch[1])
    rest = rest.replace(multipleMatch[0], ' ')
  }

  // --- Remaining words become keyword search ---
  const leftovers = rest.replace(/[^\w\s'-]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !['the','and','for','with','that','this','from','have','are','was','were','business','businesses','sale','sales','buy','sell','looking','want','under','over','below','above','max','min','price','around','about','near','please','help','show','me','any'].includes(w))
  for (const word of leftovers) {
    if (!keywords.includes(word)) keywords.push(word)
  }
  if (keywords.length > 0 && !filters.industry && !filters.location && filters.maxPrice == null) {
    filters.query = keywords.join(' ')
  } else if (keywords.length > 0) {
    filters.query = keywords.join(' ')
  }

  return { filters, keywords, note: 'Parsed with zero-token natural-language search' }
}

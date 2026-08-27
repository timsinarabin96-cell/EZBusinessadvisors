/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Business Category Taxonomy — the canonical list of business-for-sale
// categories used by the marketplace search + listing studio autocomplete.
// Categories are curated so suggestions are always real business categories
// (never junk free-text pulled from listing data).
// =============================================================================

export const BUSINESS_CATEGORIES: string[] = [
  // Retail & consumer goods
  'Retail',
  'Convenience Store',
  'Liquor Store',
  'Grocery',
  'E-Commerce',
  'Franchise',
  // Food & beverage
  'Restaurant',
  'Food & Beverage',
  'Bakery',
  'Coffee Shop',
  'Catering',
  'Food Truck',
  // Trades & construction
  'Trades & Construction',
  'Plumbing',
  'HVAC',
  'Electrical',
  'Landscaping',
  'Roofing',
  'General Contracting',
  'Painting',
  // Automotive
  'Automotive',
  'Auto Repair',
  'Auto Detailing',
  'Auto Services',
  'Car Wash',
  'Gas Station',
  'Trucking',
  // Healthcare
  'Healthcare',
  'Dental',
  'Pharmacy',
  'Home Care',
  'Veterinary',
  'Medical',
  'Physical Therapy',
  // Business services
  'Business Services',
  'Cleaning',
  'Janitorial',
  'Accounting',
  'Marketing',
  'IT Services',
  'Consulting',
  'Staffing',
  'Security',
  'Printing',
  // Technology
  'Technology',
  'Software',
  'SaaS',
  // Industrial
  'Manufacturing',
  'Warehouse',
  'Storage',
  'Logistics',
  'Distribution',
  // Hospitality
  'Hotel',
  'Motel',
  'Hospitality',
  // Personal services
  'Salon',
  'Barbershop',
  'Nail Salon',
  'Spa',
  'Gym',
  'Fitness',
  'Daycare',
  'Pet Grooming',
  'Pet Store',
  'Laundromat',
  'Vending',
  'Funeral Home',
  'Real Estate',
  'Education',
  'Entertainment',
]

/** Title-case a free-text value so "home Care agency" → "Home Care Agency". */
export function titleCaseCategory(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((w) => (w.length > 1 ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w.toUpperCase()))
    .join(' ')
}

/**
 * Build the category suggestion list for a query: curated taxonomy first
 * (prefix matches ranked ahead of contains matches), then clean listing-derived
 * values appended as extras (title-cased, trimmed, deduped).
 */
export function suggestBusinessCategories(query: string, listingValues: string[] = []): string[] {
  const q = query.trim().toLowerCase()
  const seen = new Set<string>()
  const out: string[] = []

  const push = (v: string) => {
    const key = v.toLowerCase()
    if (v && !seen.has(key)) {
      seen.add(key)
      out.push(v)
    }
  }

  // Curated taxonomy — prefix matches first, then contains matches.
  if (q) {
    for (const c of BUSINESS_CATEGORIES) if (c.toLowerCase().startsWith(q)) push(c)
    for (const c of BUSINESS_CATEGORIES) if (!seen.has(c.toLowerCase()) && c.toLowerCase().includes(q)) push(c)
  } else {
    for (const c of BUSINESS_CATEGORIES) push(c)
  }

  // Listing-derived extras (cleaned), so brokers can still find custom sub-industries.
  for (const raw of listingValues) {
    const clean = titleCaseCategory(raw)
    if (!clean) continue
    if (q && !clean.toLowerCase().includes(q)) continue
    push(clean)
  }

  return out
}

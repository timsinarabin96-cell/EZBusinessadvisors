/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Free Stock Photos for Listings — zero-cost imagery
// -----------------------------------------------------------------------------
// Curated, license-free Unsplash-style image URLs per industry category, so a
// broker can publish an attractive listing even with no photos of their own.
// All images are sourced from Unsplash's CDN (free to use under the Unsplash
// License). Fallback is a premium navy/gold gradient with an industry icon.
// =============================================================================

export const FREE_IMAGE_LIBRARY: Record<string, string[]> = {
  'Laundromat': ['https://images.unsplash.com/photo-1604335399105-a0c585fd81a1?w=1200&q=80'],
  'Car Wash': ['https://images.unsplash.com/photo-1601362840469-51e4d8d58785?w=1200&q=80'],
  'Restaurant': ['https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1200&q=80'],
  'Gas Station': ['https://images.unsplash.com/photo-1556656793-08538906a9f8?w=1200&q=80'],
  'Convenience Store': ['https://images.unsplash.com/photo-1604719312566-8912e9227c6a?w=1200&q=80'],
  'Home Care': ['https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=1200&q=80'],
  'Healthcare': ['https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=1200&q=80'],
  'E-Commerce': ['https://images.unsplash.com/photo-1563013544-824ae1b704d3?w=1200&q=80'],
  'Salon': ['https://images.unsplash.com/photo-1560066984-138dadb4c035?w=1200&q=80'],
  'Barbershop': ['https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=1200&q=80'],
  'Auto Repair': ['https://images.unsplash.com/photo-1487754180451-c456f719a1fc?w=1200&q=80'],
  'Dental': ['https://images.unsplash.com/photo-1606811841689-23dfddce3e95?w=1200&q=80'],
  'Pharmacy': ['https://images.unsplash.com/photo-1587854692152-cbe660dbde88?w=1200&q=80'],
  'Hotel': ['https://images.unsplash.com/photo-1566073771259-6a8506099945?w=1200&q=80'],
  'Storage': ['https://images.unsplash.com/photo-1590247813693-5541d1c609fd?w=1200&q=80'],
  'Warehouse': ['https://images.unsplash.com/photo-1553413077-190dd305871c?w=1200&q=80'],
  'Manufacturing': ['https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=1200&q=80'],
  'Cleaning': ['https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=1200&q=80'],
  'Vending': ['https://images.unsplash.com/photo-1574717024453-354056f8f6b9?w=1200&q=80'],
  'Gym': ['https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=1200&q=80'],
  'Fitness': ['https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=1200&q=80'],
  'Daycare': ['https://images.unsplash.com/photo-1503454537195-1dcabb73ffb9?w=1200&q=80'],
  'Pet Grooming': ['https://images.unsplash.com/photo-1516734212186-a967f81ad0d7?w=1200&q=80'],
  'Pet Store': ['https://images.unsplash.com/photo-1548199973-03cce0bbc87b?w=1200&q=80'],
  'Liquor Store': ['https://images.unsplash.com/photo-1516594915697-87eb3b1c14ea?w=1200&q=80'],
  'Bakery': ['https://images.unsplash.com/photo-1509440159596-0249088772ff?w=1200&q=80'],
  'Coffee Shop': ['https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=1200&q=80'],
  'Trucking': ['https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?w=1200&q=80'],
  'Plumbing': ['https://images.unsplash.com/photo-1607472586893-edb57bdc0e39?w=1200&q=80'],
  'HVAC': ['https://images.unsplash.com/photo-1581092918056-0c4c3acd3789?w=1200&q=80'],
  'Printing': ['https://images.unsplash.com/photo-1563514227147-6d2ff665a6a0?w=1200&q=80'],
  'Landscaping': ['https://images.unsplash.com/photo-1558904541-efa843a96f01?w=1200&q=80'],
  'Janitorial': ['https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=1200&q=80'],
  'Veterinary': ['https://images.unsplash.com/photo-1583337130417-3346a1be7dee?w=1200&q=80'],
  'Funeral Home': ['https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1200&q=80'],
  'Franchise': ['https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=1200&q=80'],
  'Retail': ['https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=1200&q=80'],
  'Food & Beverage': ['https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=1200&q=80'],
  'Auto Services': ['https://images.unsplash.com/photo-1486262715619-67b85e0b08d3?w=1200&q=80'],
}

const GENERIC = [
  'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=1200&q=80',
  'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1200&q=80',
  'https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=1200&q=80',
  'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=1200&q=80',
]

/** Deterministic pick for an industry (stable per industry+index). */
export function stockImageFor(industry: string | null | undefined, index = 0): string | null {
  const key = (industry || '').trim()
  const candidates = FREE_IMAGE_LIBRARY[key] || GENERIC
  return candidates[index % candidates.length] || null
}

/**
 * Auto-generated branded placeholder URL (ImageResponse route) — the final
 * fallback when a listing has no gallery photos. Deterministic per query,
 * CDN-cacheable, zero storage cost.
 */
export function placeholderImageFor(opts: {
  title?: string | null
  industry?: string | null
  price?: number | string | null
  agency?: string | null
}): string {
  const p = new URLSearchParams()
  if (opts.title) p.set('title', String(opts.title).slice(0, 90))
  if (opts.industry) p.set('industry', String(opts.industry).slice(0, 40))
  if (opts.price) p.set('price', String(opts.price))
  if (opts.agency) p.set('agency', String(opts.agency).slice(0, 40))
  const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://concord.ezbusinessadvisors.com'
  return `${base}/api/listing-images/placeholder?${p.toString()}`
}

/**
 * Route stock photos through our own domain so they always load — even when
 * the external image CDN (images.unsplash.com) is slow or blocked on the
 * buyer's network. Non-Unsplash URLs (user uploads) pass through untouched.
 */
export function proxiedStockUrl(url: string | null | undefined): string | null {
  if (!url) return null
  if (/^https:\/\/images\.unsplash\.com\//.test(url)) {
    return `/api/listing-images/proxy?u=${encodeURIComponent(url)}`
  }
  return url
}

/** Full fallback chain: gallery → real industry stock photo → branded placeholder. */
export function listingImageFor(
  gallery: string[] | null | undefined,
  industry: string | null | undefined,
  opts: { title?: string | null; price?: number | string | null; agency?: string | null; subIndustry?: string | null } = {},
): string | null {
  if (gallery && gallery.length > 0 && gallery[0]) return proxiedStockUrl(gallery[0])
  // Real photo first: sub-industry (e.g. "Bakery Cafe") → industry (e.g. "Food & Beverage") → generic.
  const stock = bestStockImage(opts.subIndustry || null, industry)
  if (stock) return proxiedStockUrl(stock)
  return placeholderImageFor({ industry, title: opts.title, price: opts.price, agency: opts.agency })
}

/** Pick the most relevant real stock photo: sub-industry → industry → generic. */
export function bestStockImage(subIndustry: string | null | undefined, industry: string | null | undefined): string | null {
  const tryExact = (label: string | null | undefined) => {
    const key = (label || '').trim()
    return key && FREE_IMAGE_LIBRARY[key] ? FREE_IMAGE_LIBRARY[key][0] : null
  }
  // Exact sub-industry (e.g. "Smoke Shop") → fuzzy sub → exact industry → fuzzy industry → generic.
  const sub = (subIndustry || '').trim()
  const ind = (industry || '').trim()
  const exact = tryExact(sub)
  if (exact) return exact
  // Fuzzy sub-industry BEFORE industry fallback — so "Smoke Shop" never
  // silently becomes a clothing-store "Retail" photo.
  const subLower = sub.toLowerCase()
  if (subLower) {
    for (const [key] of Object.entries(FREE_IMAGE_LIBRARY)) {
      const k = key.toLowerCase()
      if (subLower.includes(k) || k.includes(subLower)) return FREE_IMAGE_LIBRARY[key][0]
    }
    // A specific sub-industry that has no matching photo → branded placeholder
    // (shows the business name + industry), never an unrelated industry photo.
    return null
  }
  const indExact = tryExact(ind)
  if (indExact) return indExact
  const indLower = ind.toLowerCase()
  for (const [key] of Object.entries(FREE_IMAGE_LIBRARY)) {
    const k = key.toLowerCase()
    if (indLower && (indLower.includes(k) || k.includes(indLower))) return FREE_IMAGE_LIBRARY[key][0]
  }
  return GENERIC[0] || null
}

/** All suggested images for an industry (for the broker photo picker). */
export function stockImagesFor(industry: string | null | undefined): string[] {
  const key = (industry || '').trim()
  return FREE_IMAGE_LIBRARY[key] || GENERIC
}

/** Attribution note — Unsplash License permits free commercial use. */
export const STOCK_IMAGE_NOTE = 'Free professional photos via Unsplash License — no attribution required.'

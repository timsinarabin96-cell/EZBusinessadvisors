// =============================================================================
// Public Buyer Toolkit — favorites, compare, and buyer profile (localStorage)
// -----------------------------------------------------------------------------
// Accountless: everything lives in the visitor's browser. No signup required
// to save a listing, compare deals, or get a match score. The buyer profile
// powers the zero-token AI match engine (lib/matchScore.ts).
// =============================================================================

'use client'

const FAV_KEY = 'concord_favorites'
const COMPARE_KEY = 'concord_compare'
const PROFILE_KEY = 'concord_buyer_profile'

export interface BuyerProfile {
  industries: string[]
  max_price: number | null
  min_sde: number | null
  locations: string[]
  absentee_preferred: boolean
  franchise_ok: boolean
}

export const DEFAULT_PROFILE: BuyerProfile = {
  industries: [],
  max_price: null,
  min_sde: null,
  locations: [],
  absentee_preferred: false,
  franchise_ok: true,
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage full / private mode — degrade silently */
  }
}

// --- Favorites -------------------------------------------------------------
export function getFavorites(): string[] {
  return readJson<string[]>(FAV_KEY, [])
}

export function isFavorite(listingId: string): boolean {
  return getFavorites().includes(listingId)
}

export function toggleFavorite(listingId: string): boolean {
  const current = getFavorites()
  const exists = current.includes(listingId)
  const next = exists ? current.filter((id) => id !== listingId) : [...current, listingId]
  writeJson(FAV_KEY, next)
  return !exists
}

// --- Compare ---------------------------------------------------------------
export const COMPARE_MAX = 3

export function getCompare(): string[] {
  return readJson<string[]>(COMPARE_KEY, [])
}

export function isComparing(listingId: string): boolean {
  return getCompare().includes(listingId)
}

export function toggleCompare(listingId: string): { added: boolean; full: boolean } {
  const current = getCompare()
  const exists = current.includes(listingId)
  if (exists) {
    writeJson(COMPARE_KEY, current.filter((id) => id !== listingId))
    return { added: false, full: false }
  }
  if (current.length >= COMPARE_MAX) return { added: false, full: true }
  writeJson(COMPARE_KEY, [...current, listingId])
  return { added: true, full: false }
}

// --- Buyer profile (powers AI match scores) --------------------------------
export function getBuyerProfile(): BuyerProfile {
  return { ...DEFAULT_PROFILE, ...readJson<Partial<BuyerProfile>>(PROFILE_KEY, {}) }
}

export function saveBuyerProfile(profile: BuyerProfile) {
  writeJson(PROFILE_KEY, profile)
}

export function clearBuyerProfile() {
  if (typeof window !== 'undefined') window.localStorage.removeItem(PROFILE_KEY)
}

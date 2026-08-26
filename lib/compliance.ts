/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Global Compliance Engine — per-state + per-country brokerage rules
// -----------------------------------------------------------------------------
// Advisory tooling (NOT legal advice): evaluates whether a listing needs a
// real-estate / business-broker license in its jurisdiction, based on the
// compliance_jurisdictions matrix. Default: most US states require a license
// ONLY when real property transfers; California requires one for business
// opportunities generally. Verify with counsel / the state commission.
// =============================================================================

import { createClient } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase/client'

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const svc =
  SUPABASE_URL && SERVICE_KEY
    ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
    : null

export type ComplianceRule = 're_license_when_real_estate' | 're_license_always' | 'no_license' | 'restricted'

export interface Jurisdiction {
  country_code: string
  state_code: string | null
  rule: ComplianceRule
  note: string | null
  is_default: boolean
}

export interface ListingComplianceInput {
  id: string
  agency_id: string
  country_code?: string | null
  location_general?: string | null
  real_estate_included?: boolean | null
}

export interface ComplianceEvaluation {
  listing_id: string
  country_code: string
  state_code: string | null
  rule: ComplianceRule
  license_required: boolean
  reason: string
  checklist: { key: string; label: string; required: boolean }[]
}

const DEFAULT_RULE: ComplianceRule = 're_license_when_real_estate'

/** Extract a US state code from location text like "Harrisburg, PA" or "PA". */
export function extractStateCode(location: string | null | undefined): string | null {
  if (!location) return null
  const match = location.match(/\b([A-Za-z]{2})\b\s*$/)
  if (!match) return null
  const candidate = match[1].toUpperCase()
  if (/^[A-Z]{2}$/.test(candidate) && !['PA','CA','NY','TX','FL','IL','OH','GA','NC','MI','NJ','VA','WA','AZ','MA','TN','IN','MO','MD','WI','CO','MN','SC','AL','LA','KY','OR','OK','CT','UT','IA','NV','AR','MS','KS','NM','NE','WV','ID','HI','NH','ME','MT','RI','DE','SD','ND','AK','VT','WY','DC'].includes(candidate)) {
    return null
  }
  return candidate
}

/** Fetch the jurisdiction rule for a country (+ optional US state). */
export async function getJurisdiction(countryCode: string, stateCode: string | null): Promise<Jurisdiction> {
  if (!svc) return { country_code: countryCode, state_code: stateCode, rule: DEFAULT_RULE, note: null, is_default: true }
  const country = (countryCode || 'US').toUpperCase()

  // 1) Exact state match (US).
  if (country === 'US' && stateCode) {
    const { data } = await svc.from('compliance_jurisdictions').select('*').eq('country_code', 'US').eq('state_code', stateCode).maybeSingle()
    if (data) return data as Jurisdiction
  }
  // 2) Country-level match.
  const { data: countryRow } = await svc.from('compliance_jurisdictions').select('*').eq('country_code', country).is('state_code', null).maybeSingle()
  if (countryRow) return countryRow as Jurisdiction
  // 3) US default.
  if (country === 'US') {
    const { data: usDefault } = await svc.from('compliance_jurisdictions').select('*').eq('country_code', 'US').is('state_code', null).maybeSingle()
    if (usDefault) return usDefault as Jurisdiction
  }
  return { country_code: country, state_code: stateCode, rule: DEFAULT_RULE, note: null, is_default: true }
}

/**
 * Evaluate a listing's compliance posture and build its required-disclosure
 * checklist. Deterministic + advisory; persists nothing by itself.
 */
export async function evaluateListingCompliance(listing: ListingComplianceInput): Promise<ComplianceEvaluation> {
  const countryCode = (listing.country_code || 'US').toUpperCase()
  const stateCode = extractStateCode(listing.location_general)
  const jurisdiction = await getJurisdiction(countryCode, stateCode)
  const realEstate = listing.real_estate_included === true

  let licenseRequired = false
  let reason = jurisdiction.note || ''
  const checklist: { key: string; label: string; required: boolean }[] = []

  switch (jurisdiction.rule) {
    case 're_license_always':
      licenseRequired = true
      reason = reason || 'This jurisdiction requires a broker license for business-opportunity brokerage.'
      checklist.push({ key: 'license_required', label: 'Broker license required in this jurisdiction', required: true })
      break
    case 're_license_when_real_estate':
      licenseRequired = realEstate
      reason = reason || 'License required only when the sale transfers real property.'
      checklist.push({ key: 'real_estate_disclosure', label: 'Real-estate transfer disclosure', required: realEstate })
      break
    case 'no_license':
      checklist.push({ key: 'no_license', label: 'No general brokerage license required', required: false })
      break
    case 'restricted':
      licenseRequired = true
      reason = reason || 'This jurisdiction has additional local restrictions — verify with counsel.'
      checklist.push({ key: 'local_restrictions', label: 'Local restrictions — verify with counsel', required: true })
      break
  }

  if (realEstate) checklist.push({ key: 'property_details', label: 'Property details & real-estate disclosures complete', required: true })
  checklist.push(
    { key: 'confidentiality', label: 'Confidentiality level set', required: true },
    { key: 'seller_approval', label: 'Written seller approval on file', required: true },
    { key: 'financials_verified', label: 'Financials recast & verified', required: true },
  )

  return {
    listing_id: listing.id,
    country_code: countryCode,
    state_code: stateCode,
    rule: jurisdiction.rule,
    license_required: licenseRequired,
    reason,
    checklist,
  }
}

/** Public: list all jurisdictions (for a compliance info page / broker education). */
export async function listJurisdictions(): Promise<Jurisdiction[]> {
  const { data } = await supabase.from('compliance_jurisdictions').select('*').order('country_code', { ascending: true })
  return (data || []) as Jurisdiction[]
}

// ---------------------------------------------------------------------------
// License profile helpers — broker-side license tracking + advisory checks.
// ---------------------------------------------------------------------------

export type LicenseStatus = 'unverified' | 'pending' | 'verified' | 'not_required' | 'expired'

export interface ProfileLicense {
  real_estate_license_number: string | null
  real_estate_license_state: string | null
  license_status: LicenseStatus
  is_license_verified: boolean
}

export interface LicenseCheck {
  ok: boolean
  licensed: boolean
  verified: boolean
  licenseNumber: string | null
  licenseState: string | null
  status: LicenseStatus
  reason: string
}

export interface RealEstateListingCheck {
  canList: boolean
  reason: string
}

/** Load the current user's license fields from their profile. */
export async function getMyLicense(): Promise<ProfileLicense | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  return getLicenseFor(user.id)
}

export async function getLicenseFor(userId: string): Promise<ProfileLicense | null> {
  const { data } = await supabase
    .from('profiles')
    .select('real_estate_license_number, real_estate_license_state, license_status, is_license_verified')
    .eq('id', userId)
    .maybeSingle()
  if (!data) return null
  return {
    real_estate_license_number: data.real_estate_license_number ?? null,
    real_estate_license_state: data.real_estate_license_state ?? null,
    license_status: (data.license_status as LicenseStatus) ?? 'unverified',
    is_license_verified: data.is_license_verified ?? false,
  }
}

/** Advisory check — does this agent hold a compliant, verified license? */
export async function checkAgentLicense(userId?: string): Promise<LicenseCheck> {
  const profile = userId ? await getLicenseFor(userId) : await getMyLicense()
  if (!profile) {
    return {
      ok: true, licensed: false, verified: false,
      licenseNumber: null, licenseState: null, status: 'not_required',
      reason: 'Most states do not require a license to broker business assets. A real-estate license is only needed when the sale transfers real property (and for business opportunities in CA).',
    }
  }

  // Explicitly marked not-required → nothing to verify.
  if (profile.license_status === 'not_required') {
    return {
      ok: true, licensed: false, verified: false,
      licenseNumber: profile.real_estate_license_number,
      licenseState: profile.real_estate_license_state,
      status: 'not_required',
      reason: 'No license required — most states do not license business brokerage. A real-estate license is only needed when the sale transfers real property.',
    }
  }

  const licensed = !!profile.real_estate_license_number && !!profile.real_estate_license_state
  const verified = profile.is_license_verified === true && profile.license_status === 'verified'
  const expired = profile.license_status === 'expired'
  let reason = ''
  if (expired) reason = 'Your real-estate license is expired.'
  else if (!licensed) reason = 'No real-estate license on file. Only needed when the sale transfers real property — most business-asset sales do not require one.'
  else if (!verified) reason = 'License on file but not yet verified.'
  return {
    ok: !!licensed && !!verified && !expired,
    licensed, verified,
    licenseNumber: profile.real_estate_license_number,
    licenseState: profile.real_estate_license_state,
    status: profile.license_status,
    reason,
  }
}

/** May this agent list a deal that includes real property in targetState? */
export async function canListWithRealEstate(userId?: string, targetState?: string | null): Promise<RealEstateListingCheck> {
  const license = await checkAgentLicense(userId)
  if (!license.ok) {
    return { canList: false, reason: license.reason || 'Agent is not verified to broker real-estate-inclusive deals.' }
  }
  if (targetState) {
    const norm = targetState.trim().toUpperCase()
    if (license.licenseState && license.licenseState.toUpperCase() !== norm) {
      return {
        canList: false,
        reason: `License is held in ${license.licenseState.toUpperCase()}, not ${norm}. Confirm reciprocity or licensure in ${norm} before listing real estate here.`,
      }
    }
  }
  return { canList: true, reason: 'Agent is licensed and verified for this real-estate listing.' }
}

// States where brokering a business that transfers real property commonly
// requires an active real-estate license. Conservative advisory default.
// NOTE: business-asset-only sales (no real property) are unlicensed in most
// states; only CA treats business opportunities as always-licensed.
export const LICENSED_STATES = new Set([
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY','DC',
])

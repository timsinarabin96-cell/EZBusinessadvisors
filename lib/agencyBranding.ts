/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// AGENCY BRANDING RESOLVER — the single injection point for every licensed
// broker's identity.
//
// Every client-facing surface (CIM, BLI, LOI, legal pack, flyer, closing
// packet, emails) pulls the AGENCY's own legal name + branding from here —
// never a hardcoded "EZ Business Advisors". Licensed brokers get their own
// name, logo, colors, contact, and signing identity on their client docs.
//
// Usage:
//   const brand = await resolveAgencyBranding(agencyId)   // DB-backed
//   const brand = brandFromRow(row)                        // pure (tests)
// =============================================================================

import { createServerClient } from '@/lib/supabase/server'

/** The full identity block every generator needs. */
export interface AgencyBrand {
  /** Legal entity name (e.g. "Harbor Acquisitions LLC"). */
  legalName: string
  /** Display / trading name (falls back to legalName). */
  displayName: string
  logoUrl: string | null
  phone: string | null
  email: string | null
  brandColor: string
  accentColor: string
  /** Copyright footer name (defaults to displayName). */
  copyrightName: string | null
  /** Signing identity for NDAs / documents (migration 0004). */
  signingName: string | null
  signingTitle: string | null
  signingSignature: string | null
  /** Raw agency row id this brand was resolved from. */
  agencyId: string | null
}

/** Neutral platform fallback — used only when no agency can be resolved. */
export function platformBrand(): AgencyBrand {
  return {
    legalName: 'Concord Deal Platform',
    displayName: 'Concord Deal Platform',
    logoUrl: null,
    phone: null,
    email: null,
    brandColor: '#1a1a2e',
    accentColor: '#c9a84c',
    copyrightName: 'Concord Deal Platform',
    signingName: null,
    signingTitle: null,
    signingSignature: null,
    agencyId: null,
  }
}

/**
 * Pure builder from a raw agencies row — the testable core. Any shape with
 * the known agency columns works; missing fields fall back gracefully.
 */
export function brandFromRow(row: Record<string, unknown> | null | undefined): AgencyBrand {
  const name = String(row?.name || '').trim()
  return {
    legalName: String(row?.legal_name || name || 'Concord Deal Platform').trim(),
    displayName: name || String(row?.legal_name || '').trim() || 'Concord Deal Platform',
    logoUrl: (row?.logo_url as string | null) || null,
    phone: (row?.phone as string | null) || null,
    email: (row?.email as string | null) || null,
    brandColor: String(row?.brand_color || '#1a1a2e'),
    accentColor: String(row?.accent_color || '#c9a84c'),
    copyrightName: (row?.copyright_name as string | null) || name || null,
    signingName: (row?.signing_name as string | null) || null,
    signingTitle: (row?.signing_title as string | null) || null,
    signingSignature: (row?.signing_signature as string | null) || null,
    agencyId: (row?.id as string | null) || null,
  }
}

/** Resolve an agency's brand from the DB. Never throws — falls back neutral. */
export async function resolveAgencyBranding(agencyId: string | null | undefined): Promise<AgencyBrand> {
  if (!agencyId) return platformBrand()
  try {
    const db = createServerClient()
    if (!db) return platformBrand()
    const { data } = await db
      .from('agencies')
      // NOTE: no legal_name column on live agencies — name IS the legal/trading
      // name today. brandFromRow still tolerates legal_name for forward-compat.
      .select('id, name, brand_color, accent_color, logo_url, copyright_name, phone, email, signing_name, signing_title, signing_signature')
      .eq('id', agencyId)
      .maybeSingle()
    if (!data) return platformBrand()
    return brandFromRow(data as Record<string, unknown>)
  } catch {
    return platformBrand()
  }
}



/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Agency white-label theme service
// -----------------------------------------------------------------------------
// Each brokerage can run the platform on its own domain with its own logo,
// colors, fonts, and hero style. Themes live in `agency_site_themes` and are
// applied to the public agency home + marketplace surfaces.
// =============================================================================

import { createClient } from '@supabase/supabase-js'

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const svc =
  SUPABASE_URL && SERVICE_KEY
    ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
    : null

export interface AgencyTheme {
  agency_id: string
  custom_domain: string | null
  logo_url: string | null
  favicon_url: string | null
  primary_color: string
  secondary_color: string
  accent_color: string
  heading_font: string
  body_font: string
  hero_style: string
  listing_card_style: string
  business_model: string
  navigation: unknown[]
  homepage_sections: unknown[]
  legal_disclosures: Record<string, unknown>
  updated_at: string | null
}

export const DEFAULT_THEME: Omit<AgencyTheme, 'agency_id' | 'updated_at'> = {
  custom_domain: null,
  logo_url: null,
  favicon_url: null,
  primary_color: '#102a43',
  secondary_color: '#2563eb',
  accent_color: '#38bdf8',
  heading_font: 'system',
  body_font: 'system',
  hero_style: 'editorial',
  listing_card_style: 'intelligence',
  business_model: 'full_service_brokerage',
  navigation: [],
  homepage_sections: [],
  legal_disclosures: {},
}

/** Load a theme for an agency (falls back to defaults). */
export async function getAgencyTheme(agencyId: string): Promise<AgencyTheme> {
  if (!svc) return { agency_id: agencyId, ...DEFAULT_THEME, updated_at: null }
  const { data } = await svc
    .from('agency_site_themes')
    .select('*')
    .eq('agency_id', agencyId)
    .maybeSingle()
  if (!data) return { agency_id: agencyId, ...DEFAULT_THEME, updated_at: null }
  return { ...DEFAULT_THEME, ...(data as Partial<AgencyTheme>) } as AgencyTheme
}

/** Save (upsert) a theme for an agency. */
export async function saveAgencyTheme(
  agencyId: string,
  patch: Partial<Omit<AgencyTheme, 'agency_id' | 'updated_at'>>,
): Promise<{ ok: boolean; error?: string }> {
  if (!svc) return { ok: false, error: 'Database is not configured' }
  const { error } = await svc.from('agency_site_themes').upsert(
    { agency_id: agencyId, ...patch, updated_at: new Date().toISOString() },
    { onConflict: 'agency_id' },
  )
  if (error) return { ok: false, error: error.message || 'Failed to save theme' }
  return { ok: true }
}

/** Map a theme to CSS custom properties for inline application. */
export function themeToCssVars(theme: AgencyTheme): Record<string, string> {
  return {
    '--brand': theme.primary_color,
    '--brand-accent': theme.secondary_color,
    '--accent': theme.accent_color,
    '--heading-font': theme.heading_font === 'system' ? 'inherit' : theme.heading_font,
    '--body-font': theme.body_font === 'system' ? 'inherit' : theme.body_font,
  }
}

/**
 * Resolve the white-label brand for an incoming host (custom domain or the
 * agency's platform subdomain). Returns null when the host matches no agency.
 * Server-only (service-role client).
 */
export async function resolveAgencyThemeByHost(host: string | null | undefined): Promise<{
  agencyId: string
  agencyName: string
  logoUrl: string | null
  theme: AgencyTheme
  cssVars: Record<string, string>
  /** Feed-scope identifier (slug, domain, or custom_domain) for agency-isolated listings. */
  scope: string
} | null> {
  if (!svc || !host) return null
  const clean = host.replace(/^www\./, '').toLowerCase()
  if (!clean) return null

  // Match by custom_domain or platform domain (agencies.domain column), or by
  // subdomain: {slug}.concordplatform.com / {slug}.concord-deal-platform.vercel.app
  const labels = clean.split('.')
  const slugCandidate = labels.length > 2 ? labels[0] : null
  const { data: agency } = await svc
    .from('agencies')
    .select('id, name, logo_url, custom_domain, domain, slug')
    .or(
      [
        `custom_domain.eq.${clean}`,
        `domain.eq.${clean}`,
        ...(slugCandidate ? [`slug.eq.${slugCandidate}`] : []),
      ].join(','),
    )
    .maybeSingle()
  if (!agency?.id) return null

  const theme = await getAgencyTheme(agency.id)
  return {
    agencyId: agency.id,
    agencyName: agency.name || 'Business Exchange',
    logoUrl: agency.logo_url || theme.logo_url || null,
    theme,
    cssVars: themeToCssVars(theme),
    scope: agency.custom_domain || agency.domain || agency.slug || '',
  }
}

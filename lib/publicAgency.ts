// =============================================================================
// publicAgency — server-side agency context for public pages.
// Resolves the incoming host (custom domain or {slug}.concordplatform.com
// subdomain) to the agency scope string used by the marketplace engine, so
// each brokerage's domain shows ONLY its own listings (white-label isolation).
// Server-only (reads next/headers + service-role client).
// =============================================================================

import { headers } from 'next/headers'
import { resolveAgencyThemeByHost } from '@/lib/agencyTheme'

export interface PublicAgencyContext {
  agencyId: string
  agencyName: string
  /** Feed-scope identifier (slug, domain, or custom_domain) — pass to marketplace fetchers. */
  scope: string
  logoUrl: string | null
}

/**
 * Resolve the agency for the current request host. Returns null on the
 * platform's own domain (global feed). Fail-safe: during static generation
 * there is no request scope, so headers() throws — we return null and the
 * static pages render the global feed (live requests get agency scoping).
 */
export async function getPublicAgencyContext(): Promise<PublicAgencyContext | null> {
  let host: string | null = null
  try {
    const hdrs = await headers()
    host = hdrs.get('host') || null
  } catch {
    return null // static generation / non-request context
  }
  const brand = await resolveAgencyThemeByHost(host)
  if (!brand || !brand.scope) return null
  return {
    agencyId: brand.agencyId,
    agencyName: brand.agencyName,
    scope: brand.scope,
    logoUrl: brand.logoUrl,
  }
}

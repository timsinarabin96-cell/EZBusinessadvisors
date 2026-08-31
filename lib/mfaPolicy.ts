/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { createServerClient } from '@/lib/supabase/server'

// =============================================================================
// MFA POLICY — the platform's second-factor enforcement layer.
//
// Who is REQUIRED to have a verified TOTP factor:
//   • super_admin accounts (platform owner) — always, non-negotiable
//   • any account whose agency has require_2fa = true (owner/admin/broker/agent)
//
// The login flow REFUSES access (forces enrollment) when required but not
// enrolled. Admin API routes additionally gate via the same policy so a
// bypassed UI can't reach admin endpoints with a bare password session.
// =============================================================================

export type MfaRequirement = {
  required: boolean
  reason: 'super_admin' | 'agency' | null
  enrolled: boolean
}

/** Does this user's role/agency membership require MFA? (server-side, RLS-safe) */
export async function mfaRequirementFor(userId: string): Promise<MfaRequirement> {
  const db = createServerClient()
  if (!db) return { required: false, reason: null, enrolled: false }

  let role: string | null = null
  let require2fa = false
  try {
    const { data: profile } = await db.from('profiles').select('role').eq('id', userId).maybeSingle()
    role = (profile as { role?: string | null } | null)?.role || null
    const { data: memberships } = await db
      .from('agency_members')
      .select('agency_id')
      .eq('profile_id', userId)
    const agencyIds = ((memberships || []) as { agency_id: string }[]).map((m) => m.agency_id)
    if (agencyIds.length) {
      const { data: agencies } = await db.from('agencies').select('require_2fa').in('id', agencyIds)
      require2fa = ((agencies || []) as { require_2fa?: boolean | null }[]).some((a) => a.require_2fa === true)
    }
  } catch {
    // Policy lookup is best-effort: a DB hiccup must never hard-fail login.
    return { required: false, reason: null, enrolled: false }
  }

  const required = role === 'super_admin' || require2fa
  const reason: MfaRequirement['reason'] = role === 'super_admin' ? 'super_admin' : require2fa ? 'agency' : null
  const enrolled = await userHasVerifiedMfa(userId)

  return { required, reason, enrolled }
}

/**
 * Does the user have a VERIFIED TOTP factor? Uses the GoTrue admin API
 * (service-role key) — the same source the login challenge reads from.
 */
export async function userHasVerifiedMfa(userId: string): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!url || !key) return false
  try {
    const res = await fetch(`${url}/auth/v1/admin/users/${userId}/factors`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      cache: 'no-store',
    })
    if (!res.ok) return false
    const factors = (await res.json()) as { factors?: { factor_type: string; status: string }[] } | { factor_type?: never }
    const list = Array.isArray((factors as { factors?: unknown[] }).factors) ? (factors as { factors: { factor_type: string; status: string }[] }).factors : []
    return list.some((f) => f.factor_type === 'totp' && f.status === 'verified')
  } catch {
    return false
  }
}

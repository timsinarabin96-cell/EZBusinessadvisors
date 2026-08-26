/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import type { User } from '@supabase/supabase-js'
import { createServerClient } from '@/lib/supabase/server'

export type AuthenticatedRequest = {
  user: User
  accessToken: string
}

export type AuthenticatedProfileRequest = AuthenticatedRequest & {
  profile: { id: string; role: string; status: string | null }
  memberships: { agency_id: string; role: string; is_owner: boolean }[]
}

export async function authenticateRequest(req: NextRequest): Promise<AuthenticatedRequest | null> {
  const authorization = req.headers.get('authorization') || ''
  const [scheme, accessToken] = authorization.split(' ')
  if (scheme?.toLowerCase() !== 'bearer' || !accessToken) return null

  const supabase = createServerClient()
  if (!supabase) return null

  const { data, error } = await supabase.auth.getUser(accessToken)
  if (error || !data.user) return null

  return { user: data.user, accessToken }
}

export function unauthorizedResponse(message = 'Authentication required') {
  return NextResponse.json({ ok: false, error: message }, { status: 401 })
}

export function forbiddenResponse(message = 'Insufficient permission') {
  return NextResponse.json({ ok: false, error: message }, { status: 403 })
}

export async function authenticateProfileRequest(req: NextRequest): Promise<AuthenticatedProfileRequest | null> {
  const authenticated = await authenticateRequest(req)
  if (!authenticated) return null

  // STRONG VERIFICATION GATE: unconfirmed emails are rejected everywhere.
  // No portal, no API access, no data — until the user confirms their email.
  if (!authenticated.user.email_confirmed_at) return null

  const supabase = createServerClient()
  if (!supabase) return null
  const [{ data: profile }, { data: memberships }] = await Promise.all([
    supabase.from('profiles').select('id, role, status').eq('id', authenticated.user.id).maybeSingle(),
    supabase.from('agency_members').select('agency_id, role, is_owner').eq('profile_id', authenticated.user.id),
  ])
  if (!profile || profile.status === 'inactive' || profile.status === 'locked' || profile.status === 'banned') return null

  return {
    ...authenticated,
    profile: profile as { id: string; role: string; status: string | null },
    memberships: (memberships || []) as { agency_id: string; role: string; is_owner: boolean }[],
  }
}

export function canManageAgency(authenticated: AuthenticatedProfileRequest, agencyId: string) {
  return authenticated.memberships.some((membership) => membership.agency_id === agencyId && (membership.is_owner || membership.role === 'admin'))
}

export async function canAccessProfile(authenticated: AuthenticatedProfileRequest, profileId: string) {
  if (authenticated.user.id === profileId) return true
  const supabase = createServerClient()
  if (!supabase) return false
  const { data } = await supabase.from('agency_members').select('agency_id').eq('profile_id', profileId)
  const targetAgencies = new Set((data || []).map((membership) => membership.agency_id))
  return authenticated.memberships.some((membership) => targetAgencies.has(membership.agency_id))
}

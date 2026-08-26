/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { supabase } from '@/lib/supabase/client'

export type AgencyContext = {
  userId: string
  agencyId: string
  role: string
  isOwner: boolean
}

/**
 * Resolve the caller's "current" agency.
 *
 * When a profile belongs to multiple agencies (owner/admin of several — e.g.
 * the demo/tester profiles), we pick deterministically instead of grabbing an
 * arbitrary row:
 *   1. prefer owner/admin memberships over plain agents
 *   2. among those, prefer the agency that actually HAS listings (so every
 *      listing selector and dashboard shows real content, never an empty one)
 *   3. fall back to the first membership
 */
export async function getAgencyContext(): Promise<AgencyContext | null> {
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData.user) return null

  const { data: memberships, error } = await supabase
    .from('agency_members')
    .select('agency_id, role, is_owner')
    .eq('profile_id', authData.user.id)
    .order('is_owner', { ascending: false })

  if (error || !memberships?.length) return null

  // 1) Prefer owner/admin memberships.
  const ranked = [...memberships].sort((a, b) => {
    const rank = (m: { is_owner: boolean | null; role: string | null }) => {
      if (m.is_owner) return 2
      if (m.role === 'admin' || m.role === 'broker') return 1
      return 0
    }
    return rank(b) - rank(a)
  })

  // 2) Among the top tier, prefer the agency with the most listings.
  const topTier = ranked.filter((m) => {
    const r = m.is_owner ? 2 : m.role === 'admin' || m.role === 'broker' ? 1 : 0
    const topR = ranked[0].is_owner ? 2 : ranked[0].role === 'admin' || ranked[0].role === 'broker' ? 1 : 0
    return r === topR
  })

  let chosen = ranked[0]
  if (topTier.length > 1) {
    const ids = topTier.map((m) => m.agency_id)
    const { data: counts } = await supabase
      .from('listings')
      .select('agency_id')
      .in('agency_id', ids)
      .in('status', ['approved', 'active', 'pending', 'draft'])
    const tally = new Map<string, number>()
    for (const row of counts || []) tally.set(row.agency_id, (tally.get(row.agency_id) || 0) + 1)
    const withListings = topTier.filter((m) => (tally.get(m.agency_id) || 0) > 0)
    if (withListings.length) {
      chosen = [...withListings].sort((a, b) => (tally.get(b.agency_id) || 0) - (tally.get(a.agency_id) || 0))[0]
    }
  }

  return {
    userId: authData.user.id,
    agencyId: chosen.agency_id,
    role: chosen.role || 'broker',
    isOwner: Boolean(chosen.is_owner),
  }
}

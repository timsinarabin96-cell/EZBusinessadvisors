/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Call Routing — who should handle this call? (ownership-based)
// -----------------------------------------------------------------------------
// Independent-contractor broker model: each agent owns their listings and is
// responsible for closing them; the agency owner is the overseeing broker.
//  1. Caller matches a buyer lead tied to a listing → that listing's OWNING
//     agent (listings.agent_id) handles it — their deal, their close.
//  2. Explicit listing context → that listing's owning agent.
//  3. No listing context → the overseeing broker (agency owner).
// Server-only, never throws.
// =============================================================================

import { createClient } from '@supabase/supabase-js'
import { matchCaller, type CallerIdentity } from './callerMatch'

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const svc =
  SUPABASE_URL && SERVICE_KEY
    ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
    : null

export interface AgentSlot {
  profileId: string
  isOwner: boolean
  role: string | null
  availableFrom: number
  availableTo: number
  timezone: string
}

/** Is the given hour within the agent's window, in their timezone? */
export function isOnClock(slot: Pick<AgentSlot, 'availableFrom' | 'availableTo' | 'timezone'>, now: Date): boolean {
  try {
    const hour = Number(
      new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        hourCycle: 'h23',
        timeZone: slot.timezone || 'America/New_York',
      }).format(now),
    )
    return hour >= slot.availableFrom && hour < slot.availableTo
  } catch {
    return true // bad tz → assume available rather than drop calls
  }
}

/** All agency members with their availability windows. */
export async function agentSlots(agencyId: string): Promise<AgentSlot[]> {
  if (!svc) return []
  const { data } = await svc
    .from('agency_members')
    .select('profile_id, role, is_owner, available_from_hour, available_to_hour, timezone')
    .eq('agency_id', agencyId)
  return ((data || []) as any[]).map((m) => ({
    profileId: m.profile_id,
    isOwner: !!m.is_owner,
    role: m.role || null,
    availableFrom: typeof m.available_from_hour === 'number' ? m.available_from_hour : 9,
    availableTo: typeof m.available_to_hour === 'number' ? m.available_to_hour : 21,
    timezone: m.timezone || 'America/New_York',
  }))
}

/** The agent who OWNS a listing (listings.agent_id) — responsible for the close. */
export async function resolveListingOwner(agencyId: string, listingId: string | null | undefined): Promise<string | null> {
  if (!svc || !listingId) return null
  const { data } = await svc.from('listings').select('agent_id').eq('id', listingId).maybeSingle()
  const agentId = (data as { agent_id?: string | null } | null)?.agent_id || null
  if (!agentId) return null
  // Guard: the agent must actually belong to this agency.
  const { data: member } = await svc.from('agency_members').select('profile_id').eq('agency_id', agencyId).eq('profile_id', agentId).maybeSingle()
  return member ? agentId : null
}

export interface CallRoutingResult {
  profileId: string | null
  onClock: boolean
  identity: CallerIdentity
  listingId: string | null
  basis: 'listing_owner' | 'broker_owner' | 'none'
}

/**
 * Pick who handles an inbound call.
 * Ownership first: the listing's agent (their deal). Otherwise the
 * overseeing broker (agency owner). onClock=false → callback task instead.
 */
export async function pickAgentForCall(
  agencyId: string,
  callerPhone: string | null | undefined,
  opts: { listingId?: string | null } = {},
): Promise<CallRoutingResult> {
  const identity = await matchCaller(agencyId, callerPhone)
  const slots = await agentSlots(agencyId)
  const now = new Date()

  // 1) Listing ownership — from explicit context or the caller's matched lead.
  const listingId = opts.listingId || identity.listingId || null
  const listingOwner = listingId ? await resolveListingOwner(agencyId, listingId) : null
  if (listingOwner) {
    const slot = slots.find((s) => s.profileId === listingOwner) || null
    return {
      profileId: listingOwner,
      onClock: slot ? isOnClock(slot, now) : true,
      identity,
      listingId,
      basis: 'listing_owner',
    }
  }

  // 2) Overseeing broker (agency owner) as the default.
  const broker = slots.find((s) => s.isOwner) || slots[0] || null
  return {
    profileId: broker?.profileId || null,
    onClock: broker ? isOnClock(broker, now) : false,
    identity,
    listingId,
    basis: broker ? 'broker_owner' : 'none',
  }
}

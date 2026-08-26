// =============================================================================
// Call Routing — who should handle this call?
// -----------------------------------------------------------------------------
// Availability-aware agent selection for inbound calls and callbacks.
//  1. Known lead (buyer/seller) with an owning agent → that agent (if on clock)
//  2. Otherwise → least-loaded agent currently within their hours
//  3. Nobody on the clock → null (caller gets a callback task instead)
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

interface AgentSlot {
  profileId: string
  isOwner: boolean
  role: string | null
  availableFrom: number
  availableTo: number
  timezone: string
}

/** Is the given hour within the agent's window, in their timezone? */
function isOnClock(slot: AgentSlot, now: Date): boolean {
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
async function agentSlots(agencyId: string): Promise<AgentSlot[]> {
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

/**
 * Pick the best agent for an inbound call.
 * Returns { profileId, onClock } — onClock=false means nobody is in hours and
 * the caller should get a callback task instead.
 */
export async function pickAgentForCall(
  agencyId: string,
  callerPhone: string | null | undefined,
): Promise<{ profileId: string | null; onClock: boolean; identity: CallerIdentity }> {
  const identity = await matchCaller(agencyId, callerPhone)
  const slots = await agentSlots(agencyId)
  const now = new Date()
  const available = slots.filter((s) => isOnClock(s, now))
  const fallback = slots[0] || null

  if (available.length === 0) {
    // Nobody on the clock → callback task assigned to the owner if present.
    const owner = slots.find((s) => s.isOwner) || fallback
    return { profileId: owner?.profileId || null, onClock: false, identity }
  }

  // Known lead with an owning agent who's on the clock → that agent.
  if (identity.matched && identity.sourceId && available.length > 1) {
    const { data: lead } = await svc!
      .from('buyer_leads')
      .select('assigned_agent_id, claimed_by')
      .eq('id', identity.sourceId)
      .maybeSingle()
    const ownerId = (lead as any)?.assigned_agent_id || (lead as any)?.claimed_by
    if (ownerId && available.some((a) => a.profileId === ownerId)) {
      return { profileId: ownerId, onClock: true, identity }
    }
  }

  // Least-loaded available agent (upcoming non-cancelled appointments).
  const upcoming = await svc!
    .from('appointments')
    .select('assigned_to')
    .eq('agency_id', agencyId)
    .not('status', 'eq', 'cancelled')
    .gte('starts_at', now.toISOString())
  const loads = new Map<string, number>()
  for (const a of (upcoming.data || []) as { assigned_to: string | null }[]) {
    if (a.assigned_to) loads.set(a.assigned_to, (loads.get(a.assigned_to) || 0) + 1)
  }
  const pick = available.sort(
    (a, b) => (loads.get(a.profileId) || 0) - (loads.get(b.profileId) || 0) || a.profileId.localeCompare(b.profileId),
  )[0]
  return { profileId: pick?.profileId || null, onClock: true, identity }
}

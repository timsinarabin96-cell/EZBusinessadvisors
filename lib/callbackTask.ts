// =============================================================================
// Callback Tasks — "if we can't answer, call them back."
// -----------------------------------------------------------------------------
// When an inbound call ends unanswered (short duration, no transfer), we
// auto-create a follow-up task in the reminders/calendar for the best agent,
// due at their next available slot (respects each agent's hours + timezone).
// Server-only, never throws.
// =============================================================================

import { createClient } from '@supabase/supabase-js'
import { pickAgentForCall, agentSlots, type AgentSlot } from './callRouting'
import { createReminder } from './reminders'

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const svc =
  SUPABASE_URL && SERVICE_KEY
    ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
    : null

/** Next slot when an agent is on the clock, in their timezone. */
function nextAvailableDue(slot: AgentSlot | null, now = new Date()): string {
  const fromHour = slot?.availableFrom ?? 9
  const tz = slot?.timezone || 'America/New_York'
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  })
  const wall = (d: Date) => {
    const map: Record<string, number> = {}
    for (const p of dtf.formatToParts(d)) if (p.type !== 'literal') map[p.type] = Number(p.value)
    return map
  }
  const wallNow = wall(now)
  for (let offset = 0; offset < 3; offset++) {
    const wallTarget = new Date(Date.UTC(wallNow.year, wallNow.month - 1, wallNow.day + offset, fromHour, 0, 0))
    // Convert wall-clock (in agent tz) to the real UTC instant.
    const w2 = wall(wallTarget)
    const wallAsUtc = Date.UTC(w2.year, w2.month - 1, w2.day, w2.hour, w2.minute, w2.second)
    const offsetMs = wallAsUtc - wallTarget.getTime()
    const real = new Date(wallTarget.getTime() - offsetMs)
    if (real.getTime() > now.getTime()) return real.toISOString()
  }
  return new Date(now.getTime() + 3600000).toISOString()
}

export interface CallbackTaskResult {
  ok: boolean
  created: boolean
  reminderId?: string | null
  assignee?: string | null
  error?: string
}

/**
 * Auto-create a callback task for a missed inbound call.
 * Returns created=false when there's no caller number to call back.
 */
export async function createCallbackTask(
  agencyId: string,
  opts: { callerNumber?: string | null; callerName?: string | null; listingId?: string | null; startedAt?: string | null },
): Promise<CallbackTaskResult> {
  if (!svc || !agencyId) return { ok: false, created: false, error: 'not configured' }
  const phone = (opts.callerNumber || '').trim()
  if (!phone) return { ok: false, created: false, error: 'no caller number' }

  try {
    const routing = await pickAgentForCall(agencyId, phone, { listingId: opts.listingId })
    const assignee = routing.profileId
    const slots = assignee ? await agentSlots(agencyId) : []
    const assigneeSlot = slots.find((s) => s.profileId === assignee) || null
    const due = nextAvailableDue(assigneeSlot)

    const name = routing.identity.name || opts.callerName || 'Unknown caller'
    const title = `📞 Call back ${name} (${phone})${routing.identity.listingRef ? ` re: ${routing.identity.listingRef}` : ''} — called ${opts.startedAt ? new Date(opts.startedAt).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'recently'}`

    const result = await createReminder({
      agency_id: agencyId,
      profile_id: assignee,
      listing_id: routing.listingId || opts.listingId || null,
      title: title.slice(0, 300),
      kind: 'call_back',
      due_at: due,
      notes: routing.identity.matched
        ? `Known contact — matched from CRM phone records. Routing basis: ${routing.basis}.`
        : `Routing basis: ${routing.basis}${routing.listingId ? ' (listing owner)' : ' (overseeing broker)'}. Unknown number — caller left a message?`,
    })

    if (!result.ok) return { ok: true, created: false, error: result.error }
    return { ok: true, created: true, reminderId: (result.reminder as { id?: string } | undefined)?.id || null, assignee }
  } catch (error) {
    return { ok: false, created: false, error: error instanceof Error ? error.message : 'callback task failed' }
  }
}

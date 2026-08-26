// =============================================================================
// Callback Tasks — "if we can't answer, call them back."
// -----------------------------------------------------------------------------
// When an inbound call ends unanswered (short duration, no transfer), we
// auto-create a follow-up task in the reminders/calendar for the best agent,
// due at their next available slot (respects each agent's hours + timezone).
// Server-only, never throws.
// =============================================================================

import { createClient } from '@supabase/supabase-js'
import { pickAgentForCall } from './callRouting'
import { createReminder } from './reminders'

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const svc =
  SUPABASE_URL && SERVICE_KEY
    ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
    : null

/** Next slot when an agent is on the clock, in their timezone. */
function nextAvailableDue(slot: { availableFrom: number; timezone: string } | null, now = new Date()): string {
  const fromHour = slot?.availableFrom ?? 9
  const tz = slot?.timezone || 'America/New_York'
  // Try today; if the hour already passed, roll to tomorrow.
  for (let offset = 0; offset < 2; offset++) {
    const candidate = new Date(now)
    candidate.setDate(candidate.getDate() + offset)
    candidate.setHours(fromHour, 0, 0, 0)
    if (candidate > now) return candidate.toISOString()
  }
  const fallback = new Date(now.getTime() + 3600000)
  void tz
  return fallback.toISOString()
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
    const routing = await pickAgentForCall(agencyId, phone)
    const assignee = routing.profileId
    const due = nextAvailableDue(
      assignee ? { availableFrom: 9, timezone: 'America/New_York' } : null,
    )

    const name = routing.identity.name || opts.callerName || 'Unknown caller'
    const title = `📞 Call back ${name} (${phone})${routing.identity.listingRef ? ` re: ${routing.identity.listingRef}` : ''} — called ${opts.startedAt ? new Date(opts.startedAt).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'recently'}`

    const result = await createReminder({
      agency_id: agencyId,
      profile_id: assignee,
      listing_id: routing.identity.listingId || opts.listingId || null,
      title: title.slice(0, 300),
      kind: 'call_back',
      due_at: due,
      notes: routing.identity.matched ? 'Known contact — matched from CRM phone records.' : 'Unknown number — caller left a message?',
    })

    if (!result.ok) return { ok: true, created: false, error: result.error }
    return { ok: true, created: true, reminderId: (result.reminder as { id?: string } | undefined)?.id || null, assignee }
  } catch (error) {
    return { ok: false, created: false, error: error instanceof Error ? error.message : 'callback task failed' }
  }
}

// =============================================================================
// In-App Notification Center
// -----------------------------------------------------------------------------
// Per-agency + per-profile notification inbox fed by platform workflows.
// Server-only helpers; never throws.
// =============================================================================

import { createClient } from '@supabase/supabase-js'

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const svc =
  SUPABASE_URL && SERVICE_KEY
    ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
    : null

export interface NotificationInput {
  agency_id: string
  profile_id?: string | null
  title: string
  body?: string | null
  kind?: string
  link?: string | null
}

/** Insert a notification (optionally targeted at one profile, else agency-wide). */
export async function createNotification(input: NotificationInput): Promise<{ ok: boolean; error?: string }> {
  if (!svc) return { ok: false, error: 'Database is not configured' }
  const { error } = await svc.from('app_notifications').insert({
    agency_id: input.agency_id,
    profile_id: input.profile_id || null,
    title: input.title,
    body: input.body || null,
    kind: input.kind || 'info',
    link: input.link || null,
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/** List notifications for an agency (optionally filtered to one profile). */
export async function listNotifications(agencyId: string, profileId?: string | null, limit = 50): Promise<Record<string, unknown>[]> {
  if (!svc) return []
  let query = svc.from('app_notifications').select('*').eq('agency_id', agencyId)
  if (profileId) query = query.or(`profile_id.is.null,profile_id.eq.${profileId}`)
  const { data } = await query.order('created_at', { ascending: false }).limit(limit)
  return (data || []) as Record<string, unknown>[]
}

/** Mark one notification (or all of a profile's) as read. */
export async function markRead(notificationId?: string, profileId?: string): Promise<{ ok: boolean; error?: string }> {
  if (!svc) return { ok: false, error: 'Database is not configured' }
  let query = svc.from('app_notifications').update({ read_at: new Date().toISOString() }).is('read_at', null)
  if (notificationId) {
    query = query.eq('id', notificationId)
  } else if (profileId) {
    query = query.or(`profile_id.is.null,profile_id.eq.${profileId}`)
  } else {
    return { ok: false, error: 'notificationId or profileId required' }
  }
  const { error } = await query
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/** Unread count for a profile in an agency. */
export async function unreadCount(agencyId: string, profileId?: string | null): Promise<number> {
  if (!svc) return 0
  let query = svc.from('app_notifications').select('id', { count: 'exact', head: true }).eq('agency_id', agencyId).is('read_at', null)
  if (profileId) query = query.or(`profile_id.is.null,profile_id.eq.${profileId}`)
  const { count } = await query
  return count || 0
}

/** Auto-generate workflow notifications (best-effort). */
export async function notifyReview(agencyId: string, listingName: string, action: string, link?: string): Promise<void> {
  await createNotification({
    agency_id: agencyId,
    title: `Listing ${action}: ${listingName}`,
    body: `A listing was ${action} by the review queue.`,
    kind: 'review',
    link,
  })
}

export async function notifyNdaDecision(agencyId: string, requesterName: string, status: string, link?: string): Promise<void> {
  await createNotification({
    agency_id: agencyId,
    title: `NDA request ${status} — ${requesterName}`,
    body: `An NDA access request was ${status}.`,
    kind: 'nda',
    link,
  })
}

export async function notifyMatch(agencyId: string, businessName: string, score: number, link?: string): Promise<void> {
  await createNotification({
    agency_id: agencyId,
    title: `New buyer match (${score}/100): ${businessName}`,
    body: 'A buyer profile matched this listing.',
    kind: 'match',
    link,
  })
}

/**
 * Notify the broker (agency owner + admins) that an agent completed the full
 * CBI training program. Creates an in-app notification per broker profile and
 * best-effort fires a web push to each. Never throws.
 */
export async function notifyTrainingCompleted(
  agencyId: string,
  agentName: string,
  link = '/dashboard/training#certificates',
): Promise<void> {
  if (!svc) return
  try {
    const { data: members } = await svc
      .from('agency_members')
      .select('profile_id')
      .eq('agency_id', agencyId)
      .or('is_owner.eq.true,role.eq.admin')
    const brokerProfileIds = [...new Set((members || []).map((m) => m.profile_id).filter(Boolean))]

    for (const profileId of brokerProfileIds.length ? brokerProfileIds : [null]) {
      await createNotification({
        agency_id: agencyId,
        profile_id: profileId as string | null,
        title: '🎓 Agent completed training',
        body: `${agentName} finished the full Certified Business Intermediary (CBI) program.`, 
        kind: 'training',
        link,
      })
      if (profileId) {
        const { sendPushToProfile } = await import('@/lib/webPush').catch(() => ({ sendPushToProfile: null }))
        if (sendPushToProfile) {
          await sendPushToProfile(profileId, {
            title: '🎓 Agent completed training',
            body: `${agentName} finished the full CBI program.`,
            link,
          }).catch(() => {})
        }
      }
    }
  } catch (e) {
    console.warn('[notifyTrainingCompleted] skip:', (e as Error).message)
  }
}

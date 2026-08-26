/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Server-only notification workflows (web push etc.)
// -----------------------------------------------------------------------------
// Anything that touches Node-only modules (web-push) MUST live here, never in
// lib/notifications.ts — that module is imported by client-reachable code
// (e.g. lib/syndication.ts) and would pull Node builtins into the browser
// bundle and break the build.
// =============================================================================

import { createClient } from '@supabase/supabase-js'
import { createNotification, type NotificationInput } from './notifications'

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const db =
  SUPABASE_URL && SERVICE_KEY
    ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
    : null

/**
 * Create an in-app notification AND fire a PWA web push for the same event.
 * Server-only — web-push is a Node module and must never be imported from
 * client-reachable code (lib/notifications.ts), or `tls` leaks into the
 * browser bundle and the production build breaks.
 * Best-effort: in-app is always recorded; push silently skipped when VAPID
 * isn't configured or no device is registered.
 */
export async function createNotificationWithPush(input: NotificationInput): Promise<{ ok: boolean; error?: string }> {
  const base = await createNotification(input)
  if (!base.ok) return base

  try {
    const { sendPushToProfile } = await import('@/lib/webPush')
    if (input.profile_id) {
      await sendPushToProfile(input.profile_id, {
        title: input.title,
        body: input.body || undefined,
        link: input.link || '/dashboard/notifications',
      })
    } else if (db && input.agency_id) {
      // Agency-wide: ping owners + admins.
      const { data: members } = await db
        .from('agency_members')
        .select('profile_id')
        .eq('agency_id', input.agency_id)
        .or('is_owner.eq.true,role.eq.admin')
      const ids = [...new Set((members || []).map((m) => m.profile_id).filter(Boolean))] as string[]
      for (const pid of ids) {
        await sendPushToProfile(pid, {
          title: input.title,
          body: input.body || undefined,
          link: input.link || '/dashboard/notifications',
        })
      }
    }
  } catch {
    // best-effort — in-app notification already recorded
  }

  return { ok: true }
}

/**
 * Notify the broker (agency owner + admins) that an agent completed the full
 * CBI training program. Creates an in-app notification per broker profile and
 * best-effort fires a web push to each. Never throws. Server-only.
 */
export async function notifyTrainingCompleted(
  agencyId: string,
  agentName: string,
  link = '/dashboard/training#certificates',
): Promise<void> {
  if (!db) return
  try {
    const { data: members } = await db
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

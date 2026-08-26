/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Web Push notifications — server helpers
// -----------------------------------------------------------------------------
// Stores push subscriptions in platform_settings (key/value) as a JSON blob
// so no DDL is required, and sends Web-Push notifications via VAPID keys.
// All functions are best-effort and never throw.
// =============================================================================

import { createClient } from '@supabase/supabase-js'

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const svc =
  SUPABASE_URL && SERVICE_KEY
    ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
    : null

const SETTINGS_KEY = 'push_subscriptions'

interface PushSub {
  profile_id: string
  agency_id: string | null
  endpoint: string
  keys: { p256dh: string; auth: string }
  user_agent?: string | null
  created_at: string
}

function hasVapid(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY)
}

async function readAll(): Promise<PushSub[]> {
  if (!svc) return []
  const { data } = await svc.from('platform_settings').select('value').eq('key', SETTINGS_KEY).maybeSingle()
  if (!data?.value) return []
  try {
    const parsed = JSON.parse(data.value)
    return Array.isArray(parsed) ? (parsed as PushSub[]) : []
  } catch {
    return []
  }
}

async function writeAll(subs: PushSub[]): Promise<void> {
  if (!svc) return
  await svc.from('platform_settings').upsert(
    { key: SETTINGS_KEY, value: JSON.stringify(subs), updated_at: new Date().toISOString() },
    { onConflict: 'key' },
  )
}

/** Save a subscription (deduped by endpoint). */
export async function savePushSubscription(input: {
  profile_id: string
  agency_id?: string | null
  endpoint: string
  keys: { p256dh: string; auth: string }
  user_agent?: string | null
}): Promise<{ ok: boolean; error?: string }> {
  if (!svc) return { ok: false, error: 'Database is not configured' }
  const subs = await readAll()
  const next = subs.filter((s) => s.endpoint !== input.endpoint)
  next.push({
    profile_id: input.profile_id,
    agency_id: input.agency_id || null,
    endpoint: input.endpoint,
    keys: input.keys,
    user_agent: input.user_agent || null,
    created_at: new Date().toISOString(),
  })
  await writeAll(next)
  return { ok: true }
}

/** Remove a subscription by endpoint. */
export async function removePushSubscription(endpoint: string): Promise<{ ok: boolean; error?: string }> {
  if (!svc) return { ok: false, error: 'Database is not configured' }
  const subs = await readAll()
  await writeAll(subs.filter((s) => s.endpoint !== endpoint))
  return { ok: true }
}

/** List all subscriptions for a profile. */
export async function listPushSubscriptions(profileId: string): Promise<PushSub[]> {
  const subs = await readAll()
  return subs.filter((s) => s.profile_id === profileId)
}

/**
 * Send a web push to every device registered to a profile.
 * Best-effort: invalid/expired endpoints are pruned automatically.
 */
export async function sendPushToProfile(
  profileId: string,
  payload: { title: string; body?: string; link?: string },
): Promise<{ ok: boolean; sent: number; error?: string }> {
  if (!hasVapid()) return { ok: false, sent: 0, error: 'VAPID keys not configured' }
  const subs = await listPushSubscriptions(profileId)
  if (subs.length === 0) return { ok: true, sent: 0 }

  try {
    const webpush = (await import('web-push')).default
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || 'mailto:admin@ezbusinessadvisors.com',
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!,
    )

    let sent = 0
    const dead: string[] = []
    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          JSON.stringify({
            title: payload.title,
            body: payload.body || '',
            link: payload.link || '/dashboard/notifications',
            icon: '/icons/icon-192.png',
            badge: '/icons/icon-192.png',
          }),
        )
        sent += 1
      } catch (err: any) {
        // 404/410 → subscription gone; prune it.
        if (err?.statusCode === 404 || err?.statusCode === 410) dead.push(sub.endpoint)
      }
    }
    if (dead.length) {
      const all = await readAll()
      await writeAll(all.filter((s) => !dead.includes(s.endpoint)))
    }
    return { ok: true, sent }
  } catch (e) {
    return { ok: false, sent: 0, error: (e as Error).message }
  }
}

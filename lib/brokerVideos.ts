/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Broker intro videos — Part D #6 "Video everywhere".
// Broker intro / testimonial videos stored in platform_settings JSONB (key →
// { [brokerProfileId]: videoUrl }) so no DDL is required — same pattern as
// push subscriptions. YouTube / Vimeo / direct mp4, rendered by ListingVideo.
// =============================================================================

import { createClient } from '@supabase/supabase-js'

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const svc =
  SUPABASE_URL && SERVICE_KEY
    ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
    : null

const SETTINGS_KEY = 'broker_intro_videos'

async function readAll(): Promise<Record<string, string>> {
  if (!svc) return {}
  const { data } = await svc.from('platform_settings').select('value').eq('key', SETTINGS_KEY).maybeSingle()
  const value = data?.value
  return value && typeof value === 'object' ? (value as Record<string, string>) : {}
}

async function writeAll(map: Record<string, string>): Promise<boolean> {
  if (!svc) return false
  const { error } = await svc.from('platform_settings').upsert({ key: SETTINGS_KEY, value: map }, { onConflict: 'key' })
  return !error
}

/** Get a broker's intro video URL. */
export async function getBrokerVideo(brokerProfileId: string): Promise<string | null> {
  const all = await readAll()
  return all[brokerProfileId] || null
}

/** Set (or clear with '') a broker's intro video URL. */
export async function setBrokerVideo(brokerProfileId: string, videoUrl: string): Promise<{ ok: boolean; error?: string }> {
  if (!brokerProfileId) return { ok: false, error: 'brokerProfileId is required' }
  const all = await readAll()
  const trimmed = (videoUrl || '').trim()
  if (trimmed) all[brokerProfileId] = trimmed
  else delete all[brokerProfileId]
  const ok = await writeAll(all)
  return ok ? { ok: true } : { ok: false, error: 'Failed to save video' }
}

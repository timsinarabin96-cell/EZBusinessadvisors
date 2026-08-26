/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Agency Security Settings — require-2FA enforcement
// -----------------------------------------------------------------------------
// Owner/admin can require two-factor authentication for all agency brokers.
// Server-only; never throws.
// =============================================================================

import { createClient } from '@supabase/supabase-js'

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const svc =
  SUPABASE_URL && SERVICE_KEY
    ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
    : null

/** Read the agency's require-2FA flag. */
export async function getRequire2fa(agencyId: string): Promise<boolean> {
  if (!svc) return false
  const { data } = await svc.from('agencies').select('require_2fa').eq('id', agencyId).maybeSingle()
  return !!data?.require_2fa
}

/** Set the agency's require-2FA flag (owner/admin only — enforce at route level). */
export async function setRequire2fa(agencyId: string, value: boolean): Promise<{ ok: boolean; error?: string }> {
  if (!svc) return { ok: false, error: 'Database is not configured' }
  const { error } = await svc.from('agencies').update({ require_2fa: value }).eq('id', agencyId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { createClient } from '@supabase/supabase-js'

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const svc =
  SUPABASE_URL && SERVICE_KEY
    ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
    : null

// =============================================================================
// Financial Intelligence add-on gate.
// -----------------------------------------------------------------------------
// The FIC (universal reader, extraction review, multi-year ledger, bank-vs-books
// verification) is a SELLABLE add-on ($100/mo). The agency_settings flag
// financial_intelligence_enabled is set by the Stripe webhook (paid) or the
// admin (granted). These helpers enforce the gate server-side so a tenant
// without the add-on gets a clear 403 instead of free access.
// Platform admins always pass (they manage the product).
// =============================================================================

/**
 * Is the Financial Intelligence add-on enabled for this agency?
 * Defaults to TRUE when no settings row exists (the platform's own agency and
 * any pre-existing tenants keep working); admin/super_admin always pass.
 */
export async function isFinancialIntelligenceEnabled(agencyId: string | null | undefined, profileRole?: string | null): Promise<boolean> {
  if (!agencyId) return false
  if (profileRole === 'admin' || profileRole === 'super_admin') return true
  if (!svc) return true // DB not configured — fail open in dev
  const { data } = await svc.from('agency_settings').select('financial_intelligence_enabled').eq('agency_id', agencyId).maybeSingle()
  return data?.financial_intelligence_enabled !== false // default true
}

/** Standard 403 payload for the add-on gate. */
export const financialAddonError = (): { ok: boolean; error: string; addonRequired: boolean } => ({
  ok: false,
  error: 'The Financial Intelligence add-on is not enabled for this agency. Enable it to use the AI financial reader, extraction review, ledger, and verification.',
  addonRequired: true,
})

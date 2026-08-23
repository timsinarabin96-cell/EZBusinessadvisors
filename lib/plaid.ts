// =============================================================================
// Plaid client — server-side only. NEVER import from client components.
// -----------------------------------------------------------------------------
// Sandbox-first integration: create Link tokens, exchange public tokens for
// access tokens, and pull account/balance data. Access tokens are stored in
// verified_financials (agency-scoped RLS) and never exposed to the client.
// =============================================================================

import { createClient } from '@supabase/supabase-js'

const PLAID_CLIENT_ID = process.env.PLAID_CLIENT_ID || ''
const PLAID_SECRET = process.env.PLAID_SECRET || ''
const PLAID_ENV = process.env.PLAID_ENV || 'sandbox'
const PLAID_URL = `https://${PLAID_ENV}.plaid.com`

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const svc =
  SUPABASE_URL && SERVICE_KEY
    ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
    : null

export const plaidConfigured = !!(PLAID_CLIENT_ID && PLAID_SECRET)

/** Create a Link token for a given user (server-side). */
export async function createLinkToken(userId: string): Promise<{ ok: boolean; link_token?: string; error?: string }> {
  if (!plaidConfigured) return { ok: false, error: 'Plaid is not configured' }
  const res = await fetch(`${PLAID_URL}/link/token/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: PLAID_CLIENT_ID,
      secret: PLAID_SECRET,
      client_name: 'Concord Deal Platform',
      user: { client_user_id: userId },
      products: ['auth', 'transactions'],
      country_codes: ['US'],
      language: 'en',
    }),
  })
  const data = await res.json()
  if (!res.ok || !data.link_token) return { ok: false, error: data.error_message || 'Link token failed' }
  return { ok: true, link_token: data.link_token }
}

/** Exchange a public token (from Link) for an access token + item id. */
export async function exchangePublicToken(publicToken: string): Promise<{ ok: boolean; access_token?: string; item_id?: string; error?: string }> {
  if (!plaidConfigured) return { ok: false, error: 'Plaid is not configured' }
  const res = await fetch(`${PLAID_URL}/item/public_token/exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: PLAID_CLIENT_ID, secret: PLAID_SECRET, public_token: publicToken }),
  })
  const data = await res.json()
  if (!res.ok || !data.access_token) return { ok: false, error: data.error_message || 'Exchange failed' }
  return { ok: true, access_token: data.access_token, item_id: data.item_id }
}

/** Fetch account + institution summary for an access token. */
export async function fetchAccounts(accessToken: string): Promise<{
  ok: boolean
  accounts?: { name: string; mask: string | null; subtype: string | null; balances: { current: number | null } }[]
  institution?: string
  error?: string
}> {
  if (!plaidConfigured) return { ok: false, error: 'Plaid is not configured' }
  const res = await fetch(`${PLAID_URL}/accounts/get`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: PLAID_CLIENT_ID, secret: PLAID_SECRET, access_token: accessToken }),
  })
  const data = await res.json()
  if (!res.ok || !data.accounts) return { ok: false, error: data.error_message || 'Accounts failed' }
  return {
    ok: true,
    accounts: data.accounts.map((a: any) => ({
      name: a.name || 'Account',
      mask: a.mask || null,
      subtype: a.subtype || null,
      balances: { current: a.balances?.current ?? null },
    })),
    institution: data.item?.institution_name || null,
  }
}

// ---------------------------------------------------------------------------
// verified_financials persistence (service role — server-side only)
// ---------------------------------------------------------------------------

export interface VerifiedFinancialRecord {
  id: string
  listing_id: string
  agency_id: string
  status: 'pending' | 'connected' | 'verified' | 'failed'
  institution_name: string | null
  account_mask: string | null
  verified_revenue: number | null
  verified_period: string | null
  verified_at: string | null
}

/** Upsert a verified_financials row (service role). */
export async function saveVerifiedFinancial(input: {
  listing_id: string
  agency_id: string
  plaid_item_id?: string | null
  plaid_access_token?: string | null
  institution_name?: string | null
  account_mask?: string | null
  status: 'pending' | 'connected' | 'verified' | 'failed'
  verified_revenue?: number | null
  verified_period?: string | null
}): Promise<{ ok: boolean; error?: string }> {
  if (!svc) return { ok: false, error: 'Database is not configured' }
  const { error } = await svc.from('verified_financials').upsert({
    listing_id: input.listing_id,
    agency_id: input.agency_id,
    plaid_item_id: input.plaid_item_id ?? null,
    plaid_access_token: input.plaid_access_token ?? null,
    institution_name: input.institution_name ?? null,
    account_mask: input.account_mask ?? null,
    status: input.status,
    verified_revenue: input.verified_revenue ?? null,
    verified_period: input.verified_period ?? null,
    verified_at: input.status === 'verified' ? new Date().toISOString() : null,
  }, { onConflict: 'listing_id' })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/** Set the public revenue_verified badge flag on public_listings. */
export async function setRevenueVerifiedFlag(listingId: string, verified: boolean): Promise<{ ok: boolean; error?: string }> {
  if (!svc) return { ok: false, error: 'Database is not configured' }
  const { error } = await svc
    .from('public_listings')
    .update({ revenue_verified: verified })
    .eq('listing_id', listingId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/** Get a listing's verified financial record (server-side). */
export async function getVerifiedFinancial(listingId: string): Promise<VerifiedFinancialRecord | null> {
  if (!svc) return null
  const { data } = await svc.from('verified_financials').select('*').eq('listing_id', listingId).maybeSingle()
  return (data as VerifiedFinancialRecord | null) || null
}

/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { supabase } from '@/lib/supabase/client'
import { authenticatedFetch } from '@/lib/authenticatedFetch'

// ---------------------------------------------------------------------------
// Listings CRUD — configured to the REAL listings schema (probed live):
//   id, agent_id, business_name, headline, industry, location_general,
//   description, asking_price, annual_revenue, sde, ebitda, inventory_value,
//   ffe_value, real_estate_included, reason_for_sale, status, created_at,
//   updated_at, image_urls, primary_image_url, featured_image_url
//   + real-estate option (property_value, square_footage, ..., total_value)
// ---------------------------------------------------------------------------

export interface Listing {
  id: string
  listing_ref?: string | null
  agent_id: string | null
  business_name: string | null
  headline: string | null
  industry: string | null
  sub_industry: string | null
  location_general: string | null
  description: string | null
  asking_price: number | null
  annual_revenue: number | null
  sde: number | null
  ebitda: number | null
  inventory_value: number | null
  ffe_value: number | null
  real_estate_included: boolean | null
  reason_for_sale: string | null
  established_year: number | null
  employees_full_time: number | null
  employees_part_time: number | null
  owner_hours_weekly: number | null
  growth_opportunities: string | null
  competitive_advantages: string | null
  customer_concentration: string | null
  facilities_summary: string | null
  lease_monthly: number | null
  lease_expires_on: string | null
  seller_financing_available: boolean | null
  financing_notes: string | null
  transition_support: string | null
  training_period_weeks: number | null
  confidentiality_level: string | null
  intake_source: string | null
  review_stage: string | null
  compliance_status: string | null
  ai_readiness_score: number | null
  ai_metadata: Record<string, unknown> | null
  approved_by: string | null
  approved_at: string | null
  commission_split_agent: number | null
  commission_split_brokerage: number | null
  status: string | null
  vetted?: boolean | null
  flagged?: boolean | null
  flag_reasons?: string[] | null
  sba_qualified?: boolean | null
  is_off_market?: boolean | null
  published_at?: string | null
  publish_at?: string | null
  created_at?: string | null
  updated_at?: string | null
  image_urls: string[] | null
  primary_image_url: string | null
  featured_image_url: string | null
  // Walkthrough / promo video (YouTube, Vimeo, or direct MP4)
  video_url: string | null
  // Listing contact line (shown publicly for in-market listings) + off-market tier
  contact_phone: string | null
  off_market: boolean | null
  // Real-estate option (see sql/document_compliance_realestate_schema.sql)
  property_value: number | null
  property_description: string | null
  square_footage: number | null
  land_acres: number | null
  year_built: number | null
  property_address: string | null
  property_city: string | null
  property_state: string | null
  property_zip: string | null
  total_value: number | null
}

export type ListingInput = Partial<Omit<Listing, 'id' | 'created_at' | 'updated_at'>>

export const LISTING_STATUSES = ['draft', 'active', 'pending_sale', 'under_contract', 'sold', 'withdrawn']

export async function fetchListings(status?: string): Promise<Listing[]> {
  let query = supabase.from('listings').select('*')
  if (status) query = query.eq('status', status)
  else query = query.neq('status', 'deleted') // trash lives in the Deleted tab only
  const { data, error } = await query.order('created_at', { ascending: false })

  if (error) {
    console.error('fetchListings error:', error)
    throw new Error(error.message || 'Failed to load listings')
  }
  return (data as Listing[]) || []
}

export async function fetchListing(id: string): Promise<Listing | null> {
  const { data, error } = await supabase.from('listings').select('*').eq('id', id).single()
  if (error) {
    console.error('fetchListing error:', error)
    throw new Error(error.message || 'Failed to load listing')
  }
  return (data as Listing) || null
}

export async function createListing(input: ListingInput): Promise<Listing> {
  // listings.agent_id is NOT NULL — always stamp it with the authenticated
  // user's id (auth.uid() at the DB layer maps to the JWT subject). This
  // permanently fixes the "null value in column \"agent_id\"" insert error.
  // Prefer the signed-in user; fall back to an explicit input.agent_id if a
  // caller supplies one (e.g. service-role seeding).
  const { data: { user } } = await supabase.auth.getUser()
  const agentId: string | null = user?.id ?? input.agent_id ?? null

  // Plan-limit gate (2026-09-01 usage overhaul): server-side, authoritative.
  // Blocks over-limit agencies with a clear message + real upgrade path.
  try {
    const { fetchUserAgencyContext } = await import('@/lib/agencies')
    const ctx = await fetchUserAgencyContext()
    if (ctx?.agency?.id) {
      const { usageBlock } = await import('@/lib/usageEnforcement')
      const blocked = await usageBlock(ctx.agency.id, 'listings')
      if (blocked) {
        const err = new Error(blocked.error) as Error & { code?: string; upgradeUrl?: string }
        err.code = 'USAGE_LIMIT'
        err.upgradeUrl = blocked.upgradeUrl
        throw err
      }
    }
  } catch (e: any) {
    if (e?.code === 'USAGE_LIMIT') throw e // rethrow the real block
    // Any context/check failure is non-fatal — never block creation on a
    // helper error (the seller-order route still enforces server-side).
  }

  const { data, error } = await supabase
    .from('listings')
    .insert({ ...input, agent_id: agentId, status: input.status || 'active' })
    .select()
    .single()
  if (error) {
    console.error('createListing error:', error)
    throw new Error(error.message || 'Failed to create listing')
  }
  return data as Listing
}

export async function updateListing(id: string, input: ListingInput): Promise<Listing> {
  const { data, error } = await supabase
    .from('listings')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) {
    console.error('updateListing error:', error)
    throw new Error(error.message || 'Failed to update listing')
  }
  return data as Listing
}

export async function deleteListing(id: string, opts?: { reason?: string; note?: string }): Promise<void> {
  // Server-side delete (service role) — works for agency admins + owners and
  // cleans up gallery storage. Client-side supabase delete was RLS-limited to
  // the listing owner and orphaned storage files. The API requires a Bearer
  // token (authenticateProfileRequest), so auth headers are mandatory. A
  // deletion reason is REQUIRED (400 without one).
  const res = await authenticatedFetch(`/api/listings/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason: opts?.reason || '', note: opts?.note || '' }),
  })
  const data = await res.json().catch(() => ({ ok: false, error: 'Delete failed' }))
  if (!res.ok || !data.ok) {
    throw new Error(data.error || 'Failed to delete listing')
  }
}

/** Restore a trashed (soft-deleted) listing back to its previous status. */
export async function restoreListing(id: string): Promise<void> {
  const res = await authenticatedFetch(`/api/listings/${encodeURIComponent(id)}/restore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })
  const data = await res.json().catch(() => ({ ok: false, error: 'Restore failed' }))
  if (!res.ok || !data.ok) {
    throw new Error(data.error || 'Failed to restore listing')
  }
}

// ---------------------------------------------------------------------------
// Format helpers
// ---------------------------------------------------------------------------
export const fmtMoney = (n: number | null | undefined): string => {
  if (n === null || n === undefined || isNaN(n)) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

export const fmtMoneyCompact = (n: number | null | undefined): string => {
  if (n === null || n === undefined || isNaN(n)) return '—'
  if (Math.abs(n) >= 1_000_000) return '$' + (n / 1_000_000).toFixed(2).replace(/\.00$/, '') + 'M'
  if (Math.abs(n) >= 1_000) return '$' + Math.round(n / 1_000) + 'K'
  return '$' + n
}

export const fmtNum = (n: number | null | undefined): string => {
  if (n === null || n === undefined || isNaN(n)) return '—'
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(n)
}

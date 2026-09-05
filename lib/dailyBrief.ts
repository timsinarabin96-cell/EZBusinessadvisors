/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Daily Brief — "Today at a Glance" for brokers.
// Every morning: new buyer leads, new seller inquiries, NDA signers, listings
// expiring within 7 days, and deal movement — emailed to agency owners/admins.
// Complements the weekly Captain's Brief with a fast daily pulse.
// Server-only, never throws.
// =============================================================================

import { createClient } from '@supabase/supabase-js'
import { notify } from './email'

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const svc =
  SUPABASE_URL && SERVICE_KEY
    ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
    : null

export interface DailyBriefSummary {
  ok: boolean
  agencyId: string
  agencyName: string | null
  recipients: number
  newBuyers: string[]
  newSellers: string[]
  ndaSigners: string[]
  expiring: string[]
  dealMoves: string[]
  error?: string
}

/** Agency owner/admin emails — the brief's audience. */
async function briefRecipients(agencyId: string): Promise<string[]> {
  if (!svc) return []
  const { data: members } = await svc
    .from('agency_members')
    .select('profile_id, is_owner, role')
    .eq('agency_id', agencyId)
  const ids = (members || []).filter((m) => m.is_owner || m.role === 'admin').map((m) => m.profile_id)
  if (!ids.length) return []
  const { data: profiles } = await svc.from('profiles').select('email').in('id', ids)
  return (profiles || []).map((p) => p.email).filter(Boolean)
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Build + email the Daily Brief for one agency. */
export async function generateDailyBrief(agencyId: string): Promise<DailyBriefSummary> {
  if (!svc) return { ok: false, agencyId, agencyName: null, recipients: 0, newBuyers: [], newSellers: [], ndaSigners: [], expiring: [], dealMoves: [], error: 'Database is not configured' }

  const now = new Date()
  const sinceMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  const in7d = new Date(now.getTime() + 7 * 86400000).toISOString()
  const sinceYesterday = new Date(now.getTime() - 24 * 3600000).toISOString()

  const [{ data: agency }, { data: buyers }, { data: sellers }, { data: ndas }, { data: expirations }, { data: deals }] = await Promise.all([
    svc.from('agencies').select('name').eq('id', agencyId).maybeSingle(),
    svc
      .from('buyer_leads')
      .select('full_name, email, desired_business_type, created_at')
      .eq('agency_id', agencyId)
      .gte('created_at', sinceMidnight)
      .order('created_at', { ascending: false })
      .limit(20),
    svc
      .from('seller_leads')
      .select('full_name, business_name, email, created_at')
      .eq('agency_id', agencyId)
      .gte('created_at', sinceMidnight)
      .order('created_at', { ascending: false })
      .limit(20),
    svc
      .from('listing_nda_signatures')
      .select('buyer_name, buyer_email, created_at, listings!inner(agency_id, business_name)')
      .eq('listings.agency_id', agencyId)
      .gte('created_at', sinceMidnight)
      .order('created_at', { ascending: false })
      .limit(20),
    svc
      .from('listing_expirations')
      .select('expires_at, listings(id, business_name)')
      .eq('agency_id', agencyId)
      .eq('status', 'active')
      .lte('expires_at', in7d)
      .limit(20),
    svc
      .from('deals')
      .select('title, status, updated_at')
      .eq('agency_id', agencyId)
      .gte('updated_at', sinceYesterday)
      .order('updated_at', { ascending: false })
      .limit(20),
  ])

  const newBuyers = ((buyers || []) as any[]).map((b) =>
    `<strong>${escapeHtml(b.full_name || 'New buyer')}</strong>${b.desired_business_type ? ` — wants ${escapeHtml(b.desired_business_type)}` : ''}`,
  )

  const newSellers = ((sellers || []) as any[]).map((s) =>
    `<strong>${escapeHtml(s.business_name || s.full_name || 'New seller')}</strong>${s.email ? ` (${escapeHtml(s.email)})` : ''}`,
  )

  const ndaSigners = ((ndas || []) as any[]).map((n) => {
    const listing = n.listings as any
    return `<strong>${escapeHtml(n.buyer_name || 'A buyer')}</strong> signed NDA${listing?.business_name ? ` for ${escapeHtml(listing.business_name)}` : ''}`
  })

  const expiring: string[] = []
  for (const e of (expirations || []) as any[]) {
    const l = e.listings as any
    const daysLeft = Math.max(0, Math.ceil((new Date(e.expires_at).getTime() - now.getTime()) / 86400000))
    expiring.push(`<strong>${escapeHtml(l?.business_name || 'Listing')}</strong> expires ${daysLeft === 0 ? 'today' : `in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`}`)
  }

  const dealMoves = ((deals || []) as any[]).map((d) =>
    `<strong>${escapeHtml(d.title || 'Deal')}</strong> — ${escapeHtml(d.status || 'updated')}`,
  )

  const recipients = await briefRecipients(agencyId)
  if (recipients.length) {
    await notify('daily_brief', recipients.join(','), {
      agencyName: agency?.name || null,
      newBuyers,
      newSellers,
      ndaSigners,
      expiring,
      dealMoves,
      briefUrl: 'https://concorddeal.com/dashboard',
    })
  }

  return {
    ok: true,
    agencyId,
    agencyName: agency?.name || null,
    recipients: recipients.length,
    newBuyers,
    newSellers,
    ndaSigners,
    expiring,
    dealMoves,
  }
}

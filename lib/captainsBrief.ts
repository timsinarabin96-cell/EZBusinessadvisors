/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Captain's Brief — the weekly broker digest.
// Every Monday: deals needing follow-up, expiring listings, hot buyer matches,
// and the commission pipeline — emailed to every agency owner/admin. Brokers
// live in email; this makes the CRM feel alive. Server-only, never throws.
// =============================================================================

import { createClient } from '@supabase/supabase-js'
import { notify } from './email'

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const svc =
  SUPABASE_URL && SERVICE_KEY
    ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
    : null

export interface BriefSummary {
  ok: boolean
  agencyId: string
  agencyName: string | null
  recipients: number
  followUps: string[]
  expiring: string[]
  matches: string[]
  commissions: string[]
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

/** Build + email the Captain's Brief for one agency. */
export async function generateCaptainsBrief(agencyId: string): Promise<BriefSummary> {
  if (!svc) return { ok: false, agencyId, agencyName: null, recipients: 0, followUps: [], expiring: [], matches: [], commissions: [], error: 'Database is not configured' }

  const now = Date.now()
  const in7d = new Date(now + 7 * 86400000).toISOString()
  const in30d = new Date(now + 30 * 86400000).toISOString()
  const staleCutoff = new Date(now - 7 * 86400000).toISOString()

  const [{ data: agency }, { data: deals }, { data: expirations }, { data: commissions }, { data: leads }] = await Promise.all([
    svc.from('agencies').select('name').eq('id', agencyId).maybeSingle(),
    svc
      .from('deals')
      .select('id, title, status, updated_at')
      .eq('agency_id', agencyId)
      .order('updated_at', { ascending: false })
      .limit(100),
    svc
      .from('listing_expirations')
      .select('expires_at, listings(id, business_name)')
      .eq('agency_id', agencyId)
      .eq('status', 'active')
      .lte('expires_at', in30d)
      .limit(50),
    svc
      .from('commission_records')
      .select('amount, status, listings(business_name)')
      .eq('agency_id', agencyId)
      .order('created_at', { ascending: false })
      .limit(100),
    svc
      .from('buyer_leads')
      .select('id, full_name, desired_industry, created_at')
      .eq('agency_id', agencyId)
      .gte('created_at', in7d)
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  const followUps: string[] = []
  for (const d of (deals || [])) {
    const updated = d.updated_at ? new Date(d.updated_at).getTime() : 0
    const stale = updated < new Date(staleCutoff).getTime()
    if (stale && d.status !== 'closed' && d.status !== 'withdrawn') {
      followUps.push(`<strong>${escapeHtml(d.title || 'Deal')}</strong> (${d.status}) — no activity in 7+ days`)
    }
  }

  const expiring: string[] = []
  for (const e of (expirations || [])) {
    const l = (e as any).listings as any
    const name = l?.business_name || 'Listing'
    const expiresAt = new Date(e.expires_at as string)
    const daysLeft = Math.max(0, Math.ceil((expiresAt.getTime() - now) / 86400000))
    expiring.push(`<strong>${escapeHtml(name)}</strong> expires ${daysLeft === 0 ? 'today' : `in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`}`)
  }

  const matches: string[] = []
  for (const l of (leads || []).slice(0, 5)) {
    matches.push(`<strong>${escapeHtml(l.full_name || 'New buyer')}</strong> registered${l.desired_industry ? ` — wants ${escapeHtml(l.desired_industry)}` : ''}`)
  }

  const pipeline: string[] = []
  const byStatus: Record<string, number> = {}
  let pipelineTotal = 0
  for (const c of (commissions || [])) {
    const amt = Number(c.amount) || 0
    pipelineTotal += amt
    const status = c.status || 'pending'
    byStatus[status] = (byStatus[status] || 0) + amt
  }
  if (pipelineTotal > 0) {
    for (const [status, total] of Object.entries(byStatus)) {
      pipeline.push(`<strong>${escapeHtml(status)}</strong>: $${Math.round(total).toLocaleString()}`)
    }
  }

  const recipients = await briefRecipients(agencyId)
  if (recipients.length) {
    await notify('captains_brief', recipients.join(','), {
      agencyName: agency?.name || null,
      followUps,
      expiring,
      matches,
      commissions: pipeline,
      briefUrl: 'https://concord-deal-platform.vercel.app/dashboard',
    })
  }

  return {
    ok: true,
    agencyId,
    agencyName: agency?.name || null,
    recipients: recipients.length,
    followUps,
    expiring,
    matches,
    commissions: pipeline,
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

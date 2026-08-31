/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Follow-Up Autopilot
// -----------------------------------------------------------------------------
// Finds leads with no reply in N days (or never contacted) and lets the agent
// text them on the spot — closing the loop on every captured lead. Server-only.
// Uses the existing communications log for last-contact data; never throws.
// =============================================================================

import { createClient } from '@supabase/supabase-js'
import { lastContactedAt } from './communications'
import { sendSms } from './twilioClient'

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const svc =
  SUPABASE_URL && SERVICE_KEY
    ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
    : null

export interface FollowUpItem {
  kind: 'buyer' | 'seller'
  lead_id: string
  name: string | null
  email: string | null
  phone: string | null
  status: string | null
  last_contacted_at: string | null
  days_since: number
  has_reply: boolean
}

const DEFAULT_FOLLOWUP_DAYS = 3
const REPLY_OUTCOMES = new Set(['talked', 'email_replied', 'meeting_held'])

/**
 * Leads that have been silent for `days` (no inbound reply, and either never
 * contacted or last outbound contact older than the threshold).
 */
export async function findFollowUpLeads(agencyId: string, days = DEFAULT_FOLLOWUP_DAYS): Promise<FollowUpItem[]> {
  if (!svc) return []
  const threshold = Date.now() - days * 86400000
  const items: FollowUpItem[] = []

  const collect = async (rows: any[], kind: 'buyer' | 'seller', nameOf: (r: any) => string | null, key: 'buyerLeadId' | 'sellerLeadId') => {
    for (const row of rows || []) {
      const phone = String(row.phone || '').trim()
      // Only actionable leads: have contact info and aren't dead ends.
      if (!phone && !String(row.email || '').trim()) continue
      if (row.status === 'not_a_fit' || row.status === 'handed_off' || row.status === 'closed') continue

      const last = await lastContactedAt({ [key]: row.id })
      const daysSince = last ? Math.floor((Date.now() - new Date(last).getTime()) / 86400000) : Infinity
      // Skip recently contacted leads.
      if (last && new Date(last).getTime() >= threshold) continue

      // Has there ever been an inbound reply? Check the last few comms.
      let hasReply = false
      if (last) {
        try {
          const { data: recent } = await svc!
            .from('communications')
            .select('direction, outcome')
            .eq(key === 'buyerLeadId' ? 'buyer_lead_id' : 'seller_lead_id', row.id)
            .order('created_at', { ascending: false })
            .limit(10)
          hasReply = (recent || []).some((c: any) => c.direction === 'inbound' || REPLY_OUTCOMES.has(c.outcome))
        } catch { /* ignore */ }
      }

      items.push({
        kind,
        lead_id: row.id,
        name: nameOf(row),
        email: row.email || null,
        phone: phone || null,
        status: row.status || 'new',
        last_contacted_at: last,
        days_since: daysSince,
        has_reply: hasReply,
      })
    }
  }

  const [buyers, sellers] = await Promise.all([
    svc.from('buyer_leads').select('id, full_name, company, email, phone, status').eq('agency_id', agencyId).limit(200),
    svc.from('seller_leads').select('id, full_name, business_name, email, phone, status').eq('agency_id', agencyId).limit(200),
  ])

  await collect(buyers.data || [], 'buyer', (r) => r.full_name || r.company || null, 'buyerLeadId')
  await collect(sellers.data || [], 'seller', (r) => r.business_name || r.full_name || null, 'sellerLeadId')

  items.sort((a, b) => (b.days_since || 0) - (a.days_since || 0))
  return items.slice(0, 50)
}

/** Text a lead a friendly follow-up via the SMS agent and log it. */
export async function sendFollowUpText(
  agencyId: string,
  lead: { kind: 'buyer' | 'seller'; lead_id: string; name: string | null; phone: string | null },
  opts: { profileId?: string | null } = {},
): Promise<{ ok: boolean; error?: string }> {
  if (!svc) return { ok: false, error: 'Database is not configured' }
  if (!lead.phone) return { ok: false, error: 'No phone number on file' }

  const firstName = (lead.name || 'there').split(' ')[0]
  // LICENSING: never hardcode EZ branding — agency name from env (set per
  // licensed broker), else a neutral platform line.
  const outreachAgency = process.env.NEXT_PUBLIC_AGENCY_NAME?.trim() || 'Concord Deal Platform'
  const bodyText =
    `Hi ${firstName}, this is ${process.env.NEXT_PUBLIC_AGENT_NAME || 'your broker'} from ${outreachAgency}. ` +
    `Just checking in — are you still interested in buying or selling a business? ` +
    `Reply and I'll get you what you need.`

  const sms = await sendSms(lead.phone, bodyText)
  if (!sms.ok) return { ok: false, error: sms.error || 'SMS failed' }

  // Log the communication so the timeline + stale scanner stay accurate.
  await svc
    .from('communications')
    .insert({
      agency_id: agencyId,
      profile_id: opts.profileId || null,
      buyer_lead_id: lead.kind === 'buyer' ? lead.lead_id : null,
      seller_lead_id: lead.kind === 'seller' ? lead.lead_id : null,
      channel: 'sms',
      direction: 'outbound',
      outcome: 'other',
      contact_name: lead.name || null,
      summary: `Autopilot follow-up: "${bodyText}"`,
    })
    .select()
    .maybeSingle()

  return { ok: true }
}

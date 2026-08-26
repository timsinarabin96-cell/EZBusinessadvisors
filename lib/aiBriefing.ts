/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// AI Daily Briefing — "what matters today" for brokers.
// -----------------------------------------------------------------------------
// Gathers the day's actionable state per agency:
//   • overdue + due-today tasks (reminders)
//   • deadlines inside 72h (listing expiry, NDA expiry, approval windows)
//   • today's appointments
//   • cold deals (deal_twins health_score low)
// Composes a probability-weighted briefing (DeepSeek polish, deterministic
// fallback) and emails agency owners/admins. Server-only, never throws.
// =============================================================================

import { createClient } from '@supabase/supabase-js'
import { sendEmail } from './email'
import { completeWithDeepSeek } from '@/lib/deepseek/client'

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const svc =
  SUPABASE_URL && SERVICE_KEY
    ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
    : null

export interface BriefingSummary {
  ok: boolean
  agencyId: string
  agencyName: string | null
  recipients: number
  overdue: number
  dueToday: number
  deadlines72h: number
  appointmentsToday: number
  coldDeals: number
  headline: string
  error?: string
}

interface BriefingData {
  agencyName: string | null
  overdue: { title: string; due_at: string }[]
  dueToday: { title: string; due_at: string }[]
  deadlines: { title: string; entity: string; due_at: string }[]
  appointmentsToday: { title: string; starts_at: string; appointment_type: string }[]
  coldDeals: { businessName: string | null; healthScore: number | null; stage: string | null }[]
}

/** Agency owner/admin emails — the briefing's audience (same as daily brief). */
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

export async function fetchBriefingData(agencyId: string): Promise<BriefingData> {
  if (!svc) return { agencyName: null, overdue: [], dueToday: [], deadlines: [], appointmentsToday: [], coldDeals: [] }
  const now = new Date()
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const endOfDay = new Date(startOfDay.getTime() + 86400000)
  const in72h = new Date(now.getTime() + 72 * 3600000).toISOString()
  const isoNow = now.toISOString()

  const [{ data: agency }, { data: reminders }, { data: expirations }, { data: ndas }, { data: approvals }, { data: appointments }, { data: twins }] = await Promise.all([
    svc.from('agencies').select('name').eq('id', agencyId).maybeSingle(),
    svc.from('reminders').select('title, due_at, status').eq('agency_id', agencyId).eq('status', 'pending'),
    svc.from('listing_expirations').select('expires_at, listings(business_name)').eq('agency_id', agencyId).eq('status', 'active').gte('expires_at', isoNow).lte('expires_at', in72h),
    svc.from('nda_requests').select('nda_expires_at, listings(business_name)').not('nda_expires_at', 'is', null).gte('nda_expires_at', isoNow).lte('nda_expires_at', in72h),
    svc.from('public_listings').select('approval_expires_at, listings(business_name)').not('approval_expires_at', 'is', null).gte('approval_expires_at', isoNow).lte('approval_expires_at', in72h),
    svc.from('appointments').select('title, starts_at, appointment_type').eq('agency_id', agencyId).gte('starts_at', startOfDay.toISOString()).lt('starts_at', endOfDay.toISOString()),
    svc.from('deal_twins').select('listing_id, health_score, stage').eq('agency_id', agencyId).order('health_score', { ascending: true }).limit(5),
  ])

  const overdue: { title: string; due_at: string }[] = []
  const dueToday: { title: string; due_at: string }[] = []
  for (const r of (reminders || []) as any[]) {
    const due = new Date(r.due_at)
    if (due < now) overdue.push({ title: r.title, due_at: r.due_at })
    else if (due < endOfDay) dueToday.push({ title: r.title, due_at: r.due_at })
  }

  const deadlines: BriefingData['deadlines'] = []
  for (const e of (expirations || []) as any[]) deadlines.push({ title: 'Listing expires', entity: e.listings?.business_name || 'Listing', due_at: e.expires_at })
  for (const n of (ndas || []) as any[]) deadlines.push({ title: 'NDA expires', entity: n.listings?.business_name || 'NDA', due_at: n.nda_expires_at })
  for (const a of (approvals || []) as any[]) deadlines.push({ title: 'Seller approval expires', entity: a.listings?.business_name || 'Listing', due_at: a.approval_expires_at })

  // Cold deals: health_score below 45 or lowest 5.
  const coldDeals: BriefingData['coldDeals'] = []
  for (const t of (twins || []) as any[]) {
    if (typeof t.health_score === 'number' && t.health_score < 45) {
      const { data: listing } = await svc.from('listings').select('business_name').eq('id', t.listing_id).maybeSingle()
      coldDeals.push({ businessName: listing?.business_name || null, healthScore: t.health_score, stage: t.stage || null })
    }
  }

  return {
    agencyName: agency?.name || null,
    overdue,
    dueToday,
    deadlines,
    appointmentsToday: (appointments || []) as BriefingData['appointmentsToday'],
    coldDeals,
  }
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

/** Deterministic headline + body (AI polish applied on top when available). */
export function composeBriefing(data: BriefingData): { headline: string; body: string } {
  const parts: string[] = []
  if (data.overdue.length) parts.push(`${data.overdue.length} overdue task${data.overdue.length === 1 ? '' : 's'}`)
  if (data.dueToday.length) parts.push(`${data.dueToday.length} due today`)
  if (data.deadlines.length) parts.push(`${data.deadlines.length} deadline${data.deadlines.length === 1 ? '' : 's'} in 72h`)
  if (data.appointmentsToday.length) parts.push(`${data.appointmentsToday.length} meeting${data.appointmentsToday.length === 1 ? '' : 's'} today`)
  if (data.coldDeals.length) parts.push(`${data.coldDeals.length} deal${data.coldDeals.length === 1 ? '' : 's'} going cold`)
  const headline = parts.length
    ? `Today: ${parts.join(' · ')}`
    : 'Today: nothing urgent — a good day to hunt new listings'

  let body = `<p style="font-family:Georgia,serif;color:#333;font-size:15px;line-height:1.6">Good morning${data.agencyName ? `, ${data.agencyName}` : ''}. Here's what needs you today:</p>`
  if (data.overdue.length) {
    body += `<p><b style="color:#b00020">⚠️ Overdue (${data.overdue.length})</b></p><ul style="color:#444;font-size:14px">${data.overdue.slice(0, 6).map((t) => `<li>${t.title} <span style="color:#999">· due ${fmtTime(t.due_at)}</span></li>`).join('')}</ul>`
  }
  if (data.dueToday.length) {
    body += `<p><b style="color:#b45309">⏰ Due today (${data.dueToday.length})</b></p><ul style="color:#444;font-size:14px">${data.dueToday.slice(0, 6).map((t) => `<li>${t.title} <span style="color:#999">· ${fmtTime(t.due_at)}</span></li>`).join('')}</ul>`
  }
  if (data.deadlines.length) {
    body += `<p><b style="color:#0e7490">⏳ Deadlines in 72h (${data.deadlines.length})</b></p><ul style="color:#444;font-size:14px">${data.deadlines.slice(0, 6).map((d) => `<li>${d.title} — ${d.entity} <span style="color:#999">· ${fmtTime(d.due_at)}</span></li>`).join('')}</ul>`
  }
  if (data.appointmentsToday.length) {
    body += `<p><b style="color:#102a43">🗓 Today's meetings (${data.appointmentsToday.length})</b></p><ul style="color:#444;font-size:14px">${data.appointmentsToday.slice(0, 6).map((a) => `<li>${a.title} <span style="color:#999">· ${fmtTime(a.starts_at)}</span></li>`).join('')}</ul>`
  }
  if (data.coldDeals.length) {
    body += `<p><b style="color:#b00020">🧊 Deals going cold (${data.coldDeals.length})</b></p><ul style="color:#444;font-size:14px">${data.coldDeals.map((d) => `<li>${d.businessName || 'Confidential deal'} — health ${d.healthScore}/100</li>`).join('')}</ul>`
  }
  if (!data.overdue.length && !data.dueToday.length && !data.deadlines.length && !data.appointmentsToday.length && !data.coldDeals.length) {
    body += `<p style="color:#666;font-size:14px">Nothing pressing. Use the calm to prospect new sellers or follow up on warm leads.</p>`
  }
  return { headline, body }
}

/** Optional DeepSeek polish of the headline (never blocks the email). */
async function polishHeadline(data: BriefingData, fallback: string): Promise<string> {
  try {
    const summary = `${data.overdue.length} overdue, ${data.dueToday.length} due today, ${data.deadlines.length} deadlines in 72h, ${data.appointmentsToday.length} meetings, ${data.coldDeals.length} cold deals`
    const result = await completeWithDeepSeek({
      message: `Write ONE short email subject line for a business broker's daily briefing. Data: ${summary}. Keep it under 70 chars, no quotes.`,
      context: { kind: 'support', text: '' },
      system: 'You write crisp, actionable email subject lines.',
      jsonMode: false,
      maxTokens: 60,
    })
    const text = (result.text || '').trim().replace(/^["']|["']$/g, '')
    return text || fallback
  } catch {
    return fallback
  }
}

/** Build + email the AI Daily Briefing for one agency. Never throws. */
export async function generateAiBriefing(agencyId: string): Promise<BriefingSummary> {
  if (!svc) {
    return { ok: false, agencyId, agencyName: null, recipients: 0, overdue: 0, dueToday: 0, deadlines72h: 0, appointmentsToday: 0, coldDeals: 0, headline: '', error: 'Database is not configured' }
  }
  try {
    const data = await fetchBriefingData(agencyId)
    const { headline, body } = composeBriefing(data)
    const polished = await polishHeadline(data, headline)
    const recipients = await briefRecipients(agencyId)
    const subject = `${polished} — Concord Daily Briefing`

    for (const email of recipients) {
      await sendEmail({
        to: email,
        subject,
        html: `<div style="max-width:560px;margin:0 auto;padding:24px;background:#fff">${body}<p style="margin-top:24px;padding-top:14px;border-top:1px solid #eee;font-size:11px;color:#999">Generated by Concord Deal Platform · AI-assisted briefing</p></div>`,
        kind: 'daily_brief',
        meta: { agencyId, counts: { overdue: data.overdue.length, dueToday: data.dueToday.length, deadlines72h: data.deadlines.length, appointmentsToday: data.appointmentsToday.length, coldDeals: data.coldDeals.length } },
      })
    }

    return {
      ok: true,
      agencyId,
      agencyName: data.agencyName,
      recipients: recipients.length,
      overdue: data.overdue.length,
      dueToday: data.dueToday.length,
      deadlines72h: data.deadlines.length,
      appointmentsToday: data.appointmentsToday.length,
      coldDeals: data.coldDeals.length,
      headline: polished,
    }
  } catch (error) {
    return {
      ok: false,
      agencyId,
      agencyName: null,
      recipients: 0,
      overdue: 0,
      dueToday: 0,
      deadlines72h: 0,
      appointmentsToday: 0,
      coldDeals: 0,
      headline: '',
      error: error instanceof Error ? error.message : 'briefing generation failed',
    }
  }
}

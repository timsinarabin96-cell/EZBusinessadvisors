/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email'

export const runtime = 'nodejs'

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const BOSS_EMAIL = process.env.VOICE_AGENT_BROKER_EMAIL || 'info@ezbusinessadvisors.com'

/**
 * POST /api/cron/money-digest — the boss's daily "money printer" report.
 * Protected by x-cron-secret. One email: revenue, activity, health, alerts.
 * Returns the digest JSON too (for OpenClaw/Telegram announce).
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('x-cron-secret')
  if (secret && auth !== secret) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  }
  const svc = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const money = (n: number | null | undefined) => (n ? '$' + Math.round(n).toLocaleString() : '$0')

  // ── Revenue (last 24h + all-time) ─────────────────────────────────────────
  const [orders, valReports, invoices, subs, featured] = await Promise.all([
    svc.from('seller_listing_orders').select('amount_cents, status').gte('created_at', since),
    svc.from('valuation_reports').select('amount_cents, status').gte('created_at', since),
    svc.from('invoices').select('amount, status').gte('created_at', since),
    svc.from('subscriptions').select('tier, status').gte('created_at', since),
    svc.from('featured_slots').select('price_cents, status').gte('created_at', since),
  ])
  const sum = (rows: any[], field: string, paidOnly = true) =>
    (rows || []).filter((r: any) => !paidOnly || r.status === 'paid' || r.status === 'active').reduce((a: number, r: any) => a + (Number(r[field]) || 0), 0)
  const revenue24h = sum(orders.data, 'amount_cents') + sum(valReports.data, 'amount_cents') + sum(invoices.data, 'amount') * 100 + sum(featured.data, 'price_cents')
  const paidOrders24h = (orders.data || []).filter((r: any) => r.status === 'paid').length
  const paidVals24h = (valReports.data || []).filter((r: any) => r.status === 'paid' || r.status === 'ready').length
  const newSubs24h = (subs.data || []).length
  const activeSubs = await svc.from('subscriptions').select('id', { count: 'exact', head: true }).in('status', ['active', 'trialing'])

  // ── Activity (last 24h) ───────────────────────────────────────────────────
  const [newListings, inquiries, intakes] = await Promise.all([
    svc.from('listings').select('id', { count: 'exact', head: true }).gte('created_at', since),
    svc.from('leads').select('id', { count: 'exact', head: true }).eq('kind', 'buyer').gte('created_at', since),
    svc.from('seller_leads').select('id', { count: 'exact', head: true }).gte('created_at', since),
  ])
  let ndaCount = 0
  try {
    const { count } = await svc.from('nda_signatures').select('id', { count: 'exact', head: true }).gte('signed_at', since)
    ndaCount = count || 0
  } catch {
    ndaCount = 0
  }

  // ── Alerts: trials expiring in 7 days, listings expiring in 7 days ────────
  const week = new Date(Date.now() + 7 * 86400000).toISOString()
  const [expTrials] = await Promise.all([
    svc.from('subscriptions').select('profile_id').eq('status', 'trialing').lte('trial_end', week),
  ])
  let expListingsCount = 0
  try {
    const { data } = await svc.from('listings').select('id').eq('status', 'active').lte('expires_at', week)
    expListingsCount = (data || []).length
  } catch {
    expListingsCount = 0
  }

  // ── Health flags ──────────────────────────────────────────────────────────
  const health: string[] = []
  if ((expTrials.data || []).length) health.push(`⏳ ${expTrials.data!.length} trial(s) expiring within 7 days — convert them`)
  if (expListingsCount) health.push(`📅 ${expListingsCount} listing(s) expiring within 7 days — renewals due`)

  const lines = [
    `📈 MONEY DIGEST — ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`,
    '',
    `💰 Revenue (24h): ${money(revenue24h)}`,
    `   • Paid listing orders: ${paidOrders24h}`,
    `   • Paid valuations/BOVs: ${paidVals24h}`,
    `   • New subscriptions: ${newSubs24h} (${activeSubs.count || 0} active/trialing total)`,
    '',
    `📊 Activity (24h):`,
    `   • New listings: ${newListings.count || 0}`,
    `   • Buyer inquiries: ${inquiries.count || 0}`,
    `   • Seller intakes: ${intakes.count || 0}`,
    `   • NDA signatures: ${ndaCount}`,
    '',
    ...(health.length ? ['🚨 ALERTS:', ...health, ''] : ['✅ No alerts. All systems nominal.', '']),
    '— Concord Deal Platform (automated daily report)',
  ].join('\n')

  await sendEmail({
    to: BOSS_EMAIL,
    subject: `📈 Money Digest — ${money(revenue24h)} in 24h${health.length ? ' ⚠️ ' + health.length + ' alert(s)' : ''}`,
    html: lines.replace(/\n/g, '<br/>'),
  }).catch(() => {})

  return NextResponse.json({ ok: true, revenue24h, paidOrders24h, paidVals24h, newSubs24h, activeSubs: activeSubs.count || 0, newListings: newListings.count || 0, inquiries: inquiries.count || 0, intakes: intakes.count || 0, ndaSigns: ndaCount, health })
}

/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const BOSS_EMAIL = process.env.VOICE_AGENT_BROKER_EMAIL || process.env.ADMIN_EMAIL || 'rtimsina@ezbusinessadvisors.com'

// =============================================================================
// POST /api/cron/hourly-digest — ONE email per hour with FULL details.
// -----------------------------------------------------------------------------
// Every hour (on the hour) this builds a complete picture of the last 60
// minutes across the whole platform and emails the broker:
//   • New listings (created, published, edited)
//   • Buyer activity (new leads, NDA signings, inquiries, matches)
//   • Seller activity (new seller intakes / orders)
//   • Deal movement (new deals, offers, LOIs, stage changes)
//   • Bookings & calls (new appointments, call sessions)
//   • Money (new commissions, paid orders, revenue)
//   • Email queue status (sent / failed / queued counts)
// This REPLACES the noisy per-event emails — one digest, full detail.
// =============================================================================

const fmt$ = (n: number | null | undefined) => (n ? '$' + Math.round(n).toLocaleString() : '$0')
const fmtTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'

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
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString()

  // ── Collect everything from the last hour ────────────────────────────────
  const [newListings, publishedListings, editedListings, buyerLeads, ndaSignings, ndaRequests, sellerOrders, newDeals, newOffers, newLois, appointments, callSessions, commissions, revenue] = await Promise.all([
    svc.from('listings').select('id, business_name, status, asking_price, created_at').gte('created_at', since).order('created_at', { ascending: false }).limit(50),
    svc.from('listings').select('id, business_name, status, updated_at').gte('updated_at', since).eq('status', 'active').limit(50),
    svc.from('listings').select('id, business_name, status, updated_at').gte('updated_at', since).order('updated_at', { ascending: false }).limit(50),
    svc.from('buyer_leads').select('id, full_name, company, target_industry, budget_range, created_at').gte('created_at', since).order('created_at', { ascending: false }).limit(50),
    svc.from('listing_nda_signatures').select('id, buyer_name, buyer_email, listing_id, signed_at, listings(business_name)').gte('signed_at', since).limit(50),
    svc.from('data_room_access_requests').select('id, requester_email, status, listing_id, nda_signed_at, listings(business_name)').gte('nda_signed_at', since).limit(50),
    svc.from('seller_listing_orders').select('id, created_at, business_name, status, amount_cents').gte('created_at', since).limit(50),
    svc.from('deals').select('id, title, status, created_at, updated_at').gte('created_at', since).limit(50),
    svc.from('deal_offers').select('id, listing_id, purchase_price, status, created_at, listings(business_name)').gte('created_at', since).limit(50),
    svc.from('letters_of_intent').select('id, status, created_at, listings(business_name)').gte('created_at', since).limit(50),
    svc.from('appointments').select('id, title, appointment_type, starts_at, created_at').gte('created_at', since).limit(50),
    svc.from('call_sessions').select('id, purpose, status, started_at').gte('started_at', since).limit(50),
    svc.from('commission_records').select('amount, status, created_at').gte('created_at', since).limit(50),
    svc.from('seller_listing_orders').select('amount_cents, status').gte('created_at', since),
  ])

  const rows = (d: any) => (d?.data || [])
  const totalRevenue = (revenue?.data || []).filter((r: any) => r.status === 'paid' || r.status === 'active').reduce((a: number, r: any) => a + (Number(r.amount_cents) || 0), 0)

  // ── Build the digest body ────────────────────────────────────────────────
  const parts: string[] = []

  if (rows(newListings).length) {
    parts.push(`<h3>🆕 New Listings (${rows(newListings).length})</h3><ul>` +
      rows(newListings).map((l: any) => `<li><b>${l.business_name}</b> — ${l.status} · ${l.asking_price ? fmt$(l.asking_price) : 'Ask'} · ${fmtTime(l.created_at)}</li>`).join('') + '</ul>')
  }
  if (rows(publishedListings).length) {
    parts.push(`<h3>🚀 Published (${rows(publishedListings).length})</h3><ul>` +
      rows(publishedListings).map((l: any) => `<li><b>${l.business_name}</b> — ${fmtTime(l.updated_at)}</li>`).join('') + '</ul>')
  }
  if (rows(editedListings).length) {
    parts.push(`<h3>✏️ Edited (${rows(editedListings).length})</h3><ul>` +
      rows(editedListings).map((l: any) => `<li><b>${l.business_name}</b> — ${l.status} · ${fmtTime(l.updated_at)}</li>`).join('') + '</ul>')
  }
  if (rows(buyerLeads).length) {
    parts.push(`<h3>🎯 New Buyer Leads (${rows(buyerLeads).length})</h3><ul>` +
      rows(buyerLeads).map((l: any) => `<li><b>${l.full_name || 'Anonymous'}</b>${l.company ? ` · ${l.company}` : ''}${l.target_industry ? ` · ${l.target_industry}` : ''}${l.budget_range ? ` · ${l.budget_range}` : ''} — ${fmtTime(l.created_at)}</li>`).join('') + '</ul>')
  }
  if (rows(ndaSignings).length) {
    parts.push(`<h3>✍️ NDA Signed (${rows(ndaSignings).length})</h3><ul>` +
      rows(ndaSignings).map((n: any) => `<li><b>${n.buyer_name || 'Buyer'}</b> on ${n.listings?.business_name || 'a listing'} — ${fmtTime(n.signed_at)}</li>`).join('') + '</ul>')
  }
  if (rows(ndaRequests).length) {
    parts.push(`<h3>🛡️ NDA Requests (${rows(ndaRequests).length})</h3><ul>` +
      rows(ndaRequests).map((n: any) => `<li><b>${n.requester_email || 'Buyer'}</b> → ${n.listings?.business_name || 'listing'} (${n.status}) — ${fmtTime(n.nda_signed_at)}</li>`).join('') + '</ul>')
  }
  if (rows(sellerOrders).length) {
    parts.push(`<h3>🏷️ New Seller Intakes (${rows(sellerOrders).length})</h3><ul>` +
      rows(sellerOrders).map((s: any) => `<li><b>${s.business_name}</b> — ${s.status} · ${s.amount_cents ? fmt$(s.amount_cents / 100) : '—'} · ${fmtTime(s.created_at)}</li>`).join('') + '</ul>')
  }
  if (rows(newDeals).length) {
    parts.push(`<h3>🤝 New Deals (${rows(newDeals).length})</h3><ul>` +
      rows(newDeals).map((d: any) => `<li><b>${d.title}</b> — ${d.status} · ${fmtTime(d.created_at)}</li>`).join('') + '</ul>')
  }
  if (rows(newOffers).length) {
    parts.push(`<h3>🧪 Offers (${rows(newOffers).length})</h3><ul>` +
      rows(newOffers).map((o: any) => `<li>${o.listings?.business_name || 'Listing'} — ${o.purchase_price ? fmt$(o.purchase_price) : '—'} · ${o.status} · ${fmtTime(o.created_at)}</li>`).join('') + '</ul>')
  }
  if (rows(newLois).length) {
    parts.push(`<h3>📝 LOIs (${rows(newLois).length})</h3><ul>` +
      rows(newLois).map((l: any) => `<li>${l.listings?.business_name || 'Listing'} — ${l.status} · ${fmtTime(l.created_at)}</li>`).join('') + '</ul>')
  }
  if (rows(appointments).length) {
    parts.push(`<h3>📅 Appointments (${rows(appointments).length})</h3><ul>` +
      rows(appointments).map((a: any) => `<li><b>${a.title}</b> (${a.appointment_type}) — ${fmtTime(a.starts_at)}</li>`).join('') + '</ul>')
  }
  if (rows(callSessions).length) {
    parts.push(`<h3>📞 Call Sessions (${rows(callSessions).length})</h3><ul>` +
      rows(callSessions).map((c: any) => `<li>${c.purpose} — ${c.status} · ${fmtTime(c.started_at)}</li>`).join('') + '</ul>')
  }
  if (rows(commissions).length) {
    parts.push(`<h3>💰 Commissions (${rows(commissions).length})</h3><ul>` +
      rows(commissions).map((c: any) => `<li>${fmt$(c.amount)} — ${c.status} · ${fmtTime(c.created_at)}</li>`).join('') + '</ul>')
  }

  const summary = `New listings: ${rows(newListings).length} · Published: ${rows(publishedListings).length} · Buyer leads: ${rows(buyerLeads).length} · NDA signings: ${rows(ndaSignings).length} · Seller intakes: ${rows(sellerOrders).length} · Deals: ${rows(newDeals).length} · Revenue (paid): ${fmt$(totalRevenue / 100)}`

  const body = parts.length
    ? parts.join('')
    : '<p style="color:#888">No activity in the last hour. All quiet. ✅</p>'

  const html = `<!doctype html><html><body style="font-family:Georgia,serif;color:#1a1a2e;max-width:720px;margin:0 auto;padding:24px">
    <div style="border-bottom:3px solid #c9a84c;padding-bottom:12px;margin-bottom:18px">
      <div style="font-size:22px;font-weight:800">📊 Hourly Digest</div>
      <div style="color:#888;font-size:13px;margin-top:4px">${new Date().toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })} — everything that happened in the last 60 minutes</div>
    </div>
    <div style="background:#faf9f4;border:1px solid #ece8dc;border-radius:10px;padding:14px 18px;margin-bottom:18px;font-size:13.5px;line-height:1.7">${summary}</div>
    ${body}
    <div style="margin-top:24px;padding-top:12px;border-top:1px solid #ece8dc;color:#aaa;font-size:11.5px">Generated by Concord Deal Platform · Hourly digest · You receive this once per hour by design.</div>
  </body></html>`

  const { sendEmail } = await import('@/lib/email')
  const result = await sendEmail({ to: BOSS_EMAIL, subject: `📊 Hourly Digest — ${rows(newListings).length} new, ${rows(buyerLeads).length} leads, ${rows(ndaSignings).length} NDAs`, html, kind: 'daily_brief' as any, meta: { hourly: true, generatedAt: new Date().toISOString() } })

  return NextResponse.json({ ok: true, to: BOSS_EMAIL, delivered: result.ok, queued: result.queued, summary })
}

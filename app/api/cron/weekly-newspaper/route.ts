/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { renderNewspaperHtml, nowLabel } from '@/lib/newspaperShared'

export const runtime = 'nodejs'

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''

// =============================================================================
// POST /api/cron/weekly-newspaper — automatic weekly buyer newsletter.
// -----------------------------------------------------------------------------
// Runs every Monday 8 AM ET (0 12 * * 1 UTC, DST-adjusted by Vercel's clock in
// the same way the other crons are). Mirrors the Transworld weekly: builds a
// fresh edition from live platform data (auto-generated articles), publishes
// it, then emails every active subscriber the exact same branded HTML the
// manual "📮 Email subscribers" button sends.
// =============================================================================

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('x-cron-secret') || (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (secret && auth !== secret) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  }
  const svc = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

  // ── 1. Create draft edition ────────────────────────────────────────────────
  const { data: edition, error: createErr } = await svc
    .from('newspaper_editions')
    .insert({ title: 'Concord Weekly', issue_label: nowLabel(), status: 'draft' })
    .select()
    .single()
  if (createErr || !edition) {
    return NextResponse.json({ ok: false, error: `edition create failed: ${createErr?.message || 'no row'}` }, { status: 500 })
  }

  // ── 2. Auto-generate articles from live data ───────────────────────────────
  await autoGenerateArticles(svc, edition.id)

  // ── 3. Publish ─────────────────────────────────────────────────────────────
  const { error: pubErr } = await svc
    .from('newspaper_editions')
    .update({ status: 'published', published_at: new Date().toISOString() })
    .eq('id', edition.id)
  if (pubErr) {
    return NextResponse.json({ ok: false, error: `publish failed: ${pubErr.message}` }, { status: 500 })
  }

  // ── 4. Email all active subscribers (same format as manual publish) ────────
  const { data: articles } = await svc.from('newspaper_articles').select('*').eq('edition_id', edition.id).order('sort_order', { ascending: true })
  const { data: subs } = await svc.from('newspaper_subscriptions').select('*').eq('status', 'active')

  const html = renderNewspaperHtml(edition, (articles || []) as any)
  const subject = `Concord Weekly — ${edition.issue_label || ''}`

  let sent = 0, failed = 0
  for (const sub of (subs || [])) {
    const emailHtml = welcomeTop(sub) + html
    const text = (articles || [])
      .map((a) => `${a.section}: ${a.headline}\n${(a.body || '').replace(/\n/g, ' ')}`)
      .join('\n\n')
    const { error } = await svc.from('email_emails').insert({
      email_to: sub.email,
      subject,
      html: emailHtml,
      text,
      kind: 'newspaper_weekly',
      meta: { edition_id: edition.id, auto: true },
      status: 'queued',
    })
    if (error) { failed++; continue }
    await svc.from('newspaper_delivery_log').insert({ edition_id: edition.id, email: sub.email, status: 'sent' })
    sent++
  }

  return NextResponse.json({
    ok: true,
    edition_id: edition.id,
    issue: edition.issue_label,
    sent,
    failed,
    total: (subs || []).length,
    note: 'weekly auto-newspaper (Mon 8 AM ET)',
  })
}

/** Mirror of lib autoGenerateArticles but with a service-role client so the
 *  cron can read real data regardless of RLS/anonymous visibility. */
async function autoGenerateArticles(svc: any, editionId: string): Promise<boolean> {
  try {
    const [listingsRes, dealsRes, sellerRes, buyerRes] = await Promise.all([
      svc.from('listings').select('business_name, industry, asking_price, status, created_at').eq('status', 'active').order('created_at', { ascending: false }).limit(6),
      svc.from('deals').select('title, status, purchase_price, created_at').or('status.eq.closed').order('updated_at', { ascending: false }).limit(6),
      svc.from('seller_leads').select('business_name, industry, status, created_at').order('created_at', { ascending: false }).limit(6),
      svc.from('buyer_leads').select('contact_name, industry_interest, status, created_at').order('created_at', { ascending: false }).limit(6),
    ])
    const listings = (listingsRes?.data || []) as any[]
    const deals = (dealsRes?.data || []) as any[]
    const sellers = (sellerRes?.data || []) as any[]
    const buyers = (buyerRes?.data || []) as any[]

    const articles: any[] = []
    let order = 10

    articles.push({
      section: 'Market News',
      headline: nowLabel(),
      body:
        `This week we welcomed ${listings.length} featured listing${listings.length === 1 ? '' : 's'}, ` +
        `closed ${deals.length} deal${deals.length === 1 ? '' : 's'}, and added ${sellers.length + buyers.length} new ` +
        `lead${sellers.length + buyers.length === 1 ? '' : 's'} to our pipeline. The business sale market remains active ` +
        `across our coverage area — reach out to discuss your exit or acquisition goals.`,
      sort_order: order,
    })
    order += 10

    if (listings.length) {
      articles.push({
        section: 'Featured Listings',
        headline: 'New businesses for sale this week',
        body: listings.map((l, i) => `${i + 1}. ${l.business_name || 'Business'}${l.industry ? ' — ' + l.industry : ''}${l.asking_price ? ' · $' + Math.round(l.asking_price).toLocaleString() : ''}`).join('\n'),
        sort_order: order,
      })
      order += 10
    }

    if (deals.length) {
      articles.push({
        section: 'Deals Closed',
        headline: 'Recent closings',
        body: deals.map((d, i) => `${i + 1}. ${d.title || 'Deal'}${d.purchase_price ? ' · $' + Math.round(d.purchase_price).toLocaleString() : ''} (${d.status})`).join('\n'),
        sort_order: order,
      })
      order += 10
    }

    if (sellers.length + buyers.length) {
      const leadLines = [
        ...sellers.map((l: any) => `Seller: ${l.business_name || 'Unnamed'}${l.industry ? ' (' + l.industry + ')' : ''}${l.status ? ' — ' + l.status : ''}`),
        ...buyers.map((l: any) => `Buyer: ${l.contact_name || 'Unnamed'}${l.industry_interest ? ' looking for ' + l.industry_interest : ''}`),
      ]
      articles.push({
        section: 'New Leads',
        headline: 'New leads this week',
        body: leadLines.join('\n'),
        sort_order: order,
      })
      order += 10
    }

    articles.push({
      section: 'Team Updates',
      headline: 'From the team',
      body: 'Our advisors continue to guide clients through confidential listings, valuations, and due diligence. Contact your advisor to schedule a free consult.',
      sort_order: order,
    })

    for (const a of articles) {
      await svc.from('newspaper_articles').insert({ ...a, edition_id: editionId })
    }
    return true
  } catch {
    return false
  }
}

function welcomeTop(sub: any): string {
  const name = sub?.name || sub?.email?.split('@')[0] || 'there'
  return `<p style="font-size:13px;color:#6a6a7a;margin:0 0 12px">Hi ${esc(name)}, here's your weekly briefing from the CONCORD Deal Platform.</p>`
}
function esc(s: string): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))
}

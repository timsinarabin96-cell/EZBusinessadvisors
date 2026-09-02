/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { nowLabel } from '@/lib/newspaperShared'
import { buildV3Articles, renderNewspaperV3Html } from '@/lib/newspaperV3'

export const runtime = 'nodejs'

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''

// =============================================================================
// POST /api/cron/weekly-newspaper — automatic weekly BUYERS-ONLY newsletter.
// -----------------------------------------------------------------------------
// Runs every Monday 8 AM ET. Builds a fresh edition from live marketplace
// inventory (v3: premium Transworld-style digest — photos, prices, agent
// contact cards), publishes it, then emails ONLY active subscribers whose
// audience = 'buyer'. Sellers, internal staff, and agents are never mailed.
// No lead disclosure: article generation never touches seller_leads or
// buyer_leads, and no buyer/seller names ever appear in the output.
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

  // ── 2. Auto-generate articles from live inventory (no leads, no identities) ─
  const generated = await buildV3Articles(svc)
  for (const a of generated) {
    await svc.from('newspaper_articles').insert({
      edition_id: edition.id,
      section: a.section,
      headline: a.headline,
      body: a.body,
      image_url: a.image_url || null,
      sort_order: a.sort_order,
      meta: a.meta || null,
    })
  }

  // ── 3. Publish ─────────────────────────────────────────────────────────────
  const { error: pubErr } = await svc
    .from('newspaper_editions')
    .update({ status: 'published', published_at: new Date().toISOString() })
    .eq('id', edition.id)
  if (pubErr) {
    return NextResponse.json({ ok: false, error: `publish failed: ${pubErr.message}` }, { status: 500 })
  }

  // ── 4. Email BUYER-ONLY active subscribers ──────────────────────────────────
  const { data: articles } = await svc.from('newspaper_articles').select('*').eq('edition_id', edition.id).order('sort_order', { ascending: true })
  const { data: subs } = await svc.from('newspaper_subscriptions').select('*').eq('status', 'active').eq('audience', 'buyer')

  const subject = `Concord Weekly — ${edition.issue_label || ''}`

  let sent = 0, failed = 0
  for (const sub of (subs || [])) {
    // Guarantee a persisted unsubscribe token BEFORE rendering: legacy rows
    // created before the token system had NULL tokens, which produced emails
    // with empty unsubscribe links. Backfill + persist so the link always
    // matches what the unsubscribe route validates against.
    let token = sub.token
    if (!token) {
      token = makeUnsubToken(sub.email)
      await svc.from('newspaper_subscriptions').update({ token }).eq('id', sub.id).then(() => undefined)
    }
    const emailHtml = renderNewspaperV3Html(edition as any, (articles || []) as any, { ...sub, token } as any)
    const text = (articles || [])
      .map((a: any) => `${a.section}: ${a.headline}\n${(a.body || '').replace(/\n/g, ' ')}`)
      .join('\n\n')
    const { error } = await svc.from('email_emails').insert({
      email_to: sub.email,
      subject,
      html: emailHtml,
      text,
      kind: 'newspaper_weekly',
      meta: { edition_id: edition.id, auto: true, audience: 'buyer' },
      status: 'queued',
    })
    if (error) { failed++; continue }
    await svc.from('newspaper_delivery_log').insert({ edition_id: edition.id, email: sub.email, status: 'sent', audience: 'buyer' })
    sent++
  }

  return NextResponse.json({
    ok: true,
    edition_id: edition.id,
    issue: edition.issue_label,
    sent,
    failed,
    total: (subs || []).length,
    note: 'weekly auto-newspaper (Mon 8 AM ET) — buyer audience only',
  })
}

/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { renderNewspaperV3Html } from '@/lib/newspaperV3'
import { authenticateProfileRequest, forbiddenResponse, unauthorizedResponse } from '@/lib/supabase/auth'

// ---------------------------------------------------------------------------
// POST /api/newspaper/publish — distributes a published edition to all active
// subscribers. Runs server-side with the service role so the email queue rows
// (email_emails) are inserted even though subscribers are external (no
// Supabase session) and the smtp send is attempted by the worker.
// ---------------------------------------------------------------------------

export const runtime = 'nodejs'

const SVC = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY || 'NO_KEY', {
      auth: { persistSession: false },
    })
  : null

export async function POST(req: NextRequest) {
  if (!SVC) return NextResponse.json({ ok: false, error: 'server not configured' }, { status: 503 })
  const authenticated = await authenticateProfileRequest(req)
  if (!authenticated) return unauthorizedResponse()
  if (!authenticated.memberships.some((membership) => membership.is_owner || membership.role === 'admin')) return forbiddenResponse()
  const { editionId } = await req.json().catch(() => ({}))
  if (!editionId) return NextResponse.json({ ok: false, error: 'missing editionId' }, { status: 400 })

  const { data: edition } = await SVC.from('newspaper_editions').select('*').eq('id', editionId).single()
  if (!edition) return NextResponse.json({ ok: false, error: 'edition not found' }, { status: 404 })
  if (edition.status !== 'published') {
    return NextResponse.json({ ok: false, error: 'edition must be published first' }, { status: 400 })
  }

  const { data: articles } = await SVC.from('newspaper_articles').select('*').eq('edition_id', editionId).order('sort_order', { ascending: true })
  // BUYERS ONLY — sellers/internal/agent audiences are never mailed the weekly.
  const { data: subs } = await SVC.from('newspaper_subscriptions').select('*').eq('status', 'active').eq('audience', 'buyer')

  const subject = `Concord Weekly — ${edition.issue_label || ''}`

  let sent = 0, failed = 0
  for (const sub of (subs || [])) {
    // Ensure a persisted unsubscribe token before rendering (legacy rows may
    // have NULL tokens → empty links). Same guarantee as the weekly cron.
    let token = sub.token
    if (!token) {
      token = makeUnsubToken(sub.email)
      await SVC.from('newspaper_subscriptions').update({ token }).eq('id', sub.id).then(() => undefined)
    }
    const emailHtml = renderNewspaperV3Html(edition as any, (articles || []) as any, { ...sub, token } as any)
    const text = (articles || [])
      .map((a) => `${a.section}: ${a.headline}\n${(a.body || '').replace(/\n/g, ' ')}`)
      .join('\n\n')
    const { error } = await SVC.from('email_emails').insert({
      email_to: sub.email,
      subject,
      html: emailHtml,
      text,
      kind: 'newspaper_weekly',
      meta: { edition_id: editionId, audience: 'buyer' },
      status: 'queued',
    })
    if (error) { failed++ ; continue }
    await SVC.from('newspaper_delivery_log').insert({ edition_id: editionId, email: sub.email, status: 'sent', audience: 'buyer' })
    sent++
  }

  return NextResponse.json({ ok: true, sent, failed, total: (subs || []).length })
}

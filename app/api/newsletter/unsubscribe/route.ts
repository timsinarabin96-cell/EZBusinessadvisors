/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { makeUnsubToken } from '@/lib/newspaperShared'

// =============================================================================
// GET/POST /api/newsletter/unsubscribe — real, permanent, one-click unsubscribe
// -----------------------------------------------------------------------------
// Every Concord Weekly email links here with ?email=<addr>&token=<token>. On a
// valid match the subscription's status flips to 'unsubscribed' permanently —
// the weekly cron and manual publish route both filter on status='active', so
// that address never receives another weekly issue. No auth required (the
// token itself is the proof of ownership); if a legacy row has no token, one
// is generated + persisted on the fly so unsubscribe still works.
// =============================================================================

export const runtime = 'nodejs'

const SVC = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY || 'NO_KEY', {
      auth: { persistSession: false },
    })
  : null

function page(title: string, message: string, ok: boolean): string {
  return `<!doctype html><html><head><meta charset="utf-8"/><title>${title}</title></head>` +
    `<body style="font-family:Georgia,serif;background:#fbfaf7;margin:0;padding:60px 20px;text-align:center;color:#1a1a2e">` +
    `<div style="max-width:480px;margin:0 auto">` +
    `<div style="font-size:26px;font-weight:700;margin-bottom:10px">Concord Weekly</div>` +
    `<div style="width:48px;height:2px;background:#c9a84c;margin:0 auto 20px"></div>` +
    `<p style="font-size:15px;color:${ok ? '#2a2a2a' : '#b91c1c'}">${message}</p>` +
    `</div></body></html>`
}

async function doUnsubscribe(email: string, token: string): Promise<{ ok: boolean; message: string }> {
  if (!SVC) return { ok: false, message: 'Service not configured.' }
  const normalized = (email || '').trim().toLowerCase()
  if (!normalized) return { ok: false, message: 'Missing email address.' }

  const { data: subs, error } = await SVC.from('newspaper_subscriptions').select('id, token, status').ilike('email', normalized)
  if (error || !subs?.length) {
    return { ok: false, message: "We couldn't find that subscription. You may already be unsubscribed." }
  }

  let matched = false
  for (const sub of subs) {
    const expected = sub.token || makeUnsubToken(normalized)
    if (!sub.token) {
      await SVC.from('newspaper_subscriptions').update({ token: expected }).eq('id', sub.id)
    }
    if (expected === token) {
      await SVC.from('newspaper_subscriptions').update({ status: 'unsubscribed' }).eq('id', sub.id)
      matched = true
    }
  }

  if (!matched) {
    return { ok: false, message: 'Invalid or expired unsubscribe link. Contact us if you need help.' }
  }
  return { ok: true, message: "You've been unsubscribed — you will no longer receive the Concord Weekly." }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const email = searchParams.get('email') || ''
  const token = searchParams.get('token') || ''
  const { ok, message } = await doUnsubscribe(email, token)
  return new NextResponse(page(ok ? 'Unsubscribed' : 'Unsubscribe', message, ok), {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { ok, message } = await doUnsubscribe(body.email || '', body.token || '')
  return NextResponse.json({ ok, message })
}

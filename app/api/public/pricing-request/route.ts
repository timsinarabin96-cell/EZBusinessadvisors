/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { notify } from '@/lib/email'

export const runtime = 'nodejs'

const AGENCY_ID = '354facdb-cce2-4eb0-a160-8454854e731a' // EZ Business Advisors
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * POST /api/public/pricing-request — the agent-gated pricing flow (no auth).
 * Body: { name, email?, phone?, listing_id?, listing_title?, deal_size?, timeline?, message? }
 * Writes into buyer_leads (CRM), notifies the broker, and — when a phone is
 * provided — hands the lead to the live agent via the SMS pipeline so Yavin
 * texts the buyer back, qualifies them, and books a call.
 * Never throws.
 */
export async function POST(req: NextRequest) {
  const svc = createServerClient()
  if (!svc) return NextResponse.json({ ok: false, error: 'Not configured.' }, { status: 503 })

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request body.' }, { status: 400 })
  }

  const name = String(body?.name || '').trim()
  const email = String(body?.email || '').trim().toLowerCase()
  const phone = String(body?.phone || '').trim()
  const listingId = String(body?.listing_id || '').trim()
  const listingTitle = String(body?.listing_title || '').trim()
  const dealSize = String(body?.deal_size || '').trim()
  const timeline = String(body?.timeline || '').trim()
  const message = String(body?.message || '').trim()

  if (!name) return NextResponse.json({ ok: false, error: 'Name is required.' }, { status: 400 })
  if (!phone && !email) return NextResponse.json({ ok: false, error: 'A phone number or email is required.' }, { status: 400 })
  if (email && !EMAIL_RE.test(email)) return NextResponse.json({ ok: false, error: 'Please enter a valid email address.' }, { status: 400 })

  // 1) Record the buyer lead in the CRM.
  const { error: leadErr } = await svc.from('buyer_leads').insert({
    agency_id: AGENCY_ID,
    full_name: name,
    email: email || null,
    phone: phone || null,
    desired_business_type: listingTitle || null,
    budget_range: dealSize || null,
    timeframe: timeline || null,
    message: message || `Requested pricing for: ${listingTitle || 'a listing'}${listingId ? ` (${listingId})` : ''}`,
    status: 'new',
    source: 'pricing_request',
  })
  if (leadErr) {
    // buyer_leads may not exist everywhere — fall back to a generic log.
    console.error('[pricing-request] buyer_leads insert failed:', leadErr.message)
  }

  // 2) Hand the lead to the live agent over SMS (if a phone was given).
  //    The SMS watcher picks this up and Yavin texts the buyer back.
  if (phone) {
    try {
      const { data: session } = await svc.from('call_sessions').insert({
        agency_id: AGENCY_ID,
        provider: 'twilio',
        purpose: 'sms_receptionist',
        direction: 'inbound',
        status: 'in_progress',
        caller_number: phone,
        metadata: { last_processed_at: null, source: 'pricing_request' },
        started_at: new Date().toISOString(),
      }).select('id').single()
      if (session?.id) {
        await svc.from('call_transcripts').insert({
          agency_id: AGENCY_ID,
          call_session_id: session.id,
          sequence: Date.now() % 100000,
          speaker: 'caller',
          content: message || `Hi, I'd like pricing for ${listingTitle || 'this business'}.${dealSize ? ` My deal size is ${dealSize}.` : ''}${timeline ? ` Timeline: ${timeline}.` : ''}`,
        })
      }
    } catch (e: any) {
      console.error('[pricing-request] agent handoff failed:', e?.message)
    }
  }

  // 3) Notify the brokers (queued email).
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)
  try {
    await notify('generic', process.env.VOICE_AGENT_BROKER_EMAIL || 'info@ezbusinessadvisors.com', {
      title: `💰 Pricing request: ${listingTitle || 'a listing'}`,
      message: [
        `Name: ${esc(name)}`,
        `Phone: ${esc(phone) || '—'}`,
        `Email: ${esc(email) || '—'}`,
        listingTitle ? `Listing: ${esc(listingTitle)}` : '',
        dealSize ? `Deal size: ${esc(dealSize)}` : '',
        timeline ? `Timeline: ${esc(timeline)}` : '',
        message ? `Message: ${esc(message)}` : '',
      ],
    })
  } catch { /* email is best-effort */ }

  return NextResponse.json({
    ok: true,
    agentFollowUp: Boolean(phone),
    message: phone
      ? 'Thanks — our agent will text you shortly with pricing.'
      : 'Thanks — an agent will reach out shortly with pricing.',
  })
}

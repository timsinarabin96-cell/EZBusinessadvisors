/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email'
import {rateLimitAsync } from '@/lib/rateLimit'

export const runtime = 'nodejs'

const clientIp = (req: Request) =>
  req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
  req.headers.get('x-real-ip') ||
  'unknown'

const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))

/**
 * POST /api/public/offer — PUBLIC buyer "Make an Offer" + price-drop watch.
 *   Offer: { listingId, name, email, phone, offerAmount, financing, timeline, message }
 *   Watch: { watch: true, listingId, email }
 * No auth required (buyers aren't logged in). Records lead + emails the
 * listing's agency/broker. This is intentionally separate from the CRM's
 * auth-gated /api/offers (Offer Lab) route.
 */
export async function POST(req: NextRequest) {
  // Anti-abuse: public endpoint — rate limited per IP.
  if (!(await rateLimitAsync(clientIp(req), { limit: 10, windowMs: 60 * 1000 }))) {
    return NextResponse.json({ ok: false, error: 'Too many requests. Try again later.' }, { status: 429 })
  }
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  let body: any = {}
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Invalid body' }, { status: 400 }) }

  const listingId = String(body?.listingId || '').trim()

  // Watch-for-price-drop (no offer, just an alert subscription).
  if (body?.watch === true) {
    const email = String(body?.email || '').trim().toLowerCase()
    if (!listingId || !email || !email.includes('@')) {
      return NextResponse.json({ ok: false, error: 'Listing and a valid email are required' }, { status: 400 })
    }
    const { data: listing } = await db.from('listings').select('asking_price').eq('id', listingId).maybeSingle()
    const { error } = await db.from('price_watchers').upsert({
      listing_id: listingId,
      email,
      last_price: listing?.asking_price ?? null,
    }, { onConflict: 'listing_id,email' })
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, watching: true })
  }

  const name = String(body?.name || '').trim()
  const email = String(body?.email || '').trim()
  const phone = String(body?.phone || '').trim()
  const offerAmount = body?.offerAmount != null && body?.offerAmount !== '' ? Number(body.offerAmount) : null
  const financing = String(body?.financing || 'cash').trim()
  const timeline = String(body?.timeline || '').trim()
  const message = String(body?.message || '').trim()

  if (!listingId || !name || !email || !offerAmount) {
    return NextResponse.json({ ok: false, error: 'Name, email, and offer amount are required' }, { status: 400 })
  }

  try {
    // Record the buyer lead.
    await db.from('buyer_leads').insert({
      listing_id: listingId,
      full_name: name,
      contact_name: name,
      email,
      phone: phone || null,
      offer_amount: offerAmount,
      financing_method: financing,
      timeframe: timeline || null,
      message: message || null,
      source: 'offer_form',
      status: 'new',
    })

    // Notify agency + broker.
    const { data: listing } = await db.from('listings').select('agency_id, agent_id, business_name').eq('id', listingId).maybeSingle()
    if (listing) {
      const targets: string[] = []
      if (listing.agency_id) {
        const { data: admins } = await db.from('agency_members').select('profile_id').eq('agency_id', listing.agency_id).or('is_owner.eq.true,role.eq.admin')
        const ids = (admins || []).map((a: any) => a.profile_id)
        if (ids.length) {
          const { data: profiles } = await db.from('profiles').select('email').in('id', ids)
          for (const p of profiles || []) if (p.email) targets.push(p.email)
        }
      }
      if (listing.agent_id) {
        const { data: broker } = await db.from('broker_profiles').select('profile_id').eq('id', listing.agent_id).maybeSingle()
        if (broker?.profile_id) {
          const { data: bp } = await db.from('profiles').select('email').eq('id', broker.profile_id).maybeSingle()
          if (bp?.email && !targets.includes(bp.email)) targets.push(bp.email)
        }
      }
      const subject = `💵 New offer on ${listing.business_name || 'your listing'}`
      const html = `
        <h2 style="margin:0 0 12px;font-family:Georgia,serif;">A buyer made an offer 🎉</h2>
        <table style="font-size:14px;border-collapse:collapse;">
          <tr><td style="padding:6px 0;color:#8a8678;width:120px;">Buyer</td><td style="font-weight:600;">${esc(name)}</td></tr>
          <tr><td style="padding:6px 0;color:#8a8678;">Offer</td><td style="font-weight:600;font-size:16px;">$${Number(offerAmount).toLocaleString()}</td></tr>
          <tr><td style="padding:6px 0;color:#8a8678;">Financing</td><td style="font-weight:600;">${esc(financing)}</td></tr>
          ${timeline ? `<tr><td style="padding:6px 0;color:#8a8678;">Timeline</td><td style="font-weight:600;">${esc(timeline)}</td></tr>` : ''}
          <tr><td style="padding:6px 0;color:#8a8678;">Email</td><td style="font-weight:600;">${esc(email)}</td></tr>
          ${phone ? `<tr><td style="padding:6px 0;color:#8a8678;">Phone</td><td style="font-weight:600;"><a href="tel:${esc(phone)}">${esc(phone)}</a></td></tr>` : ''}
        </table>
        ${message ? `<p style="margin-top:14px;white-space:pre-wrap;">${esc(message)}</p>` : ''}
        <p style="margin-top:18px;font-size:13px;color:#888;">Respond fast — this buyer is ready to transact. Lead saved in your CRM.</p>
      `
      for (const to of targets) {
        await sendEmail({ to, subject, html, kind: 'lead_assignment' }).catch(() => {})
      }
    }
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Offer failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

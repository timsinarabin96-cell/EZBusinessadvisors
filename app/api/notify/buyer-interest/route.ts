/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email'
import { sendSms } from '@/lib/phoneVerify'
import {rateLimitAsync, clientIp } from '@/lib/rateLimit'

export const runtime = 'nodejs'

const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))

/**
 * POST /api/notify/buyer-interest
 * Fired after a buyer submits an inquiry on a listing. Notifies:
 *   1) the listing's agency (all admin/owner members)
 *   2) the listing's broker (agent_id → broker profile email)
 * So sellers/brokers hear about interest the moment it happens.
 */
export async function POST(req: NextRequest) {
  // Spam guard — public endpoint, no auth.
  if (!(await rateLimitAsync(clientIp(req), { limit: 15, windowMs: 60_000 }))) {
    return NextResponse.json({ ok: false, error: 'Too many requests — try again shortly' }, { status: 429 })
  }

  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  let body: any = {}
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Invalid body' }, { status: 400 }) }

  const listingId = String(body?.listing_id || '').trim()
  const buyerName = String(body?.name || 'A buyer').trim()
  const buyerEmail = String(body?.email || '').trim()
  const buyerPhone = String(body?.phone || '').trim()
  const message = String(body?.message || '').trim()

  if (!listingId) return NextResponse.json({ ok: true }) // nothing to notify about

  try {
    // 1) Listing → agency + broker.
    const { data: listing } = await db
      .from('listings')
      .select('agency_id, agent_id, business_name, owner_email, contact_phone')
      .eq('id', listingId)
      .maybeSingle()
    if (!listing) return NextResponse.json({ ok: true })

    const notifyTargets: string[] = []

    // 1b) The SELLER (owner self-service listings) — they must hear about
    //     buyer interest the moment it happens.
    if (listing.owner_email) notifyTargets.push(listing.owner_email)
    if (!listing.owner_email) {
      const { data: ord } = await db.from('seller_listing_orders').select('seller_email').eq('listing_id', listingId).maybeSingle()
      if (ord?.seller_email) notifyTargets.push(ord.seller_email)
    }

    // 2) Agency admins/owners.
    if (listing.agency_id) {
      const { data: admins } = await db
        .from('agency_members')
        .select('profile_id')
        .eq('agency_id', listing.agency_id)
        .or('is_owner.eq.true,role.eq.admin')
      const ids = (admins || []).map((a: any) => a.profile_id)
      if (ids.length) {
        const { data: profiles } = await db.from('profiles').select('email').in('id', ids)
        for (const p of profiles || []) if (p.email) notifyTargets.push(p.email)
      }
    }

    // 3) The listing's broker.
    if (listing.agent_id) {
      const { data: broker } = await db
        .from('broker_profiles')
        .select('profile_id')
        .eq('id', listing.agent_id)
        .maybeSingle()
      if (broker?.profile_id) {
        const { data: bp } = await db.from('profiles').select('email').eq('id', broker.profile_id).maybeSingle()
        if (bp?.email && !notifyTargets.includes(bp.email)) notifyTargets.push(bp.email)
      }

      // Dedupe (owner email may coincide with an agency member email).
      notifyTargets.splice(0, notifyTargets.length, ...new Set(notifyTargets))
    }

    if (!notifyTargets.length) return NextResponse.json({ ok: true })

    // 4) Send the interest alert (queued if email provider not configured).
    const subject = `🔥 New buyer interest: ${listing.business_name || 'your listing'}`
    const html = `
      <h2 style="margin:0 0 12px;font-family:Georgia,serif;">A buyer is interested in ${esc(listing.business_name || 'your listing')}</h2>
      <table style="font-size:14px;border-collapse:collapse;">
        <tr><td style="padding:6px 0;color:#8a8678;width:110px;">Buyer name</td><td style="font-weight:600;">${esc(buyerName)}</td></tr>
        <tr><td style="padding:6px 0;color:#8a8678;">Buyer email</td><td style="font-weight:600;"><a href="mailto:${esc(buyerEmail)}" style="color:#0e7490;">${esc(buyerEmail)}</a></td></tr>
        ${buyerPhone ? `<tr><td style="padding:6px 0;color:#8a8678;">Buyer phone</td><td style="font-weight:600;"><a href="tel:${esc(buyerPhone)}" style="color:#0e7490;">${esc(buyerPhone)}</a></td></tr>` : ''}
      </table>
      ${buyerPhone ? `<p style="margin-top:12px;"><a href="tel:${esc(buyerPhone)}" style="display:inline-block;padding:10px 18px;background:#0e7490;color:#fff;border-radius:8px;text-decoration:none;font-weight:700;">📞 Call ${esc(buyerName)} now</a></p>` : ''}
      ${message ? `<p style="margin-top:14px;white-space:pre-wrap;">${esc(message)}</p>` : ''}
      <p style="margin-top:18px;font-size:13px;color:#888;">Reply to the buyer directly, or follow up inside the CRM. A new lead has been added to your pipeline.</p>
    `
    for (const to of notifyTargets) {
      await sendEmail({ to, subject, html, kind: 'lead_assignment' }).catch(() => {})
    }

    // 4b) SMS the SELLER directly when the listing carries a contact phone —
    //     buyers are mobile; the seller hears about interest the moment it
    //     happens even if they're away from email.
    const sellerPhone = (listing as { contact_phone?: string | null }).contact_phone || null
    if (sellerPhone) {
      const smsBody =
        `🔥 New buyer interest on ${listing.business_name || 'your listing'}: ${buyerName}` +
        (buyerPhone ? ` (${buyerPhone})` : '') +
        (buyerEmail ? ` — ${buyerEmail}` : '') +
        '. A Concord broker will follow up; you can also reply to this text.'
      await sendSms(sellerPhone, smsBody).catch(() => {})
    }

    // 5) Auto-follow-up: confirm to the buyer + tell them what to prepare.
    if (buyerEmail) {
      await sendEmail({
        to: buyerEmail,
        subject: `Thanks for your interest in ${listing.business_name || 'your listing'}`, 
        html: `
          <h2 style="margin:0 0 12px;font-family:Georgia,serif;">Thanks, ${esc(buyerName)}! 🎉</h2>
          <p style="font-size:14px;line-height:1.6;color:#444;">We received your request for <strong>${esc(listing.business_name || 'the listing')}</strong>. A Concord broker will reach out within one business day.</p>
          <div style="background:#f4f8fa;border:1px solid #cfe6ef;border-radius:10px;padding:14px 16px;margin:14px 0;">
            <div style="font-weight:800;color:#0e7490;margin-bottom:6px;">📋 To speed things up, have ready:</div>
            <ul style="margin:0;padding-left:18px;color:#444;font-size:13.5px;line-height:1.8;">
              <li>Proof of funds (bank statement or pre-approval letter)</li>
              <li>Your target timeline for closing</li>
              <li>Any questions about the business or financing</li>
            </ul>
          </div>
          <p style="font-size:13px;color:#888;">No obligation — you're just getting the ball rolling. The broker will walk you through the confidential details.</p>
        `,
        kind: 'generic',
      }).catch(() => {})
    }
  } catch { /* notification is best-effort — never break the inquiry flow */ }

  return NextResponse.json({ ok: true })
}

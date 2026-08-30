/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import {rateLimitAsync } from '@/lib/rateLimit'
import { notify } from '@/lib/email'
import { createNotification } from '@/lib/notifications'
import { resolveListingAgency } from '@/lib/sellerListing'

export const runtime = 'nodejs'

const clientIp = (req: NextRequest) =>
  req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
  req.headers.get('x-real-ip') ||
  'unknown'

/** Cryptographically-random portal token (URL-safe, unguessable). */
function generatePortalToken(): string {
  const bytes = new Uint8Array(18)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

const AGENCY_ID = process.env.VOICE_AGENT_AGENCY_ID || '354facdb-cce2-4eb0-a160-8454854e731a' // EZ Business Advisors default

/**
 * POST /api/public/seller-intake
 * body: { name, email, phone?, business_name?, industry?, revenue_range?,
 *         location_general?, asking_price?, timeframe?, employees?, message?,
 *         agencySlug? }
 *
 * Seller-facing intake portal path. Records the seller lead WITH the receiving
 * agency (the old client-side capturePublicLead left agency_id null, so brokers
 * never saw the lead), tags it as seller self-service, then alerts brokers:
 * in-app notification + email. Never throws — a lead write failure returns a
 * clean error, never a 500 HTML.
 */
export async function POST(req: NextRequest) {
  // Anti-spam: 20 seller-intake submissions per IP per hour (raised from 5 —
  // a real marketing push trips 5/hr; captcha on the form is the next layer).
  if (!(await rateLimitAsync(clientIp(req), { limit: 20, windowMs: 60 * 60 * 1000 }))) {
    return NextResponse.json({ ok: false, error: 'Too many submissions. Try again later.' }, { status: 429 })
  }

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
  const businessName = String(body?.business_name || '').trim()
  const industry = String(body?.industry || '').trim()
  const revenueRange = String(body?.revenue_range || '').trim()
  const location = String(body?.location_general || '').trim()
  const asking = String(body?.asking_price || '').trim()
  const timeframe = String(body?.timeframe || '').trim()
  const employees = String(body?.employees || '').trim()
  const message = String(body?.message || '').trim()
  const agencySlug = String(body?.agencySlug || '').trim()

  if (!name || !email) {
    return NextResponse.json({ ok: false, error: 'Name and email are required.' }, { status: 400 })
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ ok: false, error: 'Please enter a valid email address.' }, { status: 400 })
  }

  const agencyId = agencySlug ? (await resolveListingAgency(agencySlug)) || AGENCY_ID : AGENCY_ID

  // 1) Record the seller lead (with agency — fixes the invisible-lead bug).
  //    Generate a portal token so the seller gets their self-service link.
  const portalToken = generatePortalToken()
  const portalUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://ezbusinessadvisors.vercel.app'}/seller/${portalToken}`
  const { error: leadErr } = await svc.from('seller_leads').insert({
    agency_id: agencyId,
    full_name: name,
    email,
    phone: phone || null,
    business_name: businessName || null,
    industry: industry || null,
    revenue_range: revenueRange || null,
    location_general: location || null,
    timeframe: timeframe || null,
    message: [asking ? `Thinking of asking: ${asking}` : '', employees ? `Employees: ${employees}` : '', message].filter(Boolean).join(' | ') || 'Seller intake portal submission.',
    source: 'seller_self_service',
    portal_token: portalToken,
    status: 'new',
  })
  if (leadErr) {
    return NextResponse.json({ ok: false, error: 'Could not record your request. Please try again.' }, { status: 500 })
  }

  // 2) In-app notification for the agency's brokers.
  await createNotification({
    agency_id: agencyId,
    title: `New seller inquiry: ${businessName || name}`,
    body: `${name} (${email})${phone ? ` · ${phone}` : ''}${industry ? ` · ${industry}` : ''}${location ? ` · ${location}` : ''} — wants to sell${asking ? `, thinking ${asking}` : ''}${timeframe ? ` · timeline: ${timeframe}` : ''}.`,
    kind: 'review',
    link: '/leads',
  }).catch(() => {})

  // 3) Email alert to the broker inbox.
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)
  await notify('generic', 'info@ezbusinessadvisors.com', {
    title: `New seller inquiry: ${esc(businessName || name)}`,
    message: [
      `Name: ${esc(name)}`,
      `Email: ${esc(email)}`,
      phone ? `Phone: ${esc(phone)}` : '',
      businessName ? `Business: ${esc(businessName)}` : '',
      industry ? `Industry: ${esc(industry)}` : '',
      revenueRange ? `Revenue: ${esc(revenueRange)}` : '',
      location ? `Location: ${esc(location)}` : '',
      asking ? `Thinking of asking: ${esc(asking)}` : '',
      timeframe ? `Timeline: ${esc(timeframe)}` : '',
      employees ? `Employees: ${esc(employees)}` : '',
      'Source: Seller intake portal (self-service)',
    ].filter(Boolean).join('<br/>'),
  })

  // 4) Lead magnet: when the seller gave financials, auto-generate a branded
  //    valuation PDF and email it to them with the portal link. Best-effort —
  //    never breaks intake if PDF generation or storage fails.
  try {
    const revenueNum = parseFloat(String(revenueRange || '').replace(/[^0-9.]/g, ''))
    const askingNum = parseFloat(String(asking || '').replace(/[^0-9.]/g, ''))
    if (email && (revenueNum > 0 || askingNum > 0)) {
      const { generateValuationPdf } = await import('@/lib/valuationReports')
      const pdf = await generateValuationPdf({
        business_name: businessName || 'Your Business',
        industry: industry || null,
        annual_revenue: revenueNum > 0 ? revenueNum : null,
        sde: null,
        asking_price: askingNum > 0 ? askingNum : null,
        tier: 'standard',
      })
      const pdfPath = `valuation-reports/lead-${portalToken}.pdf`
      const { error: upErr } = await svc.storage.from('financial_docs').upload(pdfPath, new Uint8Array(pdf), {
        cacheControl: '3600', upsert: true, contentType: 'application/pdf',
      })
      if (!upErr) {
        // Private bucket → email a long-lived SIGNED URL, never a public path.
        const { data: su } = await svc.storage.from('financial_docs').createSignedUrl(pdfPath, 7 * 24 * 3600)
        const pdfUrl = su?.signedUrl || ''
        await notify('generic', email, {
          title: `Your confidential valuation — ${businessName || 'Your Business'}`,
          message: [
            `Hi ${esc(name)},`,
            'Thank you for your submission. Here is your complimentary, confidential business valuation preview:',
            pdfUrl ? `<a href="${esc(pdfUrl)}">📊 Download your valuation report (PDF)</a>` : '',
            `🔐 Track progress anytime in your private portal: <a href="${esc(portalUrl)}">${esc(portalUrl)}</a>`,
            'A broker will follow up within one business day to walk you through it.',
            '— Your Concord broker',
          ].filter(Boolean).join('<br/>'),
        })
      }
    }
  } catch {
    // best-effort — the lead + portal are already recorded
  }

  return NextResponse.json({ ok: true, portalUrl })
}

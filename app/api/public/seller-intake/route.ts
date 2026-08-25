import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { notify } from '@/lib/email'
import { createNotification } from '@/lib/notifications'
import { resolveListingAgency } from '@/lib/sellerListing'

export const runtime = 'nodejs'

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
  const portalUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://concord.ezbusinessadvisors.com'}/seller/${portalToken}`
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

  return NextResponse.json({ ok: true, portalUrl })
}

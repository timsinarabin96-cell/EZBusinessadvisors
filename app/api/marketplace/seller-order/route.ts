/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSellerListingOrder, resolveListingAgency } from '@/lib/sellerListing'
import { validationErrorJson } from '@/lib/friendlyValidation'
import { createNotification } from '@/lib/notifications'
import { createServerClient } from '@/lib/supabase/server'
import { notify } from '@/lib/email'
import { rateLimitAsync } from '@/lib/rateLimit'

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

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)

const MAX_BODY_BYTES = 32 * 1024

const sellerOrderSchema = z.object({
  planId: z.enum(['free', 'professional', 'enterprise']),
  agencySlug: z.string().max(80).optional(),
  business_name: z.string().min(1).max(200),
  industry: z.string().max(100).optional().nullable(),
  location_general: z.string().max(200).optional().nullable(),
  description: z.string().max(4000).optional().nullable(),
  asking_price: z.number().nonnegative().optional().nullable(),
  annual_revenue: z.number().nonnegative().optional().nullable(),
  sde: z.number().nonnegative().optional().nullable(),
  established_year: z.number().int().min(1950).max(2100).optional().nullable(),
  seller_email: z.string().email().max(200),
  seller_name: z.string().max(200).optional().nullable(),
  seller_phone: z.string().max(50).optional().nullable(),
  attestation: z.boolean().optional(),
  provider: z.string().max(40).optional(),
  providerSessionId: z.string().max(200).optional(),
})

function fail(message: string, status = 400, extra: object = {}) {
  return NextResponse.json({ ok: false, error: message, ...extra }, { status })
}

/**
 * POST /api/marketplace/seller-order
 * body: { planId, agencySlug?, business_name, industry?, location_general?,
 *         description?, asking_price?, annual_revenue?, sde?,
 *         seller_email, seller_name?, seller_phone?, provider?, providerSessionId? }
 *
 * Seller self-service pay-to-list. Creates a DRAFT listing in the broker
 * review queue plus a paid order record. Nothing is published automatically —
 * a broker must approve the listing before it appears publicly.
 */
export async function POST(req: NextRequest) {
  // Anti-abuse: public order form — rate limited per IP.
  if (!(await rateLimitAsync(clientIp(req), { limit: 5, windowMs: 60 * 1000 }))) {
    return fail('Too many requests. Try again later.', 429)
  }
  const raw = await req.text().catch(() => '')
  if (!raw) return fail('Empty request body.', 400)
  if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) {
    return fail('Request too large.', 413)
  }

  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return fail('Invalid JSON.', 400)
  }

  const parsed = sellerOrderSchema.safeParse(body)
  if (!parsed.success) {
    return fail(validationErrorJson(parsed.error).error, 422, { detail: validationErrorJson(parsed.error).detail })
  }

  // Legal shield (boss): no listing without the seller's own-risk attestation.
  if (parsed.data.attestation !== true) {
    return fail('You must accept the listing terms & risk disclosure to continue.', 422, { code: 'ATTESTATION_REQUIRED' })
  }

  const agencyId = await resolveListingAgency(parsed.data.agencySlug || undefined)
  if (!agencyId) {
    return fail('No receiving brokerage is configured yet.', 503, {
      code: 'NO_AGENCY',
    })
  }

  const result = await createSellerListingOrder(agencyId, parsed.data.planId, {
    business_name: parsed.data.business_name,
    industry: parsed.data.industry ?? null,
    location_general: parsed.data.location_general ?? null,
    description: parsed.data.description ?? null,
    asking_price: parsed.data.asking_price ?? null,
    annual_revenue: parsed.data.annual_revenue ?? null,
    sde: parsed.data.sde ?? null,
    established_year: parsed.data.established_year ?? null,
    seller_email: parsed.data.seller_email,
    seller_name: parsed.data.seller_name ?? null,
    seller_phone: parsed.data.seller_phone ?? null,
    attestation: parsed.data.attestation === true,
  }, {
    provider: parsed.data.provider,
    providerSessionId: parsed.data.providerSessionId,
    status: parsed.data.providerSessionId ? 'paid' : 'pending',
  })

  if (!result.ok) {
    return fail(result.error || 'Failed to create listing order', 500, {
      code: 'ORDER_FAILED',
    })
  }

  // Seller tracking: give the seller a private portal token + email them the
  // link so they can follow their listing (status, financials upload, docs)
  // instead of being left blind after the thank-you screen.
  const portalToken = generatePortalToken()
  const listingId = (result.listing as { id?: string } | undefined)?.id
  if (listingId) {
    const db = createServerClient()
    if (db) {
      await db.from('listings').update({ portal_token: portalToken }).eq('id', listingId).maybeSingle()
    }
  }
  const portalUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://ezbusinessadvisors.vercel.app'}/seller/${portalToken}`
  await notify('generic', parsed.data.seller_email, {
    title: `Your listing request — track it anytime: ${parsed.data.business_name}`,
    message: [
      `Hi ${esc(parsed.data.seller_name || 'there')},`,
      'Thank you for listing your business with Concord. A broker is reviewing your submission and will reach out to confirm details.',
      `🔐 Track your listing anytime in your private portal: <a href="${esc(portalUrl)}">${esc(portalUrl)}</a>`,
      '— Your Concord broker',
    ].filter(Boolean).join('<br/>'),
  }).catch(() => {})

  // Alert brokers: a paid listing order landed in the review queue.
  await createNotification({
    agency_id: agencyId,
    title: `💰 Paid listing order: ${parsed.data.business_name}`,
    body: `${parsed.data.seller_name || parsed.data.seller_email} submitted a ${parsed.data.planId} listing — approve it in the review queue to go live.`,
    kind: 'review',
    link: '/dashboard/review-queue',
  }).catch(() => {})

  return NextResponse.json({
    ok: true,
    order: result.order,
    listing: result.listing,
    message: 'Your listing is in the broker review queue. A broker will contact you to confirm details before it goes live.',
  })
}

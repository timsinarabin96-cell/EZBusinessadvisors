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
import {rateLimitAsync } from '@/lib/rateLimit'

export const runtime = 'nodejs'

const clientIp = (req: NextRequest) =>
  req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
  req.headers.get('x-real-ip') ||
  'unknown'

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
  seller_email: z.string().email().max(200),
  seller_name: z.string().max(200).optional().nullable(),
  seller_phone: z.string().max(50).optional().nullable(),
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
    seller_email: parsed.data.seller_email,
    seller_name: parsed.data.seller_name ?? null,
    seller_phone: parsed.data.seller_phone ?? null,
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

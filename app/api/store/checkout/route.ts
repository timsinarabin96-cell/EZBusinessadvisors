/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, unauthorizedResponse } from '@/lib/supabase/auth'
import { createCheckoutSession, stripeConfigured } from '@/lib/stripeCheckout'

export const runtime = 'nodejs'

/**
 * POST /api/store/checkout
 * Creates a Stripe Checkout session for a marketing-materials order.
 * Body: { productId, quantity, shippingAddress: {name,line1,line2?,city,state,zip} }
 * Metadata carries { kind: 'store_order', productId, quantity } so the webhook
 * can confirm the order + auto-send the supplier work order on payment.
 */
export async function POST(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const body = await req.json().catch(() => ({}))
  const productId = String(body?.productId || '')
  const quantity = Math.max(1, Math.min(1000, parseInt(String(body?.quantity || '1'), 10) || 1))
  const ship = body?.shippingAddress || {}
  if (!productId) return NextResponse.json({ ok: false, error: 'missing productId' }, { status: 400 })
  if (!ship.name || !ship.line1 || !ship.city || !ship.state || !ship.zip) {
    return NextResponse.json({ ok: false, error: 'Complete shipping address required' }, { status: 400 })
  }
  if (!stripeConfigured()) {
    return NextResponse.json(
      { ok: false, error: 'Stripe is not connected yet. Add STRIPE_SECRET_KEY to accept store orders.' },
      { status: 503 },
    )
  }

  const { data: product } = await db.from('store_products').select('*').eq('id', productId).maybeSingle()
  if (!product) return NextResponse.json({ ok: false, error: 'Product not found' }, { status: 404 })

  const sell = Number(product.sell_price || 0)
  if (sell <= 0) return NextResponse.json({ ok: false, error: 'Product is not priced' }, { status: 400 })

  const origin = req.headers.get('origin') || req.headers.get('referer') || 'http://localhost:3000'
  const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_URL || origin
  const safeUrl = (u: unknown, fallback: string): string => {
    const s = String(u || '')
    if (!s) return fallback
    try {
      const parsed = new URL(s)
      const allowed = new URL(APP_ORIGIN)
      return parsed.origin === allowed.origin || s.startsWith('/') ? s : fallback
    } catch {
      return fallback
    }
  }

  const result = await createCheckoutSession({
    agencyId: auth.memberships[0]?.agency_id || '',
    items: [
      {
        name: product.name,
        amountCents: Math.round(sell * 100),
        quantity,
        description: product.description || undefined,
      },
    ],
    successUrl: safeUrl(body?.successUrl, `${origin}/dashboard/store?checkout=success`),
    cancelUrl: safeUrl(body?.cancelUrl, `${origin}/dashboard/store?checkout=cancelled`),
    customerEmail: auth.user.email,
    metadata: {
      kind: 'store_order',
      productId,
      productName: product.name,
      quantity: String(quantity),
      shipName: ship.name,
      shipLine1: ship.line1,
      shipLine2: ship.line2 || '',
      shipCity: ship.city,
      shipState: ship.state,
      shipZip: ship.zip,
    },
  })

  if (!result.ok || !result.url) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 })
  }
  return NextResponse.json({ ok: true, url: result.url })
}

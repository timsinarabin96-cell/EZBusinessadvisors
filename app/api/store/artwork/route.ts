/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, unauthorizedResponse } from '@/lib/supabase/auth'
import { generateStoreArtwork, type StoreArtworkBrand } from '@/lib/storeArtwork'

export const runtime = 'nodejs'

/**
 * POST /api/store/artwork
 * AI-generates branded artwork for a store product (design step before payment).
 * Body: { productId, brand?: { businessName, tagline, primaryColor, accentColor,
 *                              logoUrl, phone, website } }
 * Returns { ok, url, provider } — the artwork is uploaded to store_artwork
 * storage and its public URL rides the checkout → work-order → supplier path.
 */
export async function POST(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const body = await req.json().catch(() => ({}))
  const productId = String(body?.productId || '')
  if (!productId) return NextResponse.json({ ok: false, error: 'missing productId' }, { status: 400 })

  const { data: product } = await db.from('store_products').select('*').eq('id', productId).maybeSingle()
  if (!product) return NextResponse.json({ ok: false, error: 'Product not found' }, { status: 404 })

  const brand: StoreArtworkBrand = {
    businessName: String(body?.brand?.businessName || ''),
    tagline: String(body?.brand?.tagline || ''),
    primaryColor: String(body?.brand?.primaryColor || ''),
    accentColor: String(body?.brand?.accentColor || ''),
    logoUrl: body?.brand?.logoUrl ? String(body.brand.logoUrl) : null,
    phone: String(body?.brand?.phone || ''),
    website: String(body?.brand?.website || ''),
  }

  const result = await generateStoreArtwork({
    productName: String(product.name || ''),
    category: String(product.category || 'flyers'),
    description: product.description ? String(product.description) : null,
    brand,
  })

  if (!result.ok) {
    const err = 'error' in result ? result.error : 'AI design failed'
    const provider = 'provider' in result ? result.provider : undefined
    return NextResponse.json({ ok: false, error: err, provider }, { status: 502 })
  }
  return NextResponse.json({ ok: true, url: result.url, provider: result.provider })
}

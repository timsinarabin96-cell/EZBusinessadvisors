/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, unauthorizedResponse } from '@/lib/supabase/auth'
import { createClient } from '@supabase/supabase-js'
import { ARTWORK_BUCKET } from '@/lib/storeArtwork'

export const runtime = 'nodejs'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

const ALLOWED = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf']
const MAX_BYTES = 15 * 1024 * 1024

/**
 * POST /api/store/artwork/upload — multipart/form-data: { file, productId }
 * Uploads the broker's own print template (PDF/AI/PSD/PNG/JPG/WebP) to the
 * store_artwork bucket and returns its public URL for the checkout flow.
 */
export async function POST(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ ok: false, error: 'Expected multipart form data' }, { status: 400 })
  }
  const file = form.get('file')
  const productId = String(form.get('productId') || '')
  if (!(file instanceof File)) return NextResponse.json({ ok: false, error: 'file is required' }, { status: 400 })
  if (!productId) return NextResponse.json({ ok: false, error: 'productId is required' }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ ok: false, error: 'File must be under 15MB' }, { status: 400 })
  if (!ALLOWED.includes(file.type)) {
    return NextResponse.json({ ok: false, error: 'Use PNG, JPG, WebP, or PDF' }, { status: 400 })
  }
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return NextResponse.json({ ok: false, error: 'storage not configured' }, { status: 503 })
  }

  const { data: product } = await db.from('store_products').select('name').eq('id', productId).maybeSingle()
  if (!product) return NextResponse.json({ ok: false, error: 'Product not found' }, { status: 404 })

  const bytes = Buffer.from(await file.arrayBuffer())
  const ext = file.name.split('.').pop()?.toLowerCase() || (file.type === 'application/pdf' ? 'pdf' : 'png')
  const path = `templates/${productId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

  const svc = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
  const { error: upErr } = await svc.storage.from(ARTWORK_BUCKET).upload(path, bytes, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type,
  })
  if (upErr) return NextResponse.json({ ok: false, error: `upload failed: ${upErr.message}` }, { status: 500 })

  const { data: urlData } = svc.storage.from(ARTWORK_BUCKET).getPublicUrl(path)
  return NextResponse.json({ ok: true, url: urlData?.publicUrl || '' })
}

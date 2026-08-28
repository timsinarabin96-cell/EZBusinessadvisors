/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

const BUCKET = 'profile_images'
const MAX_BYTES = 5 * 1024 * 1024 // 5MB
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

// =============================================================================
// POST /api/profile/photo — multipart { photo: File }
// Uploads the user's profile photo (public bucket) and updates profiles
// avatar_url + avatar_thumb_url. Part of the identity/verification layer.
// =============================================================================

export async function POST(req: NextRequest) {
  const svc = createServerClient()
  if (!svc) return NextResponse.json({ ok: false, error: 'Not configured.' }, { status: 503 })

  const { data: { user } } = await svc.auth.getUser()
  if (!user?.id) return NextResponse.json({ ok: false, error: 'Sign in required' }, { status: 401 })

  const form = await req.formData().catch(() => null)
  if (!form) return NextResponse.json({ ok: false, error: 'Expected multipart form data' }, { status: 400 })
  const file = form.get('photo')
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ ok: false, error: 'Attach a photo (JPG, PNG, WEBP, GIF).' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) return NextResponse.json({ ok: false, error: 'Photo must be under 5MB.' }, { status: 400 })
  if (!ALLOWED.has(file.type)) return NextResponse.json({ ok: false, error: 'Unsupported file type.' }, { status: 400 })

  const ext = (file.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg')
  const path = `${user.id}/avatar-${Date.now()}.${ext}`
  const bytes = new Uint8Array(await file.arrayBuffer())
  const { error: upErr } = await svc.storage.from(BUCKET).upload(path, bytes, {
    contentType: file.type,
    cacheControl: '3600',
    upsert: true,
  })
  if (upErr) return NextResponse.json({ ok: false, error: `Upload failed: ${upErr.message}` }, { status: 500 })

  const { data: urlData } = svc.storage.from(BUCKET).getPublicUrl(path)
  const url = urlData?.publicUrl || ''
  const { error: profErr } = await svc
    .from('profiles')
    .update({ avatar_url: url, avatar_thumb_url: url, profile_completed_at: new Date().toISOString() })
    .eq('id', user.id)
  if (profErr) return NextResponse.json({ ok: false, error: profErr.message }, { status: 500 })

  return NextResponse.json({ ok: true, avatarUrl: url, message: 'Profile photo updated.' })
}

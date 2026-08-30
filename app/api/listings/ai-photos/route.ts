/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, unauthorizedResponse } from '@/lib/supabase/auth'
import {
  MAX_AI_OPTIONS,
  resolveAiPhotoProvider,
  AI_PHOTO_PROVIDER_LABEL,
  fetchAiImageBytes,
  aiPhotoSeed,
  type GeneratedAiImage,
} from '@/lib/aiPhotos'

export const runtime = 'nodejs'
export const maxDuration = 120 // free-tier generation can be slow; 4 options in parallel

// =============================================================================
// POST /api/listings/ai-photos — AI Photo Studio.
// -----------------------------------------------------------------------------
// Generates N photo options for a listing via the best configured provider
// (OpenAI → FAL → free keyless fallback), uploads every result straight into
// the listing_images storage bucket so images are permanent, and returns the
// public URLs for the broker to preview and pick from.
// =============================================================================

const bodySchema = z.object({
  listingId: z.string().uuid().optional(),
  prompt: z.string().min(3).max(600),
  count: z.number().int().min(1).max(MAX_AI_OPTIONS).default(MAX_AI_OPTIONS),
})

const BUCKET = 'listing_images'

async function ensureBucket(db: NonNullable<ReturnType<typeof createServerClient>>) {
  const { data } = await db.storage.getBucket(BUCKET)
  if (data) return
  await db.storage.createBucket(BUCKET, { public: true }).catch(() => {})
}

export async function POST(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'Server client not configured.' }, { status: 500 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const body = await req.json().catch(() => ({}))
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'A prompt (3–600 chars) is required' }, { status: 400 })
  }
  const { listingId, prompt, count } = parsed.data

  // Agency gate when a listing is attached (IDOR guard — same as auto-build).
  if (listingId) {
    try {
      const { data: listing } = await db.from('listings').select('agency_id, agent_id').eq('id', listingId).maybeSingle()
      if (!listing) return NextResponse.json({ ok: false, error: 'Listing not found' }, { status: 404 })
      const agencyId = (listing as { agency_id?: string | null } | null)?.agency_id
      const agentId = (listing as { agent_id?: string | null } | null)?.agent_id
      const mine = new Set((auth.memberships || []).map((m) => m.agency_id))
      if (agencyId && !mine.has(agencyId) && agentId !== auth.user.id) {
        return NextResponse.json({ ok: false, error: 'Not a member of this listing\'s agency' }, { status: 403 })
      }
    } catch {
      return NextResponse.json({ ok: false, error: 'Agency check failed' }, { status: 500 })
    }
  }

  const provider = resolveAiPhotoProvider()
  await ensureBucket(db)

  const folder = listingId || `pending-${auth.user.id.slice(0, 8)}`
  const stamp = Date.now()
  const results: GeneratedAiImage[] = []
  const failures: string[] = []

  // Parallel per-option generation (each option = one image call).
  await Promise.all(
    Array.from({ length: count }, async (_, i) => {
      const seed = aiPhotoSeed(i)
      try {
        const { bytes, mime } = await fetchAiImageBytes(provider, prompt, seed)
        const ext = mime.includes('png') ? 'png' : 'jpg'
        const path = `${folder}/ai-${stamp}-${i}.${ext}`
        const { error: uploadError } = await db.storage
          .from(BUCKET)
          .upload(path, bytes, { contentType: mime, cacheControl: '3600', upsert: true })
        if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`)
        const { data: pub } = db.storage.from(BUCKET).getPublicUrl(path)
        results.push({ url: pub.publicUrl, path, provider, seed })
      } catch (e: any) {
        failures.push(e?.message || 'Generation failed')
      }
    })
  )

  if (results.length === 0) {
    return NextResponse.json(
      { ok: false, error: `AI photo generation failed (${provider}): ${failures[0] || 'unknown error'}` },
      { status: 502 }
    )
  }

  return NextResponse.json({
    ok: true,
    provider,
    providerLabel: AI_PHOTO_PROVIDER_LABEL[provider],
    requested: count,
    failed: failures.length,
    images: results,
  })
}

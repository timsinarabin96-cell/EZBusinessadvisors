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
  action: z.enum(['generate', 'commit']).default('generate'),
  listingId: z.string().uuid().optional(),
  prompt: z.string().min(3).max(600).optional(),
  count: z.number().int().min(1).max(MAX_AI_OPTIONS).default(MAX_AI_OPTIONS),
  urls: z.array(z.string().url()).max(MAX_AI_OPTIONS).optional(),
})

const BUCKET = 'listing_images'

async function ensureBucket(db: NonNullable<ReturnType<typeof createServerClient>>) {
  const { data } = await db.storage.getBucket(BUCKET)
  if (data) return
  await db.storage.createBucket(BUCKET, { public: true }).catch(() => {})
}

/** Agency gate (IDOR guard) — shared by both actions. */
async function agencyGate(
  db: NonNullable<ReturnType<typeof createServerClient>>,
  auth: NonNullable<Awaited<ReturnType<typeof authenticateProfileRequest>>>,
  listingId: string
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  try {
    const { data: listing } = await db.from('listings').select('agency_id, agent_id').eq('id', listingId).maybeSingle()
    if (!listing) return { ok: false, status: 404, error: 'Listing not found' }
    const agencyId = (listing as { agency_id?: string | null } | null)?.agency_id
    const agentId = (listing as { agent_id?: string | null } | null)?.agent_id
    const mine = new Set((auth.memberships || []).map((m) => m.agency_id))
    if (agencyId && !mine.has(agencyId) && agentId !== auth.user.id) {
      return { ok: false, status: 403, error: 'Not a member of this listing\'s agency' }
    }
    return { ok: true }
  } catch {
    return { ok: false, status: 500, error: 'Agency check failed' }
  }
}

export async function POST(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'Server client not configured.' }, { status: 500 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const body = await req.json().catch(() => ({}))
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Invalid request — prompt (3–600 chars) or a valid listingId + urls required' }, { status: 400 })
  }
  const { action, listingId, prompt, count, urls } = parsed.data

  // Agency gate when a listing is attached (same as auto-build).
  if (listingId) {
    const gate = await agencyGate(db, auth, listingId)
    if (!gate.ok) {
      return NextResponse.json({ ok: false, error: (gate as { error: string }).error }, { status: (gate as { status: number }).status })
    }
  }

  // ── COMMIT: persist picked AI images onto the listing gallery ──
  if (action === 'commit') {
    if (!listingId || !urls || urls.length === 0) {
      return NextResponse.json({ ok: false, error: 'listingId and urls are required to commit' }, { status: 400 })
    }
    const { data: row } = await db.from('listings').select('image_urls, gallery_json').eq('id', listingId).maybeSingle()
    const existing: string[] = Array.isArray((row as any)?.image_urls) ? (row as any).image_urls : []
    const merged = [...new Set([...existing, ...urls])]
    const { error: updateError } = await db
      .from('listings')
      .update({ image_urls: merged, updated_at: new Date().toISOString() })
      .eq('id', listingId)
    if (updateError) {
      return NextResponse.json({ ok: false, error: `Could not save photos: ${updateError.message}` }, { status: 500 })
    }
    return NextResponse.json({ ok: true, committed: urls.length, image_urls: merged })
  }

  // ── GENERATE (default) ──
  if (!prompt) {
    return NextResponse.json({ ok: false, error: 'A prompt (3–600 chars) is required' }, { status: 400 })
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

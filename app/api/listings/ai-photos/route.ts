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
  type AiPhotoProviderId,
} from '@/lib/aiPhotos'
import { writeAiPhotoPrompt } from '@/lib/aiPhotoPrompt'

export const runtime = 'nodejs'
export const maxDuration = 120 // free-tier generation can be slow; 4 options in parallel

// =============================================================================
// POST /api/listings/ai-photos — AI Photo Studio (boss 08-31 rebuild).
// -----------------------------------------------------------------------------
// Three actions:
//   generate — Claude writes a REAL listing-specific photo prompt (industry,
//              location, service specifics, interview answers) and the best
//              configured provider (FAL → OpenAI → free fallback) generates N
//              options; every result uploads straight into the listing_images
//              bucket so images are permanent. An explicit `prompt` overrides
//              the Claude-written one (agent tweak).
//   upload   — agent's OWN photos (multipart files[]): validated, stored in
//              the same bucket, appended to the listing gallery. Mixes freely
//              with AI-generated options.
//   commit   — persist picked image URLs onto the listing gallery (image_urls).
//   cover    — set one gallery image as the primary/cover photo.
// =============================================================================

const bodySchema = z.object({
  action: z.enum(['generate', 'commit', 'cover']).default('generate'),
  listingId: z.string().uuid().optional(),
  prompt: z.string().min(3).max(600).optional(),
  styleId: z.string().max(40).optional(),
  count: z.number().int().min(1).max(MAX_AI_OPTIONS).default(MAX_AI_OPTIONS),
  urls: z.array(z.string().url()).max(MAX_AI_OPTIONS).optional(),
  url: z.string().url().optional(),
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

  // ── UPLOAD: agent's own photos (multipart form-data) ──
  const contentType = req.headers.get('content-type') || ''
  if (contentType.includes('multipart/form-data')) {
    return handleUpload(db, auth, req)
  }

  const body = await req.json().catch(() => ({}))
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Invalid request — prompt (3–600 chars) or a valid listingId + urls required' }, { status: 400 })
  }
  const { action, listingId, prompt, styleId, count, urls, url } = parsed.data

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

  // ── COVER: set one gallery image as the primary/cover photo ──
  if (action === 'cover') {
    if (!listingId || !url) {
      return NextResponse.json({ ok: false, error: 'listingId and url are required to set the cover' }, { status: 400 })
    }
    const { data: row } = await db.from('listings').select('image_urls').eq('id', listingId).maybeSingle()
    const existing: string[] = Array.isArray((row as any)?.image_urls) ? (row as any).image_urls : []
    // Cover must be a gallery member; promote it to first position.
    if (!existing.includes(url)) {
      return NextResponse.json({ ok: false, error: 'That image is not in the listing gallery' }, { status: 400 })
    }
    const reordered = [url, ...existing.filter((u) => u !== url)]
    const { error: coverError } = await db
      .from('listings')
      .update({ image_urls: reordered, primary_image_url: url, updated_at: new Date().toISOString() })
      .eq('id', listingId)
    if (coverError) {
      return NextResponse.json({ ok: false, error: `Could not set cover: ${coverError.message}` }, { status: 500 })
    }
    return NextResponse.json({ ok: true, primary_image_url: url, image_urls: reordered })
  }

  // ── GENERATE (default) ──
  // Claude writes the prompt from the REAL listing record when no explicit
  // prompt is supplied (boss 08-31: prompt specificity is the quality lever).
  let effectivePrompt = prompt
  let promptSource: 'claude' | 'template' | 'explicit' = 'explicit'
  if (!effectivePrompt) {
    const listing = listingId
      ? ((await db.from('listings').select('business_name, industry, sub_industry, location_general, description, reason_for_sale, headline').eq('id', listingId).maybeSingle())?.data as Record<string, unknown> | null)
      : null
    const written = await writeAiPhotoPrompt(
      {
        businessName: (listing as any)?.business_name || null,
        industry: (listing as any)?.industry || null,
        subIndustry: (listing as any)?.sub_industry || null,
        location: (listing as any)?.location_general || null,
        description: (listing as any)?.description || null,
        reasonForSale: (listing as any)?.reason_for_sale || null,
        headline: (listing as any)?.headline || null,
      },
      styleId,
      listingId
    )
    effectivePrompt = written.prompt
    promptSource = written.source
  }
  if (!effectivePrompt || effectivePrompt.trim().length < 3) {
    return NextResponse.json({ ok: false, error: 'A prompt (3–600 chars) is required' }, { status: 400 })
  }

  const resolvedProvider = resolveAiPhotoProvider()
  await ensureBucket(db)

  const folder = listingId || `pending-${auth.user.id.slice(0, 8)}`
  const stamp = Date.now()

  // Provider fallback ladder (boss 08-31: FAL confirmed primary). If the
  // resolved provider fails (e.g. locked account / TOP_UP / quota), fall
  // through to the next configured provider so generation never hard-fails.
  const PRIORITY: AiPhotoProviderId[] = ['fal', 'openai', 'free']
  const ladder = [resolvedProvider, ...PRIORITY.filter((p) => p !== resolvedProvider)]

  let results: GeneratedAiImage[] = []
  let failures: string[] = []
  let provider = resolvedProvider

  for (const candidate of ladder) {
    const attempt: GeneratedAiImage[] = []
    const attemptFailures: string[] = []
    await Promise.all(
      Array.from({ length: count }, async (_, i) => {
        const seed = aiPhotoSeed(i)
        try {
          const { bytes, mime } = await fetchAiImageBytes(candidate, effectivePrompt as string, seed)
          const ext = mime.includes('png') ? 'png' : 'jpg'
          const path = `${folder}/ai-${stamp}-${i}.${ext}`
          const { error: uploadError } = await db.storage
            .from(BUCKET)
            .upload(path, bytes, { contentType: mime, cacheControl: '3600', upsert: true })
          if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`)
          const { data: pub } = db.storage.from(BUCKET).getPublicUrl(path)
          attempt.push({ url: pub.publicUrl, path, provider: candidate, seed })
        } catch (e: any) {
          attemptFailures.push(e?.message || 'Generation failed')
        }
      })
    )
    if (attempt.length > 0) {
      results = attempt
      failures = attemptFailures
      provider = candidate
      break
    }
    failures = attemptFailures
  }

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
    promptSource,
    images: results,
  })
}

// =============================================================================
// Upload handler — the agent's own photos (multipart). Validates type + size,
// stores in listing_images/<listingId>/own-*, appends to image_urls. The first
// uploaded photo becomes the cover if none exists yet (DB trigger also covers).
// =============================================================================

const ALLOWED_UPLOAD_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024 // 10MB

async function handleUpload(
  db: NonNullable<ReturnType<typeof createServerClient>>,
  auth: NonNullable<Awaited<ReturnType<typeof authenticateProfileRequest>>>,
  req: NextRequest
) {
  const form = await req.formData().catch(() => null)
  if (!form) return NextResponse.json({ ok: false, error: 'Expected multipart form-data' }, { status: 400 })
  const listingId = String(form.get('listingId') || '')
  if (!listingId) return NextResponse.json({ ok: false, error: 'listingId is required' }, { status: 400 })

  const gate = await agencyGate(db, auth, listingId)
  if (!gate.ok) {
    return NextResponse.json({ ok: false, error: (gate as { error: string }).error }, { status: (gate as { status: number }).status })
  }

  const files = form.getAll('files').filter((f): f is File => f instanceof File)
  if (files.length === 0) return NextResponse.json({ ok: false, error: 'No files in the upload' }, { status: 400 })

  const badType = files.find((f) => !ALLOWED_UPLOAD_TYPES.includes(f.type))
  if (badType) {
    return NextResponse.json({ ok: false, error: `Only JPG, PNG, WebP, or HEIC images are allowed (got ${badType.type || 'unknown'})` }, { status: 415 })
  }
  const tooBig = files.find((f) => f.size > MAX_UPLOAD_BYTES)
  if (tooBig) {
    return NextResponse.json({ ok: false, error: 'Each image must be under 10MB' }, { status: 413 })
  }

  await ensureBucket(db)
  const stamp = Date.now()
  const urls: string[] = []
  const failures: string[] = []

  for (let i = 0; i < files.length; i++) {
    const f = files[i]
    const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif' }[f.type] || 'jpg'
    const path = `${listingId}/own-${stamp}-${i}.${ext}`
    try {
      const buf = Buffer.from(await f.arrayBuffer())
      const { error: upErr } = await db.storage
        .from(BUCKET)
        .upload(path, buf, { contentType: f.type, cacheControl: '3600', upsert: false })
      if (upErr) throw new Error(upErr.message || 'Upload failed')
      const { data: pub } = db.storage.from(BUCKET).getPublicUrl(path)
      urls.push(pub.publicUrl)
    } catch (e: any) {
      failures.push(e?.message || 'Upload failed')
    }
  }

  if (urls.length === 0) {
    return NextResponse.json({ ok: false, error: `Upload failed: ${failures[0] || 'unknown error'}` }, { status: 500 })
  }

  // Append to the gallery; first upload becomes cover when no cover exists.
  const { data: row } = await db.from('listings').select('image_urls, primary_image_url').eq('id', listingId).maybeSingle()
  const existing: string[] = Array.isArray((row as any)?.image_urls) ? (row as any).image_urls : []
  const merged = [...new Set([...existing, ...urls])]
  const hasCover = Boolean((row as any)?.primary_image_url)
  const { error: upDateError } = await db
    .from('listings')
    .update({
      image_urls: merged,
      primary_image_url: hasCover ? (row as any).primary_image_url : urls[0],
      updated_at: new Date().toISOString(),
    })
    .eq('id', listingId)
  if (upDateError) {
    return NextResponse.json({ ok: false, error: `Photos uploaded but could not update gallery: ${upDateError.message}` }, { status: 500 })
  }

  return NextResponse.json({ ok: true, uploaded: urls.length, failed: failures.length, urls, image_urls: merged })
}

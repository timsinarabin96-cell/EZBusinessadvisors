/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// AI Photo Studio — AI-generated listing photos with multiple options.
// -----------------------------------------------------------------------------
// Provider ladder (first configured wins):
//   1. OpenAI  — OPENAI_API_KEY            (gpt-image-1, best quality)
//   2. FAL     — FAL_KEY                   (flux-pro/v1.1, fast + cheap)
//   3. Free    — no key needed             (Pollinations flux, zero cost fallback)
// This module is isomorphic (safe to import on client AND server); the actual
// provider fetch happens server-side in /api/listings/ai-photos.
// =============================================================================

export type AiPhotoProviderId = 'openai' | 'fal' | 'free'

export const AI_PHOTO_PROVIDER_LABEL: Record<AiPhotoProviderId, string> = {
  openai: 'OpenAI gpt-image-1',
  fal: 'FAL flux-pro',
  free: 'Free AI (Pollinations)',
}

export const AI_PHOTO_PROVIDER_NOTE: Record<AiPhotoProviderId, string> = {
  openai: 'Highest quality — billed to your OpenAI account',
  fal: 'Fast, low-cost generation via FAL',
  free: 'Zero-cost fallback (Pollinations flux) — perfect for drafts',
}

/** Which provider will be used, in priority order. FAL is the confirmed
 *  provider (boss 08-31); OpenAI remains as a fallback when FAL is not
 *  configured, and the keyless Pollinations tier is the last resort. */
export function resolveAiPhotoProvider(): AiPhotoProviderId {
  if (process.env.FAL_KEY) return 'fal'
  if (process.env.OPENAI_API_KEY) return 'openai'
  return 'free'
}

export const MAX_AI_OPTIONS = 4

export interface AiPhotoStyle {
  id: string
  label: string
  suffix: string
}

/** Style presets — each appends a photography direction to the prompt. */
export const AI_PHOTO_STYLES: AiPhotoStyle[] = [
  { id: 'realistic', label: '📸 Realistic', suffix: 'professional real-estate photography, natural lighting, high detail, photorealistic' },
  { id: 'exterior', label: '🏢 Storefront', suffix: 'exterior street view of the business storefront with signage, daylight, photorealistic' },
  { id: 'interior', label: '🛋️ Interior', suffix: 'clean inviting interior, modern finishes, natural light, photorealistic' },
  { id: 'aerial', label: '🚁 Aerial', suffix: 'aerial drone view showing the property and surrounding area, golden hour, photorealistic' },
  { id: 'night', label: '🌙 Night', suffix: 'evening shot with warm lit signage and windows, dusk sky, photorealistic' },
  { id: 'modern', label: '✨ Modern', suffix: 'sleek modern design, minimalist, premium feel, photorealistic' },
]

export function aiPhotoStyleById(id: string | null | undefined): AiPhotoStyle {
  return AI_PHOTO_STYLES.find((s) => s.id === id) || AI_PHOTO_STYLES[0]
}

export interface AiPhotoInput {
  businessName?: string | null
  industry?: string | null
  subIndustry?: string | null
  location?: string | null
  description?: string | null
}

/**
 * Build a strong listing-photo prompt from the deal record. The generated
 * image must never invent text (AI text looks broken), so we explicitly
 * forbid text overlays/watermarks and keep it to the business itself.
 */
export function buildAiPhotoPrompt(input: AiPhotoInput, style: AiPhotoStyle): string {
  const biz = (input.businessName || '').trim()
  const sub = (input.subIndustry || '').trim()
  const ind = (input.industry || '').trim()
  const kind = sub || ind || 'small business'
  const loc = (input.location || '').trim()
  const desc = (input.description || '').trim().slice(0, 160)

  const parts: string[] = []
  parts.push(biz ? `A ${biz} — ${kind} business` : `A ${kind} business`)
  if (loc) parts.push(`located in ${loc}`)
  if (desc) parts.push(desc)
  parts.push(style.suffix)
  parts.push('no people, no readable text, no words, no logos, no watermarks, no captions')
  return parts.join(', ')
}

/** Slots for the option grid (seed variety so the N options differ). */
export function aiPhotoSeed(i: number): number {
  return 1000 + i * 977 + Math.floor(Date.now() / 1000) % 97
}

// ---------------------------------------------------------------------------
// Provider fetch helpers (server-side only — used by the API route).
// ---------------------------------------------------------------------------

export interface GeneratedAiImage {
  /** Public URL of the generated image (already uploaded to our storage). */
  url: string
  /** Storage path we uploaded it to. */
  path: string
  /** Which provider produced this image. */
  provider: AiPhotoProviderId
  seed: number
}

export interface AiPhotoGenerationError {
  ok: false
  error: string
  provider?: AiPhotoProviderId
}

/**
 * Fetch raw image bytes for one prompt from the active provider.
 * Throws with a human-readable message on failure.
 */
export async function fetchAiImageBytes(
  provider: AiPhotoProviderId,
  prompt: string,
  seed: number,
  signal?: AbortSignal
): Promise<{ bytes: Buffer; mime: string }> {
  switch (provider) {
    case 'openai': {
      const key = process.env.OPENAI_API_KEY
      if (!key) throw new Error('OPENAI_API_KEY is not configured')
      const res = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: 'gpt-image-1',
          prompt,
          n: 1,
          size: '1024x1024',
          quality: 'medium',
          response_format: 'b64_json',
        }),
      })
      if (!res.ok) {
        const detail = (await res.text()).slice(0, 300)
        throw new Error(`OpenAI image API ${res.status}: ${detail}`)
      }
      const json = (await res.json()) as { data?: { b64_json?: string }[] }
      const b64 = json.data?.[0]?.b64_json
      if (!b64) throw new Error('OpenAI returned no image data')
      return { bytes: Buffer.from(b64, 'base64'), mime: 'image/png' }
    }

    case 'fal': {
      const key = process.env.FAL_KEY
      if (!key) throw new Error('FAL_KEY is not configured')
      const res = await fetch('https://fal.run/fal-ai/flux-pro/v1.1', {
        method: 'POST',
        signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Key ${key}` },
        body: JSON.stringify({
          prompt,
          image_size: { width: 1024, height: 1024 },
          num_images: 1,
          seed,
        }),
      })
      if (!res.ok) {
        const detail = (await res.text()).slice(0, 300)
        throw new Error(`FAL API ${res.status}: ${detail}`)
      }
      const json = (await res.json()) as { images?: { url?: string }[] }
      const url = json.images?.[0]?.url
      if (!url) throw new Error('FAL returned no image URL')
      const img = await fetch(url, { signal })
      if (!img.ok) throw new Error(`FAL image download ${img.status}`)
      return { bytes: Buffer.from(await img.arrayBuffer()), mime: 'image/jpeg' }
    }

    case 'free': {
      // Pollinations — keyless flux generation. Free tier can be slow, so we
      // allow a generous timeout and treat failures as per-option skips.
      const u = new URL(`https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}`)
      u.searchParams.set('width', '1024')
      u.searchParams.set('height', '1024')
      u.searchParams.set('model', 'flux')
      u.searchParams.set('nologo', 'true')
      u.searchParams.set('seed', String(seed))
      const res = await fetch(u.toString(), { signal })
      if (!res.ok) throw new Error(`Pollinations ${res.status}`)
      const ct = res.headers.get('content-type') || 'image/jpeg'
      return { bytes: Buffer.from(await res.arrayBuffer()), mime: ct.includes('png') ? 'image/png' : 'image/jpeg' }
    }
  }
}

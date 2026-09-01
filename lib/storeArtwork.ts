/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Store AI artwork generator — closes the "blank template" gap with design.
// -----------------------------------------------------------------------------
// When a broker orders marketing materials they now get a DESIGN STEP: the
// system AI-generates branded, print-style artwork for that exact product
// (business card front, flyer, banner…) using the agency brand (colors, logo,
// business name) — or the broker uploads their own template. Either way the
// artwork URL rides the order through Stripe metadata → webhook → work order
// so the supplier prints the real design, not a placeholder.
//
// Server-safe: reuses the aiPhotos provider ladder (OpenAI → FAL → free flux).
// =============================================================================

import { createClient } from '@supabase/supabase-js'
import {
  fetchAiImageBytes,
  resolveAiPhotoProvider,
  aiPhotoSeed,
  type AiPhotoProviderId,
} from '@/lib/aiPhotos'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
export const ARTWORK_BUCKET = 'store_artwork'

export interface StoreArtworkBrand {
  businessName?: string
  tagline?: string
  primaryColor?: string // hex, e.g. #1a1a2e
  accentColor?: string // hex, e.g. #c9a84c
  logoUrl?: string | null
  phone?: string
  website?: string
}

export interface StoreArtworkInput {
  productName: string
  category: string
  description?: string | null
  brand?: StoreArtworkBrand
}

export interface StoreArtworkResult {
  ok: true
  url: string
  provider: AiPhotoProviderId
  prompt: string
}
export interface StoreArtworkError {
  ok: false
  error: string
  provider?: AiPhotoProviderId
}

/** Hex (#rrggbb) → plain color name-ish descriptor for the image prompt. */
function describeColor(hex?: string): string {
  const h = String(hex || '').replace('#', '')
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return 'deep navy'
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  if (r > 200 && g > 170 && b < 130) return 'gold'
  if (r < 60 && g < 60 && b > 80) return 'deep navy'
  if (r < 80 && g < 80 && b < 80) return 'charcoal'
  if (r > 200 && g > 200 && b > 200) return 'white'
  if (r > 200 && g < 120 && b < 120) return 'crimson'
  if (r < 120 && g > 160 && b < 120) return 'emerald green'
  return `#${h}`
}

/** Build a product-aware, print-style design prompt from the brand context. */
export function buildStoreArtworkPrompt(input: StoreArtworkInput): string {
  const b = input.brand || {}
  const biz = String(b.businessName || input.productName || 'Your Business').trim()
  const tag = String(b.tagline || '').trim()
  const primary = describeColor(b.primaryColor)
  const accent = describeColor(b.accentColor)
  const contact = [b.phone, b.website].filter(Boolean).join(' · ')

  const base = [
    `Professional print-ready ${input.productName.toLowerCase()} background design for "${biz}"`,
    `color palette: ${primary} background with ${accent} accents`,
    tag ? `tagline motif: "${tag}"` : '',
    contact ? `contact motif: ${contact}` : '',
  ].filter(Boolean).join(', ')

  const spec: Record<string, string> = {
    business_cards: 'business card FRONT design, portrait orientation, clean modern layout, logo area top, business name prominent, contact details bottom, flat vector style, crisp typography, no photo',
    postcards: 'marketing postcard design, portrait orientation, bold headline area, image band, contact footer, clean modern layout, flat vector style',
    flyers: 'marketing flyer design, portrait 8.5x11, bold headline top, value bullets, image band, contact footer, clean modern layout, flat vector style, no photo',
    brochures: 'tri-fold brochure cover design, landscape orientation, elegant cover with business name, gold accents, clean modern layout, flat vector style',
    envelopes: 'business envelope design, landscape, return-address corner branding with logo and business name, subtle pattern, clean, flat vector style',
    banners: 'wide marketing banner design, landscape 3:1, bold business name center, tagline, contact line, strong contrast, flat vector style, no photo',
    signage: 'yard sign design, portrait, bold headline, business name, contact line, high contrast, flat vector style, no photo',
    stationery: 'letterhead design, portrait, top header with logo and business name, footer contact, minimal elegant, flat vector style',
    promo: 'promo product design, clean centered logo lockup with business name and tagline on solid background, flat vector style',
    apparel: 't-shirt graphic design, centered logo lockup with business name, single-color print style, flat vector, no photo',
  }

  const style = spec[input.category] || 'clean modern brand design, flat vector style'
  const desc = input.description ? ` (${input.description})` : ''
  return `${base}. ${style}. ${desc} ABSTRACT BACKGROUND ART ONLY — NO TEXT, NO LETTERS, NO WORDS, NO NUMBERS, NO LOGOS. Clean composition with clear negative space in the center for text overlay. Print-quality, high resolution, no watermark, no mockup frame.`
}

/** Generate AI artwork for a store product and upload it to storage. */
export async function generateStoreArtwork(
  input: StoreArtworkInput,
): Promise<StoreArtworkResult | StoreArtworkError> {
  const prompt = buildStoreArtworkPrompt(input)
  const provider = resolveAiPhotoProvider()
  const seed = aiPhotoSeed(Math.floor(Math.random() * 100))

  try {
    const { bytes, mime } = await fetchAiImageBytes(provider, prompt, seed)
    if (!SUPABASE_URL || !SERVICE_KEY) {
      return { ok: false, error: 'storage not configured', provider }
    }
    const svc = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
    const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg'
    const path = `artwork/${Date.now()}-${seed}.${ext}`
    const { error: upErr } = await svc.storage
      .from(ARTWORK_BUCKET)
      .upload(path, bytes, { cacheControl: '3600', upsert: false, contentType: mime })
    if (upErr) return { ok: false, error: `upload failed: ${upErr.message}`, provider }
    const { data: urlData } = svc.storage.from(ARTWORK_BUCKET).getPublicUrl(path)
    return { ok: true, url: urlData?.publicUrl || '', provider, prompt }
  } catch (e: any) {
    return { ok: false, error: e?.message || 'AI design failed', provider }
  }
}

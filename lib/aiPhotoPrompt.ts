/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// AI Photo Prompt Writer (boss 08-31) — Claude writes the photo prompt from
// REAL listing detail (industry, location, service specifics, interview
// answers), not a boilerplate template. The old client-side template
// (buildAiPhotoPrompt in lib/aiPhotos.ts) is kept ONLY as a cold fallback when
// Claude is unavailable — it is no longer the primary prompt source.
// Server-only.
// =============================================================================

import { createClient } from '@supabase/supabase-js'
import { complete, isClaudeConfigured } from '@/lib/claude/client'
import { buildAiPhotoPrompt, aiPhotoStyleById, type AiPhotoStyle } from '@/lib/aiPhotos'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const svc = SUPABASE_URL && SERVICE_KEY ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } }) : null

export interface PhotoPromptListingInput {
  businessName?: string | null
  industry?: string | null
  subIndustry?: string | null
  location?: string | null
  description?: string | null
  reasonForSale?: string | null
  headline?: string | null
}

/**
 * Fetch the advisor-interview answers for a listing (the seller's own words —
 * the richest prompt source: service specifics, operations, transition terms).
 * Never throws; returns [] when there is no interview.
 */
export async function fetchInterviewAnswers(listingId: string): Promise<{ topic: string; question: string; answer: string }[]> {
  if (!svc) return []
  try {
    const { data } = await svc.from('advisor_interviews').select('qa').eq('listing_id', listingId).maybeSingle()
    const qa = (data as { qa?: unknown } | null)?.qa
    if (!Array.isArray(qa)) return []
    return qa
      .filter((r: any) => r && typeof r === 'object' && typeof r.answer === 'string' && r.answer.trim())
      .map((r: any) => ({
        topic: String(r.topic || 'interview'),
        question: String(r.question || '').slice(0, 200),
        answer: String(r.answer).slice(0, 400),
      }))
      .slice(0, 40)
  } catch {
    return []
  }
}

/**
 * Claude writes the listing-photo prompt from the real record. Falls back to
 * the old template only when Claude is not configured or the call fails.
 * Returns { prompt, source: 'claude' | 'template' }.
 */
export async function writeAiPhotoPrompt(
  listing: PhotoPromptListingInput,
  styleId: string | null | undefined,
  listingId?: string | null
): Promise<{ prompt: string; source: 'claude' | 'template' }> {
  const style = aiPhotoStyleById(styleId)

  // Cold fallback: template (only when Claude is unavailable).
  if (!isClaudeConfigured()) {
    return { prompt: buildAiPhotoPrompt(listing, style), source: 'template' }
  }

  // Real listing detail + the seller's interview answers.
  const answers = listingId ? await fetchInterviewAnswers(listingId) : []
  const detailLines: string[] = []
  detailLines.push(`Business: ${listing.businessName || 'Unnamed'}`)
  detailLines.push(`Industry: ${[listing.subIndustry, listing.industry].filter(Boolean).join(' / ') || 'small business'}`)
  if (listing.location) detailLines.push(`Location: ${listing.location}`)
  if (listing.headline) detailLines.push(`Headline: ${listing.headline}`)
  if (listing.reasonForSale) detailLines.push(`Reason for sale: ${listing.reasonForSale}`)
  if (listing.description) detailLines.push(`Description: ${String(listing.description).slice(0, 600)}`)
  if (answers.length > 0) {
    detailLines.push('')
    detailLines.push('SELLER INTERVIEW (use these specifics — operations, services, facilities):')
    for (const a of answers.slice(0, 12)) {
      detailLines.push(`- [${a.topic}] ${a.question ? a.question + ': ' : ''}${a.answer}`)
    }
  }

  try {
    const res = await complete({
      context: { kind: 'listing', entityId: listingId || undefined, text: detailLines.join('\n') },
      system:
        'You write image-generation prompts for business-for-sale listings. ' +
        'Produce ONE detailed, photorealistic photography prompt (plain text, 40-90 words, no markdown) ' +
        `for a ${style.label.replace(/^[^\s]+\s/, '')} photo. ` +
        `Direction to apply: ${style.suffix}. ` +
        'Rules: use the REAL listing specifics (industry, location, services, facilities, interview answers) — never invent a different business. ' +
        'Never render readable text, signage lettering, words, logos, watermarks, people, or captions. ' +
        'Describe the scene, light, and composition concretely so the image looks like a real business, not a generic stock photo.',
      message: `Write the photo prompt for: ${listing.businessName || 'this business'} (${style.label}).`,
      maxTokens: 300,
    })
    const prompt = (res.text || '').trim()
    if (prompt.length >= 20) return { prompt, source: 'claude' }
  } catch {
    /* fall through to template */
  }
  return { prompt: buildAiPhotoPrompt(listing, style), source: 'template' }
}

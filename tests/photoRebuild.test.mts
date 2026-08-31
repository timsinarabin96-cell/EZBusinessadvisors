/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Photo rebuild regression locks (boss 08-31):
//   • Claude writes the photo prompt from REAL listing detail (interview
//     answers included) — the old templated client prompt is no longer the
//     primary path (replace, don't run both).
//   • Agents can UPLOAD their own photos and MIX them with AI options in one
//     gallery, and mark any image as the cover/primary photo.
//   • The old AI-only AiPhotoStudioCard is gone; the unified ListingPhotosPicker
//     replaces it (both paths side by side).
// =============================================================================

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const promptWriter = readFileSync('lib/aiPhotoPrompt.ts', 'utf8')
const route = readFileSync('app/api/listings/ai-photos/route.ts', 'utf8')
const picker = readFileSync('components/studio/ListingPhotosPicker.tsx', 'utf8')
const builder = readFileSync('components/studio/OneShotDealBuilder.tsx', 'utf8')
const form = readFileSync('components/listings/IntelligentListingForm.tsx', 'utf8')
const aiPhotos = readFileSync('lib/aiPhotos.ts', 'utf8')

test('photo rebuild: Claude writes the prompt from REAL listing detail + interview answers', () => {
  assert.match(promptWriter, /AI Photo Prompt Writer \(boss 08-31\)/)
  assert.match(promptWriter, /fetchInterviewAnswers\(listingId/)
  assert.match(promptWriter, /advisor_interviews'\)\.select\('qa'\)/)
  assert.match(promptWriter, /SELLER INTERVIEW \(use these specifics/)
  assert.match(promptWriter, /export async function writeAiPhotoPrompt/)
  assert.match(promptWriter, /isClaudeConfigured\(\)/)
  assert.match(promptWriter, /source: 'claude' \| 'template'/)
})

test('photo rebuild: template survives ONLY as cold fallback, never the primary path', () => {
  // The template builder still exists for fallback…
  assert.match(aiPhotos, /export function buildAiPhotoPrompt/)
  // …but the route prefers Claude when no explicit prompt is supplied.
  assert.match(route, /Claude writes the prompt from the REAL listing record/)
  assert.match(route, /writeAiPhotoPrompt\(/)
  assert.match(route, /promptSource: 'claude' \| 'template' \| 'explicit'/)
})

test('photo rebuild: upload action — agent own photos, validated, mixed into gallery', () => {
  assert.match(route, /UPLOAD: agent's own photos \(multipart form-data\)/)
  assert.match(route, /handleUpload\(db, auth, req\)/)
  assert.match(route, /ALLOWED_UPLOAD_TYPES/)
  assert.match(route, /MAX_UPLOAD_BYTES = 10 \* 1024 \* 1024/)
  assert.match(route, /form\.getAll\('files'\)/)
  assert.match(route, /own-\$\{stamp\}-\$\{i\}/)
  assert.match(route, /primary_image_url: hasCover \? .* : urls\[0\]/)
})

test('photo rebuild: cover action — star one image as primary/cover', () => {
  assert.match(route, /action === 'cover'/)
  assert.match(route, /COVER: set one gallery image as the primary\/cover photo/)
  assert.match(route, /reordered = \[url, \.\.\.existing\.filter/)
  assert.match(route, /primary_image_url: url/)
})

test('photo rebuild: unified picker — upload + generate side by side, mix both, star cover', () => {
  assert.match(picker, /Listing Photos Picker \(boss 08-31 rebuild\)/)
  assert.match(picker, /Upload your own/)
  assert.match(picker, /Generate options/)
  assert.match(picker, /Claude writes a photo prompt from your listing details/)
  assert.match(picker, /Set cover/)
  assert.match(picker, /⭐ Cover/)
  assert.match(picker, /accept="image\/jpeg,image\/png,image\/webp,image\/heic,image\/heif"/)
  assert.match(picker, /styleId, count: 4/)
  assert.match(picker, /action: 'cover'/)
})

test('photo rebuild: old AI-only card deleted, studio + wizard use the new path', () => {
  assert.match(builder, /import ListingPhotosPicker/)
  assert.doesNotMatch(builder, /AiPhotoStudioCard/)
  // Wizard: empty prompt → Claude writes it server-side (styleId sent instead).
  assert.match(form, /body: JSON\.stringify\(\{ listingId: listingId \|\| undefined, styleId, count: 4, prompt: prompt\.trim\(\) \|\| undefined \}\)/)
  assert.doesNotMatch(form, /buildAiPhotoPrompt/)
})

test('photo rebuild: generated options still commit to the gallery (unchanged commit path)', () => {
  assert.match(route, /action === 'commit'/)
  assert.match(route, /merged = \[\.\.\.new Set\(\[\.\.\.existing, \.\.\.urls\]\)\]/)
})

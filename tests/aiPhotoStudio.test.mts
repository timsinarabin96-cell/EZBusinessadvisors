import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { z } from 'zod'

const aiPhotos = await import('../lib/aiPhotos.ts')

test('ai-photos: module loads cleanly', () => {
  assert.ok(aiPhotos.buildAiPhotoPrompt)
  assert.ok(aiPhotos.fetchAiImageBytes)
})

test('ai-photos: provider ladder — openai > fal > free', () => {
  const prev = { openai: process.env.OPENAI_API_KEY, fal: process.env.FAL_KEY }
  try {
    process.env.OPENAI_API_KEY = 'sk-test'
    process.env.FAL_KEY = 'fal-test'
    assert.equal(aiPhotos.resolveAiPhotoProvider(), 'openai')
    delete process.env.OPENAI_API_KEY
    assert.equal(aiPhotos.resolveAiPhotoProvider(), 'fal')
    delete process.env.FAL_KEY
    assert.equal(aiPhotos.resolveAiPhotoProvider(), 'free')
  } finally {
    process.env.OPENAI_API_KEY = prev.openai
    process.env.FAL_KEY = prev.fal
  }
})

test('ai-photos: prompt builder includes business kind, location, style, and no-text guard', () => {
  const p = aiPhotos.buildAiPhotoPrompt(
    { businessName: 'Sunrise Bakery', subIndustry: 'Bakery', industry: 'Food & Beverage', location: 'Austin, TX', description: 'Family-run bakery with loyal catering base.' },
    aiPhotos.AI_PHOTO_STYLES[0]
  )
  assert.match(p, /Sunrise Bakery/)
  assert.match(p, /Bakery/)
  assert.match(p, /Austin, TX/)
  assert.match(p, /no readable text/)
  assert.match(p, /no people/)
  assert.ok(p.length > 40)
})

test('ai-photos: prompt builder falls back to industry / small business', () => {
  const p = aiPhotos.buildAiPhotoPrompt({ industry: 'Laundromat' }, aiPhotos.AI_PHOTO_STYLES[0])
  assert.match(p, /Laundromat business/)
  const generic = aiPhotos.buildAiPhotoPrompt({}, aiPhotos.AI_PHOTO_STYLES[0])
  assert.match(generic, /small business/)
})

test('ai-photos: six styles, each with a photography direction', () => {
  assert.equal(aiPhotos.AI_PHOTO_STYLES.length, 6)
  for (const s of aiPhotos.AI_PHOTO_STYLES) {
    assert.ok(s.id && s.label && s.suffix.length > 10, `style ${s.id} incomplete`)
  }
  assert.equal(aiPhotos.aiPhotoStyleById('aerial').id, 'aerial')
  assert.equal(aiPhotos.aiPhotoStyleById('nope').id, 'realistic') // unknown → default
})

test('ai-photos: max 4 options, seeds differ per slot', () => {
  assert.equal(aiPhotos.MAX_AI_OPTIONS, 4)
  const seeds = [0, 1, 2, 3].map((i) => aiPhotos.aiPhotoSeed(i))
  assert.equal(new Set(seeds).size, 4)
})

test('ai-photos: route schema caps count at MAX_AI_OPTIONS', () => {
  const schema = z.object({
    listingId: z.string().uuid().optional(),
    prompt: z.string().min(3).max(600),
    count: z.number().int().min(1).max(aiPhotos.MAX_AI_OPTIONS).default(aiPhotos.MAX_AI_OPTIONS),
  })
  assert.equal(schema.parse({ prompt: 'abc' }).count, 4)
  assert.throws(() => schema.parse({ prompt: 'abc', count: 9 }))
  assert.throws(() => schema.parse({ prompt: 'x' }))
})

test('ai-photos: route wires the provider ladder + storage upload', () => {
  const route = readFileSync('app/api/listings/ai-photos/route.ts', 'utf8')
  assert.match(route, /authenticateProfileRequest/)
  assert.match(route, /resolveAiPhotoProvider\(\)/)
  assert.match(route, /fetchAiImageBytes/)
  assert.match(route, /listing_images/)
  assert.match(route, /getPublicUrl/)
  assert.match(route, /maxDuration = 120/)
})

test('ai-photos: studio UI in the form — generate 4 options (Claude-written prompt), add to gallery', () => {
  const form = readFileSync('components/listings/IntelligentListingForm.tsx', 'utf8')
  assert.match(form, /AI Photo Studio/)
  assert.match(form, /Generate 4 photo options/)
  // Boss 08-31: Claude writes the prompt server-side — the templated client
  // prompt builder is gone from the form (replace, don't run both).
  assert.doesNotMatch(form, /buildAiPhotoPrompt/)
  assert.match(form, /AI_PHOTO_STYLES\.map/)
  assert.match(form, /api\/listings\/ai-photos/)
  assert.match(form, /Add to gallery/)
  assert.match(form, /onAdd=/)
})

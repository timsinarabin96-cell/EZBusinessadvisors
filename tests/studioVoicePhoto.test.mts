import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const vision = readFileSync('lib/photoVision.ts', 'utf8')
const route = readFileSync('app/api/ai/photo-analysis/route.ts', 'utf8')
const insights = readFileSync('components/studio/StudioInsights.tsx', 'utf8')
const studio = readFileSync('components/studio/OneShotDealBuilder.tsx', 'utf8')
const callsRoute = readFileSync('app/api/calls/route.ts', 'utf8')

test('photo vision reports condition, assets, red flags, and price signal', () => {
  assert.match(vision, /condition/)
  assert.match(vision, /assets/)
  assert.match(vision, /redFlags/)
  assert.match(vision, /priceSignal/)
  assert.match(vision, /listingBoost/)
})

test('photo vision is bounded — max 6 images, 4MB cap, 15s fetch timeout', () => {
  assert.match(vision, /MAX_IMAGES = 6/)
  assert.match(vision, /MAX_IMAGE_BYTES = 4 \* 1024 \* 1024/)
  assert.match(vision, /AbortSignal\.timeout\(15000\)/)
})

test('photo vision only reports what photos show (no invented details)', () => {
  assert.match(vision, /report ONLY what the photos actually show/)
  assert.match(vision, /do not invent details/)
})

test('photo analysis route is auth-gated and agency-scoped (IDOR guard)', () => {
  assert.match(route, /Missing authorization header/)
  assert.match(route, /Invalid or expired session/)
  assert.match(route, /Not a member of this listing/)
})

test('photo analysis route requires a uuid listingId', () => {
  assert.match(route, /z\.string\(\)\.uuid\(\)/)
  assert.match(route, /Missing or invalid: listingId/)
})

test('photo analysis returns 503 when Claude is not configured', () => {
  assert.match(route, /Photo AI is not configured yet/)
})

test('photo AI card is wired into the studio verify rail', () => {
  assert.match(insights, /export function PhotoAICard/)
  assert.match(studio, /AiPhotoStudioCard/)
  assert.match(studio, /Approve & Go Live/)
})

test('photo AI card surfaces the price signal verdict', () => {
  assert.match(insights, /Photos SUPPORT the asking price/)
  assert.match(insights, /Photos WEAKEN the asking price/)
  assert.match(insights, /Listing boost/)
})

test('voice intake card is wired into the capture rail', () => {
  assert.match(insights, /export function VoiceIntakeCard/)
  assert.match(studio, /AiPhotoStudioCard/)
  assert.match(studio, /Build Entire Deal/)
})

test('voice intake card labels caller vs agent turns in the transcript', () => {
  assert.match(insights, /'CALLER'/)
  assert.match(insights, /'AGENT'/)
  assert.match(insights, /'BROKER'/)
})

test('calls API can include transcripts for the studio pull', () => {
  assert.match(callsRoute, /includeTranscripts/)
  assert.match(callsRoute, /call_transcripts/)
})

test('voice intake pulls only calls that have transcripts', () => {
  assert.match(insights, /filter\(\(c: any\) => \(c\.transcripts \|\| \[\]\)\.length > 0\)/)
})

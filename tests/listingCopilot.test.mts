import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const types = readFileSync('types/ai.ts', 'utf8')
const prompts = readFileSync('lib/claude/prompts.ts', 'utf8')
const context = readFileSync('lib/claude/context.ts', 'utf8')
const route = readFileSync('app/api/ai/chat/route.ts', 'utf8')
const copilot = readFileSync('components/listings/ListingCopilot.tsx', 'utf8')
const wfPage = readFileSync('components/studio/AIDealStudio.tsx', 'utf8')

test('listing copilot: agent kind registered', () => {
  assert.match(types, /'listing'/)
  assert.match(route, /z\.enum\(\[[^\]]*'listing'/)
})

test('listing copilot: system prompt exists and is registered', () => {
  assert.match(prompts, /LISTING_SYSTEM/)
  assert.match(prompts, /listing: LISTING_SYSTEM/)
  assert.match(prompts, /senior sell-side M&A advisor/)
  assert.match(prompts, /readiness snapshot/)
})

test('listing copilot: context loader scoped to the listing', () => {
  assert.match(context, /buildListingContext/)
  assert.match(context, /case 'listing'/)
  assert.match(context, /READINESS: score/)
  assert.match(context, /MARKET BAND/)
  assert.match(context, /BLOCKERS/)
  assert.match(context, /WORKFLOW: current step/)
})

test('listing copilot: chat UI posts to the listing agent with entityId', () => {
  assert.match(copilot, /agent: 'listing'/)
  assert.match(copilot, /entityId: listingId/)
  assert.match(copilot, /AI Listing Copilot/)
  assert.match(copilot, /QUICK_PROMPTS/)
  assert.match(copilot, /Draft a headline/)
  assert.match(copilot, /Why is this listing not publish-ready/)
})

test('listing copilot: AI Deal Studio mounts the copilot rail (Verify phase)', () => {
  assert.match(wfPage, /ListingCopilot/)
  assert.match(wfPage, /ListingCopilot listingId=\{listingId\} businessName=\{listing\?\.business_name\}/)
  // Old standalone workflow page now redirects into the studio.
  const redirect = readFileSync('app/dashboard/listings/[id]/workflow/page.tsx', 'utf8')
  assert.match(redirect, /redirect\(`\/dashboard\/studio\?phase=verify/)
})

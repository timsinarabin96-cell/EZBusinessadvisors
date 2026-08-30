import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { z } from 'zod'
import { friendlyValidationError, validationErrorJson } from '../lib/friendlyValidation.ts'

// --- Helper behavior ---------------------------------------------------------
test('too-small input gets a human "add more detail" message', () => {
  const schema = z.object({ notes: z.string().min(20).max(8000) })
  const parsed = schema.safeParse({ notes: 'hi' })
  assert.ok(!parsed.success)
  const { error } = friendlyValidationError(parsed.error)
  assert.match(error, /Add more detail/)
  assert.match(error, /at least 20/)
  assert.match(error, /field: notes/)
})

test('too-long input gets a shorten message', () => {
  const schema = z.object({ notes: z.string().min(1).max(10) })
  const parsed = schema.safeParse({ notes: 'x'.repeat(50) })
  assert.ok(!parsed.success)
  const { error } = friendlyValidationError(parsed.error)
  assert.match(error, /too long/)
})

test('missing uuid gets an actionable message with the field name', () => {
  const schema = z.object({ listingId: z.string().uuid() })
  const parsed = schema.safeParse({ listingId: 'nope' })
  assert.ok(!parsed.success)
  const { error } = friendlyValidationError(parsed.error)
  assert.match(error, /field: listingId/)
  assert.ok(error.length > 20)
})

test('validationErrorJson returns ok:false + error + detail', () => {
  const schema = z.object({ name: z.string().min(3) })
  const parsed = schema.safeParse({ name: 'a' })
  assert.ok(!parsed.success)
  const json = validationErrorJson(parsed.error, { action: 'save the offer' })
  assert.equal(json.ok, false)
  assert.match(json.error, /save the offer/)
  assert.ok(json.detail)
})

test('action prefix is included when provided', () => {
  const schema = z.object({ price: z.number() })
  const parsed = schema.safeParse({ price: 'abc' })
  assert.ok(!parsed.success)
  const { error } = friendlyValidationError(parsed.error, { action: 'submit your offer' })
  assert.match(error, /submit your offer/)
})

// --- Sweep: no route still emits the cryptic string --------------------------
import { execSync } from 'node:child_process'
const files = execSync(`grep -rl "Validation failed" app/api --include="route.ts" || true`, { encoding: 'utf8' }).trim()
test('no API route still emits "Validation failed"', () => {
  assert.equal(files, '', `still emitting: ${files}`)
})

// --- Client surfaces show friendly errors --------------------------------------
const concierge = readFileSync('components/studio/OneShotDealBuilder.tsx', 'utf8')
const insights = readFileSync('components/studio/StudioInsights.tsx', 'utf8')
const form = readFileSync('components/listings/IntelligentListingForm.tsx', 'utf8')
const intakeRoute = readFileSync('app/api/listings/intake/route.ts', 'utf8')

test('One-Shot builder surfaces build errors with a friendly message', () => {
  assert.match(concierge, /setError\(/)
  assert.match(concierge, /Build failed/)
})

test('intake API returns a human message with next-step guidance', () => {
  assert.match(intakeRoute, /Add more detail — I need at least 20 characters/)
  assert.match(intakeRoute, /tap Build my listing/)
})

test('listing form tells you what is missing + where to tap next', () => {
  assert.match(form, /Business name is missing — type it in the Business section/)
  assert.match(form, /add \$\{missing\.join/)
  assert.match(form, /then tap Create again/)
  assert.match(form, /Optional for now/)
})

test('voice intake + competitive board surfaces detail too', () => {
  assert.match(insights, /j\.error \|\| j\.detail/)
})

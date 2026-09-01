import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const booking = readFileSync('lib/booking.ts', 'utf8')
const chatRoute = readFileSync('app/api/ai/chat/route.ts', 'utf8')

test('booking service extracts structured data via sensitive provider', () => {
  assert.match(booking, /export async function extractBooking/)
  assert.match(booking, /completeSensitive/)
  assert.match(booking, /needs_confirmation/)
})

test('booking service creates appointments in CRM calendar', () => {
  assert.match(booking, /export async function createBooking/)
  assert.match(booking, /from\('appointments'\)\s*\.insert/)
  assert.match(booking, /conflict check|clashes|lt\('starts_at'/)
  assert.match(booking, /Invalid appointment time/)
})

test('booking normalization rejects invented attendee details', () => {
  assert.match(booking, /Never invent a name, email, or phone/)
  assert.match(booking, /attendee_name: raw\.attendee_name \?/)
})

test('chat route supports the booking agent kind', () => {
  assert.match(chatRoute, /'lead', 'training', 'document', 'support', 'booking'/)
  assert.match(chatRoute, /agent === 'booking'/)
  assert.match(chatRoute, /createBooking\(ctx\.agencyId/)
  assert.match(chatRoute, /needs_confirmation/)
})

test('booking agent is registered in prompt builder and types', () => {
  const prompts = readFileSync('lib/claude/prompts.ts', 'utf8')
  const types = readFileSync('types/ai.ts', 'utf8')
  assert.match(prompts, /BOOKING_SYSTEM/)
  assert.match(prompts, /booking: BOOKING_SYSTEM/)
  assert.match(types, /'lead' \| 'training' \| 'document' \| 'support' \| 'booking'/)
})

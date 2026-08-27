import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

// =============================================================================
// Lead connection flow: buyer capture → invitation email + calendar booking +
// CRM follow-up reminder. Source-level regression tests (repo style).
// =============================================================================

test('notify subscription capture wires the invitation email + follow-up reminder', () => {
  const src = readFileSync('lib/notifySubscriptions.ts', 'utf8')
  assert.match(src, /notify\('buyer_invite'/)
  assert.match(src, /createReminder\(/)
  assert.match(src, /kind: 'follow_up'/)
  assert.match(src, /bookingUrl: `\$\{APP_URL\}\/book`/)
})

test('email library has the buyer_invite and booking_confirmed kinds + templates', () => {
  const src = readFileSync('lib/email.ts', 'utf8')
  assert.match(src, /\| 'buyer_invite'/)
  assert.match(src, /\| 'booking_confirmed'/)
  assert.match(src, /buyerInvite\(opts:/)
  assert.match(src, /bookingConfirmed\(opts:/)
  assert.match(src, /case 'buyer_invite':/)
  assert.match(src, /case 'booking_confirmed':/)
})

test('public booking API creates a CRM appointment and confirms by email', () => {
  const src = readFileSync('app/api/public/book/route.ts', 'utf8')
  assert.match(src, /createBooking\(/)
  assert.match(src, /appointment_type: 'buyer'/)
  assert.match(src, /notify\('booking_confirmed'/)
  assert.match(src, /rateLimitAsync/)
  assert.match(src, /source: 'public_book'/)
})

test('public /book page posts to the booking API', () => {
  const src = readFileSync('app/book/page.tsx', 'utf8')
  assert.match(src, /fetch\('\/api\/public\/book'/)
  assert.match(src, /America\/New_York/)
  assert.match(src, /Confirm my call/)
})

test('buyer capture popup tells the visitor to expect the invite', () => {
  const src = readFileSync('components/public/BuyerCapturePrompt.tsx', 'utf8')
  assert.match(src, /Check your inbox for your invite/)
  assert.match(src, /we email your invite \+ matching listings only/)
})

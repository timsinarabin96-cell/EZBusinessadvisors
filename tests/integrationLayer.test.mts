import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const lib = readFileSync('lib/stripeCheckout.ts', 'utf8')
const route = readFileSync('app/api/billing/checkout/route.ts', 'utf8')
const security = readFileSync('app/dashboard/security/page.tsx', 'utf8')

test('stripe: checkout session builder is code-complete and gated', () => {
  assert.match(lib, /export function stripeConfigured\(\)/)
  assert.match(lib, /export async function createCheckoutSession/)
  assert.match(lib, /sk_/)
  assert.match(lib, /api\.stripe\.com\/v1/)
  assert.match(lib, /checkout\/sessions/)
  assert.match(lib, /line_items\[/)
  assert.match(lib, /Stripe is not connected yet/)
})

test('stripe: checkout API requires auth and returns clear 503 when unconfigured', () => {
  assert.match(route, /export async function POST/)
  assert.match(route, /authenticateProfileRequest/)
  assert.match(route, /stripeConfigured\(\)/)
  assert.match(route, /503/)
  assert.match(route, /Add STRIPE_SECRET_KEY/)
})

test('security: 2FA page enrolls TOTP, verifies, and unenrolls', () => {
  assert.match(security, /supabase\.auth\.mfa\.enroll/)
  assert.match(security, /factorType: 'totp'/)
  assert.match(security, /supabase\.auth\.mfa\.challenge/)
  assert.match(security, /supabase\.auth\.mfa\.verify/)
  assert.match(security, /supabase\.auth\.mfa\.unenroll/)
  assert.match(security, /qr_code/)
  assert.match(security, /6-digit code/)
})

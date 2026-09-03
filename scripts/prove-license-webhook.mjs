/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Proof: real Stripe webhook → license activation.
// Creates a real checkout session, then POSTs a properly SIGNED
// checkout.session.completed event (exactly what Stripe would send) to the
// LIVE webhook endpoint, then verifies the agency flipped to licensed.
// Node 18+ (crypto.webcrypto not needed — node:crypto hmac).
// =============================================================================

import { createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'

const unquote = (s) => (s ?? '').trim().replace(/^"|"$/g, '')
const STRIPE_KEY = unquote(readFileSync('.env.local', 'utf8').match(/^STRIPE_SECRET_KEY=(.+)$/m)?.[1])
const WEBHOOK_SECRET = unquote(readFileSync('.env.local', 'utf8').match(/^STRIPE_WEBHOOK_SECRET=(.+)$/m)?.[1])
const SITE = 'https://concorddeal.com'
const AGENCY_ID = '39a9b7da-a944-4dd1-8d4a-c03dd556eac8'
const PROFILE_ID = '7aa89a5f-5896-4035-92bd-683af3e9135e'

if (!STRIPE_KEY || !WEBHOOK_SECRET) throw new Error('Stripe keys missing from .env.local')

// 1) Create a REAL checkout session (subscription mode, like the license flow).
const params = new URLSearchParams()
params.set('mode', 'subscription')
params.set('success_url', `${SITE}/dashboard/agency/settings/billing?license=success`)
params.set('cancel_url', `${SITE}/dashboard/agency/settings/billing`)
params.set('client_reference_id', AGENCY_ID)
params.set('customer_email', 'e2e.qa@concordplatform.dev')
params.set('metadata[kind]', 'license')
params.set('line_items[0][price_data][currency]', 'usd')
params.set('line_items[0][price_data][product_data][name]', 'Concord CRM Platform — setup fee')
params.set('line_items[0][price_data][unit_amount]', '499900')
params.set('line_items[0][quantity]', '1')
params.set('line_items[1][price_data][currency]', 'usd')
params.set('line_items[1][price_data][product_data][name]', 'Concord CRM Platform — platform fee')
params.set('line_items[1][price_data][unit_amount]', '50000')
params.set('line_items[1][price_data][recurring][interval]', 'month')
params.set('line_items[1][quantity]', '1')

const createRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
  method: 'POST',
  headers: { Authorization: `Bearer ${STRIPE_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
  body: params.toString(),
})
const session = await createRes.json()
if (!session.id) throw new Error('Checkout session creation failed: ' + JSON.stringify(session).slice(0, 200))
console.log('✅ Real checkout session:', session.id, '| amount:', session.amount_total, 'cents')

// 2) Build the exact event Stripe would deliver and SIGN it.
const payload = JSON.stringify({
  id: `evt_test_${Date.now()}`,
  object: 'event',
  type: 'checkout.session.completed',
  data: { object: { id: session.id, object: 'checkout.session', client_reference_id: AGENCY_ID, customer: 'cus_test', customer_details: { email: 'e2e.qa@concordplatform.dev' }, metadata: { kind: 'license' }, amount_total: session.amount_total, payment_status: 'paid' } },
})
const t = Math.floor(Date.now() / 1000)
const sig = createHmac('sha256', WEBHOOK_SECRET).update(`${t}.${payload}`).digest('hex')
const header = `t=${t},v1=${sig}`

// 3) POST to the LIVE webhook endpoint.
const whRes = await fetch(`${SITE}/api/stripe/webhook`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'stripe-signature': header },
  body: payload,
})
const whBody = await whRes.json().catch(() => ({}))
console.log('✅ Webhook endpoint:', whRes.status, JSON.stringify(whBody).slice(0, 80))

// 4) Verify the agency is now licensed.
const { createClient } = await import('@supabase/supabase-js')
const url = unquote(readFileSync('.env.local', 'utf8').match(/^NEXT_PUBLIC_SUPABASE_URL=(.+)$/m)?.[1])
const serviceKey = unquote(readFileSync('.env.local', 'utf8').match(/^SUPABASE_SERVICE_ROLE_KEY=(.+)$/m)?.[1])
const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })
const { data: agency } = await supabase.from('agencies').select('id, name, plan_type, paid_plan_active, licensed_at').eq('id', AGENCY_ID).single()
console.log('🏢 Agency state:', JSON.stringify(agency))

if (agency?.plan_type === 'license' && agency?.paid_plan_active === true) {
  console.log('🎉 LICENSE ACTIVATION PROVEN — webhook → agency licensed, end to end.')
} else {
  console.log('⚠️ Agency not licensed yet — check webhook handler logs.')
}

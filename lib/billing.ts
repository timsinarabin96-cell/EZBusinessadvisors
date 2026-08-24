// =============================================================================
// Subscription billing — tiers, plans, and management.
// Integrates with Stripe (schema in sql/phase2_schema.sql). Checkout calls are
// structured to hit a real Stripe Checkout session; the createBillingSession
// helper is where you wire your publishable key / server endpoint.
// =============================================================================

import { supabase } from '@/lib/supabase/client'

// --- Plan definitions ---
export interface Plan {
  id: string
  name: string
  monthly: number
  icon: string
  tagline: string
  features: string[]
  cta: string
  highlighted?: boolean
}

export const PLANS: Plan[] = [
  {
    id: 'free',
    name: 'Owner',
    monthly: 0,
    icon: '🔑',
    tagline: 'For business owners — list your business for sale',
    features: [
      '1 active listing on the marketplace',
      'Login + add your listing',
      'Buyer inquiry notifications',
      'No CRM system',
    ],
    cta: 'Get Started Free',
  },
  {
    id: 'professional',
    name: 'Professional',
    monthly: 49,
    icon: '💼',
    tagline: 'For brokerages posting on our marketplace',
    highlighted: true,
    features: [
      '10 active listings on our site',
      '5 agent seats',
      'Deal pipeline (1 board)',
      'Lead management',
      'CIM & BOV generation',
      'Email support',
    ],
    cta: 'Start Free Trial',
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    monthly: 99,
    icon: '🏛️',
    tagline: 'For larger teams and agencies',
    features: [
      '20 active listings on our site',
      '10 agent seats',
      'Everything in Professional',
      'Financial recasting engine',
      'Priority support',
    ],
    cta: 'Start Free Trial',
  },
]

// ---------------------------------------------------------------------------
// Full CRM platform — sold as a separate product (not a subscription tier).
// One-time license + monthly platform fee; the buyer covers all API token
// usage and third-party costs (AI, Plaid, storage, etc.).
// ---------------------------------------------------------------------------
export const CRM_LICENSE = {
  name: 'Concord CRM Platform',
  setupFee: 4999,
  monthly: 500,
  includes: [
    'Full CRM system (deal pipeline, leads, CIM/BOV, recasting)',
    'AI agents (DeepSeek/Claude via your own API keys)',
    'White-label branding & your own subdomain',
    'Buyer portal, NDA workflow, documents, e-sign',
    'Own Supabase + storage (you pay infrastructure)',
    'All API token costs billed to you',
  ],
} as const

export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled'

export interface Subscription {
  id: string
  profile_id: string
  agency_id: string | null
  tier: string
  stripe_customer: string | null
  stripe_sub: string | null
  status: SubscriptionStatus
  current_period_end: string | null
  trial_end: string | null
  seats: number
  created_at?: string | null
}

export interface Invoice {
  id: string
  subscription_id: string | null
  profile_id: string | null
  amount: number
  currency: string
  stripe_invoice: string | null
  status: string
  pdf_url: string | null
  due_date: string | null
  paid_at: string | null
  created_at?: string | null
}

export const canAccessFeature = (sub: Subscription | null, tierMinimum: 'free' | 'professional' | 'enterprise'): boolean => {
  if (!sub) return false
  if (sub.status !== 'active' && sub.status !== 'trialing') return false
  const order = { free: 0, professional: 1, enterprise: 2 }
  return order[sub.tier as keyof typeof order] >= order[tierMinimum]
}

// When the `subscriptions` table is absent (pre-schema-stabilization), queries
// fail with a relation-missing PostgREST error. Degrade gracefully instead of
// throwing so onboarding/billing UI never hard-crashes.
const isRelationMissing = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && !!((err as { message?: string }).message ?? '').match(/relation .* does not exist|Could not find the table/i)

export const SUBSCRIPTIONS_MISSING = Symbol('SUBSCRIPTIONS_MISSING')

// --- Fetch current subscription ---
export async function fetchMySubscription(): Promise<Subscription | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data, error } = await supabase.from('subscriptions').select('*').eq('profile_id', user.id).maybeSingle()
  // If the table doesn't exist yet, treat as "no subscription" (graceful).
  if (isRelationMissing(error)) return null
  if (error || !data) return null
  return data as Subscription
}

// --- Fetch invoices ---
export async function fetchMyInvoices(): Promise<Invoice[]> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data, error } = await supabase.from('invoices').select('*').eq('profile_id', user.id).order('created_at', { ascending: false }).limit(50)
  if (error || !data) return []
  return data as Invoice[]
}

// --- Start trial / subscribe (Upsert into subscriptions table) ---
export async function subscribeToTier(tier: string, email: string): Promise<Subscription> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('You must be signed in to subscribe')

  const trialEnd = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('subscriptions')
    .upsert({
      profile_id: user.id,
      agency_id: null,
      tier,
      status: 'trialing',
      trial_end: trialEnd,
      seats: 1,
    }, { onConflict: 'profile_id' })
    .select()
    .single()

  if (error) throw new Error(error.message || 'Failed to start subscription')
  return data as Subscription
}

export async function cancelSubscription(): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  const { error } = await supabase.from('subscriptions').update({ status: 'canceled' }).eq('profile_id', user.id)
  if (error) throw new Error(error.message || 'Failed to cancel subscription')
}

export async function upgradeTier(tier: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('You must be signed in')
  const { error } = await supabase.from('subscriptions').update({ tier, status: 'active' }).eq('profile_id', user.id)
  if (error) throw new Error(error.message || 'Failed to upgrade plan')
}

// --- Stripe Checkout (real payments, graceful demo fallback) ---
/**
 * Creates a Stripe Checkout session for the tier via /api/stripe/checkout.
 * Free tier records directly (no payment). Paid tiers go to real Stripe
 * Checkout when STRIPE_SECRET_KEY is set; otherwise the API falls back to
 * recording the subscription so the flow never hard-fails.
 */
export async function createBillingSession(tier: string): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser()
  const email = user?.email || ''

  // Free tier — no payment needed.
  if (tier === 'free') {
    await subscribeToTier(tier, email)
    return '/billing?checkout=success&tier=free'
  }

  // Paid tiers — real Stripe Checkout (or demo fallback server-side).
  try {
    const res = await fetch('/api/stripe/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tier, email }),
    })
    const j = await res.json()
    if (j.ok && j.url) return j.url
  } catch {
    // Fall through to local recording.
  }
  await subscribeToTier(tier, email)
  return `/billing?checkout=success&tier=${tier}`
}

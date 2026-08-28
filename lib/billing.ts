/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Subscription billing — tiers, plans, and management.
// Integrates with Stripe (schema in sql/phase2_schema.sql). Checkout calls are
// structured to hit a real Stripe Checkout session; the createBillingSession
// helper is where you wire your publishable key / server endpoint.
// =============================================================================

import { supabase } from '@/lib/supabase/client'
import { CRM_PLANS, CRM_LICENSE, OWNER_LISTING_PLANS } from '@/lib/pricing'

// --- Plan definitions (single source of truth: lib/pricing.ts) -------------
export interface Plan {
  id: string
  name: string
  monthly: number
  annual: number
  icon: string
  tagline: string
  features: string[]
  cta: string
  highlighted?: boolean
  listings?: number // active marketplace listings included in the tier
  seats?: number    // agent seats included in the tier
}

// Backward-compatible re-export — ALL prices now live in lib/pricing.ts so
// the $499/mo CRM price can never drift between surfaces.
export const PLANS: Plan[] = CRM_PLANS.map(({ id, name, monthly, annual, icon, tagline, features, cta, highlighted, listings, seats }) => ({
  id, name, monthly, annual, icon, tagline, features, cta, highlighted, listings, seats,
}))

export { CRM_LICENSE, OWNER_LISTING_PLANS }
export { CRM_MONTHLY, CRM_ANNUAL, CRM_ENTERPRISE_MONTHLY, CRM_ENTERPRISE_ANNUAL, LICENSE_SETUP_FEE, LICENSE_MONTHLY } from '@/lib/pricing'

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

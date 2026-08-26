/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// AI Match Pass — buyer subscription product ($49 / $99 per month).
// Buyers pay for: priority deal alerts, off-market listings access, AI
// fit-scoring depth, and a verified-buyer badge. Separate from brokerage
// SaaS plans (subscriptions table) — buyers aren't agencies.
// =============================================================================

import { supabase } from '@/lib/supabase/client'

export interface BuyerPassPlan {
  id: string
  name: string
  monthly: number
  icon: string
  tagline: string
  features: string[]
  cta: string
  highlighted?: boolean
}

export const BUYER_PASS_PLANS: BuyerPassPlan[] = [
  {
    id: 'match_pass',
    name: 'Match Pass',
    monthly: 49,
    icon: '🎯',
    tagline: 'For serious buyers',
    highlighted: true,
    features: [
      'Priority deal alerts (instant email)',
      'AI fit-scoring on every listing',
      'Off-market listing access',
      'Verified Buyer badge',
      'Unlimited saved searches & bookmarks',
      'Deal comparison tools',
    ],
    cta: 'Start Match Pass',
  },
  {
    id: 'match_pass_elite',
    name: 'Match Pass Elite',
    monthly: 99,
    icon: '💎',
    tagline: 'For active acquirers',
    features: [
      'Everything in Match Pass',
      'First look at new listings (24h early)',
      'Broker-introduced off-market deals',
      'Priority NDA processing',
      'Dedicated acquisition support',
    ],
    cta: 'Go Elite',
  },
]

export interface BuyerSubscription {
  id: string
  profile_id: string
  tier: string
  status: string
  stripe_customer: string | null
  stripe_sub: string | null
  current_period_end: string | null
  trial_end: string | null
}

export const BUYER_PASS_ORDER: Record<string, number> = { match_pass: 1, match_pass_elite: 2 }

/** True when the buyer has an active (or trialing) Match Pass. */
export function isBuyerPassActive(sub: BuyerSubscription | null): boolean {
  if (!sub) return false
  return sub.status === 'active' || sub.status === 'trialing'
}

/** Highest pass tier the buyer holds ('match_pass' | 'match_pass_elite' | null). */
export function buyerPassTier(sub: BuyerSubscription | null): string | null {
  if (!isBuyerPassActive(sub)) return null
  return sub.tier
}

/** Fetch the current user's Match Pass subscription (or null). */
export async function fetchMyBuyerPass(): Promise<BuyerSubscription | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data, error } = await supabase
    .from('buyer_subscriptions')
    .select('*')
    .eq('profile_id', user.id)
    .maybeSingle()
  if (error || !data) return null
  return data as BuyerSubscription
}

/** Start a Match Pass (trial or direct). Upsert per profile. */
export async function subscribeToBuyerPass(tier: string): Promise<BuyerSubscription> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('You must be signed in to subscribe')
  const trialEnd = new Date(Date.now() + 14 * 86400000).toISOString()
  const { data, error } = await supabase
    .from('buyer_subscriptions')
    .upsert({
      profile_id: user.id,
      tier,
      status: 'trialing',
      trial_end: trialEnd,
    }, { onConflict: 'profile_id' })
    .select()
    .single()
  if (error) throw new Error(error.message || 'Failed to start Match Pass')
  return data as BuyerSubscription
}

/** Create a Stripe Checkout session for a Match Pass tier (demo fallback). */
export async function createBuyerPassSession(tier: string): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser()
  const email = user?.email || ''
  const plan = BUYER_PASS_PLANS.find((p) => p.id === tier)
  if (!plan) return '/dashboard/buyer'
  try {
    const res = await fetch('/api/stripe/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tier, email, product: 'buyer_pass' }),
    })
    const j = await res.json()
    if (j.ok && j.url) return j.url
  } catch { /* fall through */ }
  await subscribeToBuyerPass(tier)
  return '/dashboard/buyer?checkout=success'
}

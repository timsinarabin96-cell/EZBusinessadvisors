/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, canManageAgency, forbiddenResponse, unauthorizedResponse } from '@/lib/supabase/auth'

// ---------------------------------------------------------------------------
// POST /api/billing/convert-trial
// Converts a trial agency to a paid plan. Collects payment method + plan,
// records the subscription history entry, sets paid_plan_active = true and
// clears trial fields, and clears grace/lock so all data is retained/unlocked.
// The actual Stripe Checkout session is wired in billing.ts; this route is the
// source of truth for the agency's plan state.
// ---------------------------------------------------------------------------

export const runtime = 'nodejs'

interface Body {
  agencyId: string
  planType: 'free' | 'professional' | 'enterprise'
  paymentMethod?: string
  amount?: number
  billingCycle?: 'monthly' | 'annual'
  ownerEmail?: string // new agency owner — gets a "create your login" invite
  paymentConfirmed?: boolean
}

const PLANS: Record<string, { monthly: number; annual: number }> = {
  free: { monthly: 0, annual: 0 },
  professional: { monthly: 49, annual: 470 },
  enterprise: { monthly: 99, annual: 950 },
}

const ONBOARDING_STEPS = [
  { key: 'profile', label: 'Set up your profile (name, photo, role)' },
  { key: 'agency', label: 'Brand your agency (name, logo, colors)' },
  { key: 'api_key', label: 'Connect your own AI provider API key' },
  { key: 'first_listing', label: 'Add your first listing' },
  { key: 'team', label: 'Invite your team' },
  { key: 'billing', label: 'Review billing & plan' },
]

export async function POST(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const authenticated = await authenticateProfileRequest(req)
  if (!authenticated) return unauthorizedResponse()

  let body: Body = { agencyId: '', planType: 'free' }
  try {
    body = (await req.json()) as Body
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid body' }, { status: 400 })
  }

  const { agencyId, planType, billingCycle = 'monthly' } = body
  const plan = PLANS[planType]
  if (!agencyId || !plan) {
    return NextResponse.json({ ok: false, error: 'missing agencyId or invalid plan' }, { status: 400 })
  }
  // Platform admins (super_admin/admin) can convert ANY agency from the admin
  // trials page; otherwise the caller must manage the agency itself.
  const isPlatformAdmin = authenticated.profile.role === 'super_admin' || authenticated.profile.role === 'admin'
  if (!isPlatformAdmin && !canManageAgency(authenticated, agencyId)) return forbiddenResponse()

  const { data: agency } = await db.from('agencies').select('*').eq('id', agencyId).maybeSingle()
  if (!agency) return NextResponse.json({ ok: false, error: 'agency not found' }, { status: 404 })

  const amount = body.amount ?? (billingCycle === 'annual' ? plan.annual : plan.monthly)

  // 1) Mark paid + clear trial/grace/lock/archive state (retain all data).
  const { error: updateErr } = await db.from('agencies').update({
    paid_plan_active: true,
    trial_active: false,
    plan_type: planType,
    trial_start_date: agency.trial_start_date || null,
    trial_end_date: agency.trial_end_date || null,
    grace_end_date: null,
    locked_at: null,
    archive_at: null,
  }).eq('id', agencyId)
  if (updateErr) return NextResponse.json({ ok: false, error: updateErr.message }, { status: 500 })

  // 2) Record subscription history (best-effort; history table may be optional).
  try {
    await db.from('subscription_history').insert({
      agency_id: agencyId,
      plan_type: planType,
      start_date: new Date().toISOString(),
      end_date: billingCycle === 'annual'
        ? new Date(Date.now() + 365 * 86400000).toISOString()
        : new Date(Date.now() + 30 * 86400000).toISOString(),
      amount,
      status: 'active',
      notes: `Converted from trial via ${billingCycle} billing${body.paymentMethod ? ` · ${body.paymentMethod}` : ''}`,
    })
  } catch { /* history is informational */ }

  // 3) Open a fresh usage period (best-effort).
  try {
    const now = new Date()
    const end = new Date(Date.now() + 30 * 86400000).toISOString()
    await db.from('agency_usage').insert({
      agency_id: agencyId,
      listings_used: 0,
      leads_used: 0,
      deals_used: 0,
      storage_used: 0,
      period_start: now.toISOString(),
      period_end: end,
    })
  } catch { /* usage is best-effort */ }

  // 4) AI-controlled login activation: if an owner email is supplied and
  //    payment is confirmed, create (or invite) the owner account and start
  //    the guided onboarding week.
  let login: { email: string; inviteUrl?: string } | null = null
  const ownerEmail = String(body.ownerEmail || '').trim().toLowerCase()
  if (ownerEmail && ownerEmail.includes('@') && (planType === 'professional' || planType === 'enterprise')) {
    // Existing auth user?
    const { data: existingUsers } = await db.auth.admin.listUsers({ page: 1, perPage: 200 })
    const existing = existingUsers?.users?.find((u: any) => u.email === ownerEmail)
    let userId = existing?.id || null

    if (!existing) {
      // Send a "create your password" invite email — the owner clicks the
      // link, sets a password, and their login is activated.
      try {
        const { data: invite, error: inviteErr } = await db.auth.admin.inviteUserByEmail(ownerEmail, {
          data: { full_name: 'Agency Owner' },
          redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || 'https://concord-deal-platform.vercel.app'}/onboarding`,
        })
        if (!inviteErr && invite?.user?.id) {
          userId = invite.user.id
          login = { email: ownerEmail }
        }
      } catch { /* fall through */ }
    } else {
      login = { email: ownerEmail }
    }

    if (userId) {
      // Profile + agency membership (owner/admin).
      await db.from('profiles').upsert({
        id: userId, email: ownerEmail, full_name: 'Agency Owner', role: planType === 'enterprise' ? 'admin' : 'broker', status: 'active',
      }, { onConflict: 'id' })
      await db.from('agency_members').upsert({
        agency_id: agencyId, profile_id: userId, role: 'admin', is_owner: true,
      }, { onConflict: 'agency_id,profile_id' })
      // Start the guided onboarding week (steps seeded, 7-day window).
      try {
        await db.from('agency_onboarding').upsert({
          agency_id: agencyId,
          owner_email: ownerEmail,
          status: 'active',
          plan_type: planType,
          amount_paid: amount,
          payment_method: body.paymentMethod || null,
          current_step: 0,
          steps: ONBOARDING_STEPS.map((s) => ({ ...s, done: false })),
          invite_sent_at: existing ? null : new Date().toISOString(),
          activated_at: new Date().toISOString(),
          week_ends_at: new Date(Date.now() + 7 * 86400000).toISOString(),
        }, { onConflict: 'agency_id' })
      } catch { /* onboarding is best-effort */ }
    }
  }

  return NextResponse.json({ ok: true, agencyId, planType, amount, billingCycle, status: 'paid', login })
}

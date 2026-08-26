/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { isPlatformAdmin } from '@/lib/platform'

export const runtime = 'nodejs'

// =============================================================================
// GET /api/admin/charts — revenue & growth series for the admin dashboard.
// Last 12 months: signups, listings created, MRR, success fees, expenses.
// Super admin only.
// =============================================================================

const TIER_MRR: Record<string, number> = { free: 0, starter: 0, professional: 4900, enterprise: 9900, license: 50000 }

export async function GET(req: NextRequest) {
  if (!(await isPlatformAdmin(req))) {
    return NextResponse.json({ ok: false, error: 'Platform admin access only' }, { status: 403 })
  }
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  const months = 12
  const now = new Date()
  const buckets: { key: string; label: string }[] = []
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    buckets.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }) })
  }
  const index = new Map(buckets.map((b, i) => [b.key, i]))

  const [profiles, listings, subs, fees, expenses] = await Promise.all([
    db.from('profiles').select('created_at').gte('created_at', buckets[0].key + '-01'),
    db.from('listings').select('created_at').gte('created_at', buckets[0].key + '-01'),
    db.from('subscriptions').select('tier, status, created_at, current_period_end'),
    db.from('deal_success_fees').select('fee_cents, status, created_at').gte('created_at', buckets[0].key + '-01'),
    db.from('expenses').select('amount_cents, expense_date').gte('expense_date', buckets[0].key + '-01'),
  ])

  const series = buckets.map((b) => ({ month: b.label, signups: 0, listings: 0, mrrCents: 0, feesCents: 0, expensesCents: 0 }))

  const monthOf = (iso: string | null | undefined) => (iso ? iso.slice(0, 7) : null)

  for (const p of profiles.data || []) {
    const k = monthOf(p.created_at)
    if (k && index.has(k)) series[index.get(k)!].signups++
  }
  for (const l of listings.data || []) {
    const k = monthOf(l.created_at)
    if (k && index.has(k)) series[index.get(k)!].listings++
  }
  for (const s of subs.data || []) {
    const k = monthOf(s.created_at)
    if (k && index.has(k) && (s.status === 'active' || s.status === 'trialing')) {
      series[index.get(k)!].mrrCents += TIER_MRR[s.tier] || 0
    }
  }
  for (const f of fees.data || []) {
    if (f.status === 'waived') continue
    const k = monthOf(f.created_at)
    if (k && index.has(k)) series[index.get(k)!].feesCents += Number(f.fee_cents || 0)
  }
  for (const e of expenses.data || []) {
    const k = monthOf(e.expense_date)
    if (k && index.has(k)) series[index.get(k)!].expensesCents += Number(e.amount_cents || 0)
  }

  const totals = series.reduce(
    (acc, s) => ({
      signups: acc.signups + s.signups,
      listings: acc.listings + s.listings,
      mrrCents: acc.mrrCents + s.mrrCents,
      feesCents: acc.feesCents + s.feesCents,
      expensesCents: acc.expensesCents + s.expensesCents,
    }),
    { signups: 0, listings: 0, mrrCents: 0, feesCents: 0, expensesCents: 0 }
  )

  return NextResponse.json({ ok: true, series, totals })
}

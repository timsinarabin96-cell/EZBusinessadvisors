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
// GET /api/admin/expenses/pnl?month=YYYY-MM — accountant-grade Profit & Loss.
// Revenue side: MRR (subscriptions), success fees, featured slots, buyer passes.
// Cost side: every expense line in the period. Returns net + margins + runway.
// =============================================================================

export async function GET(req: NextRequest) {
  if (!(await isPlatformAdmin(req))) {
    return NextResponse.json({ ok: false, error: 'Platform admin access only' }, { status: 403 })
  }
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  const now = new Date()
  const month = req.nextUrl.searchParams.get('month') || now.toISOString().slice(0, 7)
  const monthStart = `${month}-01`

  // ---- Revenue ----
  const [subs, successFees, featured, buyerPasses] = await Promise.all([
    db.from('subscriptions').select('tier, status, created_at'),
    db.from('deal_success_fees').select('amount_cents, paid_at, created_at').gte('created_at', monthStart),
    db.from('featured_slots').select('amount_cents, status, created_at').gte('created_at', monthStart),
    db.from('buyer_subscriptions').select('status, created_at').gte('created_at', monthStart),
  ])

  const activeSubs = (subs.data || []).filter((s: any) => s.status === 'active')
  const TIER_MONTHLY: Record<string, number> = { free: 0, professional: 4900, enterprise: 9900 }
  const mrrCents = activeSubs.reduce((sum: number, s: any) => sum + (TIER_MONTHLY[s.tier] || 0), 0)
  const successFeeCents = (successFees.data || []).reduce((sum: number, f: any) => sum + (f.amount_cents || 0), 0)
  const featuredCents = (featured.data || []).filter((f: any) => f.status === 'active' || f.status === 'paid')
    .reduce((sum: number, f: any) => sum + (f.amount_cents || 0), 0)
  const buyerPassCents = (buyerPasses.data || []).filter((b: any) => b.status === 'active')
    .length * 9900 // $99 pass (approx; schema stores in platform_settings if different)

  const revenueCents = mrrCents + successFeeCents + featuredCents + buyerPassCents

  // ---- Expenses ----
  const { data: expenses } = await db
    .from('expenses')
    .select('amount_cents, category, recurring, expense_date')
    .gte('expense_date', monthStart)

  const expenseRows = (expenses || []) as { amount_cents: number; category: string; recurring: boolean; expense_date: string }[]
  const totalExpenseCents = expenseRows.reduce((s, r) => s + (r.amount_cents || 0), 0)
  const recurringCents = expenseRows.filter((r) => r.recurring).reduce((s, r) => s + (r.amount_cents || 0), 0)
  const byCategory = new Map<string, number>()
  for (const r of expenseRows) byCategory.set(r.category, (byCategory.get(r.category) || 0) + (r.amount_cents || 0))

  // ---- Net + ratios ----
  const netCents = revenueCents - totalExpenseCents
  const margin = revenueCents > 0 ? netCents / revenueCents : 0
  // Runway: cash-on-hand placeholder — use recurring costs as burn if no balance stored.
  const burnCents = recurringCents > 0 ? recurringCents : totalExpenseCents
  const cashCents = 0 // wire platform_settings 'cash_balance_cents' later
  const runwayMonths = burnCents > 0 ? (cashCents > 0 ? cashCents / burnCents : null) : null

  const money = (c: number) => '$' + (c / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })

  return NextResponse.json({
    ok: true,
    month,
    monthLabel: new Date(month + '-01T12:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    revenue: {
      mrrCents, successFeeCents, featuredCents, buyerPassCents, totalCents: revenueCents,
      mrrLabel: money(mrrCents), successFeesLabel: money(successFeeCents),
      featuredLabel: money(featuredCents), buyerPassesLabel: money(buyerPassCents), totalLabel: money(revenueCents),
    },
    expenses: {
      totalCents: totalExpenseCents, recurringCents, totalLabel: money(totalExpenseCents), recurringLabel: money(recurringCents),
      byCategory: Array.from(byCategory.entries()).map(([category, cents]) => ({ category, cents, label: money(cents) })),
    },
    net: { cents: netCents, label: money(netCents), margin, marginLabel: (margin * 100).toFixed(0) + '%' },
    runway: { months: runwayMonths, cashCents, cashLabel: money(cashCents) },
  })
}

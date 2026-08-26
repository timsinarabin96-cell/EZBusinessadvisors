/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest } from '@/lib/supabase/auth'

export const runtime = 'nodejs'

// =============================================================================
// GET /api/expenses — tenant (agency) expense view.
// A sold CRM's owner/admin sees ONLY their own agency's expenses (their AI
// keys, their subscriptions) — never platform costs or other tenants.
// Scoped server-side by membership + RLS at the DB layer.
// =============================================================================

export async function GET(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

  const agencyIds = (auth.memberships || []).map((m) => m.agency_id)
  if (agencyIds.length === 0) {
    return NextResponse.json({ ok: true, expenses: [], summary: { total: 0, byCategory: {}, byVendor: {} }, agencies: [] })
  }

  const month = req.nextUrl.searchParams.get('month') || undefined
  let q = db
    .from('expenses')
    .select('*, agencies(name)')
    .in('agency_id', agencyIds)
    .order('expense_date', { ascending: false })
    .limit(500)
  if (month) q = q.gte('expense_date', `${month}-01`)

  const [{ data: expenses }, { data: agencies }] = await Promise.all([
    q,
    db.from('agencies').select('id, name').in('id', agencyIds),
  ])

  const rows = (expenses || []) as any[]
  const byCategory: Record<string, number> = {}
  const byVendor: Record<string, number> = {}
  let total = 0
  for (const e of rows) {
    const amount = Number(e.amount_cents || 0) / 100
    total += amount
    byCategory[e.category] = (byCategory[e.category] || 0) + amount
    byVendor[e.vendor] = (byVendor[e.vendor] || 0) + amount
  }

  return NextResponse.json({
    ok: true,
    expenses: rows,
    summary: {
      total: Math.round(total * 100) / 100,
      byCategory,
      byVendor,
    },
    agencies: agencies || [],
  })
}

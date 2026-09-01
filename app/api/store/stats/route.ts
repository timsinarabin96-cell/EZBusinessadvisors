/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, forbiddenResponse, unauthorizedResponse } from '@/lib/supabase/auth'

export const runtime = 'nodejs'

/**
 * GET /api/store/stats — owner/admin profit dashboard.
 * Revenue (sum sell), cost (sum cost), profit (revenue - cost), order count,
 * per-category breakdown, and the 10 most recent orders.
 */
export async function GET(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()
  if (!auth.memberships.some((m) => m.is_owner || m.role === 'admin')) {
    return forbiddenResponse('Owner access required for profit dashboard')
  }

  const { data: orders, error } = await db
    .from('store_orders')
    .select('*, product:store_products(*)')
    .order('created_at', { ascending: false })
    .limit(500)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  const rows = (orders || []) as any[]
  let revenue = 0, cost = 0, profit = 0
  const byCat = new Map<string, { category: string; revenue: number; cost: number; profit: number; orders: number }>()

  for (const o of rows) {
    if (o.status === 'cancelled') continue
    const rev = Number(o.subtotal || 0)
    const cst = Number(o.cost_total || 0)
    revenue += rev
    cost += cst
    profit += rev - cst
    const cat = String(o.product?.category || o.product_name || 'other')
    const cur = byCat.get(cat) || { category: cat, revenue: 0, cost: 0, profit: 0, orders: 0 }
    cur.revenue += rev
    cur.cost += cst
    cur.profit += rev - cst
    cur.orders += 1
    byCat.set(cat, cur)
  }

  return NextResponse.json({
    revenue: Math.round(revenue * 100) / 100,
    cost: Math.round(cost * 100) / 100,
    profit: Math.round(profit * 100) / 100,
    orderCount: rows.filter((o) => o.status !== 'cancelled').length,
    byCategory: [...byCat.values()].sort((a, b) => b.profit - a.profit),
    recent: rows.slice(0, 50),
  })
}

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
// GET /api/admin/expenses/export?format=qbo&month=YYYY-MM
// QuickBooks-ready CSV export of the expense ledger (platform admin only).
// Columns match QB import: Date, Payee, Memo, Account, Amount.
// =============================================================================

const ACCOUNT_BY_CATEGORY: Record<string, string> = {
  ai_api: 'AI & Software',
  hosting: 'Hosting',
  domain: 'Domains',
  sms_phone: 'Phone & SMS',
  email: 'Email',
  tools: 'Software & Tools',
  marketing: 'Marketing & Ads',
  subscriptions: 'Subscriptions',
  other: 'Other Expenses',
}

const csv = (v: unknown) => {
  const s = v == null ? '' : String(v)
  return `"${s.replace(/"/g, '""')}"`
}

export async function GET(req: NextRequest) {
  if (!(await isPlatformAdmin(req))) {
    return NextResponse.json({ ok: false, error: 'Platform admin access only' }, { status: 403 })
  }
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  const month = req.nextUrl.searchParams.get('month') || undefined
  const format = req.nextUrl.searchParams.get('format') || 'qbo'

  let q = db.from('expenses').select('*').order('expense_date', { ascending: true }).limit(5000)
  if (month) q = q.gte('expense_date', `${month}-01`)
  const { data, error } = await q
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  const rows = (data || []) as any[]

  if (format === 'qbo') {
    const header = 'Date,Payee,Memo,Account,Amount'
    const lines = rows.map((e) =>
      [e.expense_date, e.vendor, e.description || e.category, ACCOUNT_BY_CATEGORY[e.category] || 'Other Expenses', (Number(e.amount_cents) / 100).toFixed(2)].map(csv).join(','),
    )
    const body = [header, ...lines].join('\n')
    return new NextResponse(body, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="expenses-qbo${month ? '-' + month : ''}.csv"`,
      },
    })
  }

  // Plain JSON fallback
  return NextResponse.json({ ok: true, expenses: rows })
}

/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { isFinancialIntelligenceEnabled, financialAddonError } from '@/lib/financialAddon'

export const runtime = 'nodejs'

// =============================================================================
// /api/financial/ledger — multi-year normalized monthly P&L.
//   GET  ?listingId=… → monthly rows per fiscal year (RPC get_financial_ledger)
//   POST               → rebuild the ledger from the listing's extractions
//                        (approved/overridden first, then AI) using
//                        upsert_ledger_year RPC. This is what valuation, BOV,
//                        CIM and recast consume.
// Agency-gated.
// =============================================================================

const rebuildSchema = z.object({ listingId: z.string().uuid() })

async function listingAgencyId(db: ReturnType<typeof createServerClient>, listingId: string): Promise<string | null> {
  const { data: listing } = await db.from('listings').select('agency_id').eq('id', listingId).maybeSingle()
  return (listing as { agency_id?: string | null } | null)?.agency_id || null
}

async function agencyGate(db: ReturnType<typeof createServerClient>, userId: string, listingId: string): Promise<boolean> {
  if (!db) return false
  const { data: listing } = await db.from('listings').select('agency_id').eq('id', listingId).maybeSingle()
  const agencyId = (listing as { agency_id?: string | null } | null)?.agency_id
  if (!agencyId) return false
  const { data: memberships } = await db.from('agency_members').select('agency_id').eq('profile_id', userId)
  if ((memberships || []).some((m: { agency_id: string }) => m.agency_id === agencyId)) return true
  const { data: prof } = await db.from('profiles').select('role').eq('id', userId).maybeSingle()
  return prof?.role === 'admin' || prof?.role === 'super_admin'
}

export async function GET(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || ''
  const { data: auth } = await db.auth.getUser(token)
  if (!auth?.user) return NextResponse.json({ ok: false, error: 'Authentication required' }, { status: 401 })

  const listingId = req.nextUrl.searchParams.get('listingId')
  if (!listingId) return NextResponse.json({ ok: false, error: 'listingId required' }, { status: 400 })
  if (!(await agencyGate(db, auth.user.id, listingId))) {
    return NextResponse.json({ ok: false, error: 'Not a member of this listing\'s agency' }, { status: 403 })
  }
  if (!(await isFinancialIntelligenceEnabled(await listingAgencyId(db, listingId), null))) {
    return NextResponse.json(financialAddonError(), { status: 403 })
  }

  const { data, error } = await db.rpc('get_financial_ledger', { p_listing_id: listingId })
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, rows: data || [] })
}

export async function POST(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || ''
  const { data: auth } = await db.auth.getUser(token)
  if (!auth?.user) return NextResponse.json({ ok: false, error: 'Authentication required' }, { status: 401 })

  const parsed = rebuildSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Validation failed: listingId (uuid) required.' }, { status: 422 })
  }
  const { listingId } = parsed.data
  if (!(await agencyGate(db, auth.user.id, listingId))) {
    return NextResponse.json({ ok: false, error: 'Not a member of this listing\'s agency' }, { status: 403 })
  }

  // Source of truth order: broker-overridden → approved → AI extraction.
  const { data: extractions } = await db
    .from('financial_extractions')
    .select('fiscal_year, confidence, extracted, broker_override, review_state')
    .eq('listing_id', listingId)
  const rows = (extractions || []) as Array<{
    fiscal_year: number | null
    extracted: Record<string, unknown> | null
    broker_override: Record<string, unknown> | null
    review_state: string
  }>

  // Aggregate per fiscal year: prefer override, then approved extraction.
  const byYear = new Map<number, { revenue: number; expenses: number; source: string }>()
  for (const ex of rows) {
    const year = ex.fiscal_year
    if (!year) continue
    const data = (ex.review_state === 'overridden' && ex.broker_override) ? ex.broker_override : (ex.extracted || {})
    const revenue = num(data.revenueTotal)
    const expenses = num(data.expenseTotal)
    if (!revenue && !expenses) continue
    const source = ex.review_state === 'overridden' ? 'override' : ex.review_state === 'approved' ? 'extraction' : 'extraction'
    const existing = byYear.get(year)
    if (!existing) {
      byYear.set(year, { revenue, expenses, source })
    } else {
      // Override beats extraction at the year level too.
      if (source === 'override' || existing.source !== 'override') {
        existing.revenue = revenue
        existing.expenses = expenses
        existing.source = existing.source === 'override' ? 'override' : source
      }
    }
  }

  let monthsWritten = 0
  for (const [year, v] of byYear) {
    const { data: res } = await db.rpc('upsert_ledger_year', {
      p_listing_id: listingId,
      p_fiscal_year: year,
      p_revenue: v.revenue,
      p_expenses: v.expenses,
      p_source: v.source,
    })
    monthsWritten += Number(res || 0)
  }

  // Read back the rebuilt ledger.
  const { data: rebuilt } = await db.rpc('get_financial_ledger', { p_listing_id: listingId })

  return NextResponse.json({ ok: true, monthsWritten, years: byYear.size, rows: rebuilt || [] })
}

function num(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

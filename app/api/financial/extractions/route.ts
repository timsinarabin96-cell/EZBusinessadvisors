/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { validationErrorJson } from '@/lib/friendlyValidation'
import { isFinancialIntelligenceEnabled, financialAddonError } from '@/lib/financialAddon'

export const runtime = 'nodejs'

// =============================================================================
// /api/financial/extractions — broker review/override of AI-extracted numbers.
//   GET  ?listingId=…  → every extraction for a listing (with doc + confidence)
//   POST               → approve (review_state=approved) or override numbers
//                        (broker_override jsonb becomes the source of truth)
// Agency-gated: caller must belong to the listing's agency.
// =============================================================================

const overrideSchema = z.object({
  extractionId: z.string().uuid(),
  action: z.enum(['approve', 'override']),
  // Override payload (action=override): corrected numbers the broker trusts.
  revenueTotal: z.number().optional(),
  expenseTotal: z.number().optional(),
  sde: z.number().optional(),
  ebitda: z.number().optional(),
  assets: z.number().optional(),
  liabilities: z.number().optional(),
  notes: z.string().max(1000).optional(),
})

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

  const { data, error } = await db
    .from('financial_extractions')
    .select('*, financial_documents(file_name, fiscal_year, category)')
    .eq('listing_id', listingId)
    .order('fiscal_year', { ascending: false })
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, extractions: data || [] })
}

export async function POST(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || ''
  const { data: auth } = await db.auth.getUser(token)
  if (!auth?.user) return NextResponse.json({ ok: false, error: 'Authentication required' }, { status: 401 })

  const parsed = overrideSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json(validationErrorJson(parsed.error), { status: 422 })
  }
  const { extractionId, action, ...rest } = parsed.data

  // Load the extraction to resolve its listing for the agency gate.
  const { data: ex } = await db.from('financial_extractions').select('listing_id').eq('id', extractionId).maybeSingle()
  if (!ex) return NextResponse.json({ ok: false, error: 'Extraction not found' }, { status: 404 })
  if (!(await agencyGate(db, auth.user.id, (ex as { listing_id: string }).listing_id))) {
    return NextResponse.json({ ok: false, error: 'Not a member of this listing\'s agency' }, { status: 403 })
  }

  if (action === 'approve') {
    const { error } = await db.from('financial_extractions').update({
      review_state: 'approved',
      reviewed_by: auth.user.id,
      reviewed_at: new Date().toISOString(),
    }).eq('id', extractionId)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, review_state: 'approved' })
  }

  // Override: the broker's corrected numbers become the source of truth.
  const override: Record<string, unknown> = {}
  if (rest.revenueTotal !== undefined) override.revenueTotal = rest.revenueTotal
  if (rest.expenseTotal !== undefined) override.expenseTotal = rest.expenseTotal
  if (rest.sde !== undefined) override.sde = rest.sde
  if (rest.ebitda !== undefined) override.ebitda = rest.ebitda
  if (rest.assets !== undefined) override.assets = rest.assets
  if (rest.liabilities !== undefined) override.liabilities = rest.liabilities
  if (rest.notes !== undefined) override.notes = rest.notes

  const { error } = await db.from('financial_extractions').update({
    review_state: 'overridden',
    broker_override: override,
    reviewed_by: auth.user.id,
    reviewed_at: new Date().toISOString(),
  }).eq('id', extractionId)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, review_state: 'overridden', broker_override: override })
}

/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, forbiddenResponse, unauthorizedResponse } from '@/lib/supabase/auth'
import { resolveAgencyBranding } from '@/lib/agencyBranding'
import {
  composeDemandLetter,
  createDemandLetter,
  listDemandLetters,
  type DemandLetterNiche,
  type DemandLetterStatus,
  type LetterTarget,
} from '@/lib/demandLetters'

export const runtime = 'nodejs'

const NICHES: DemandLetterNiche[] = ['gas_station', 'nemt']
const STATUSES: DemandLetterStatus[] = ['draft', 'ready', 'archived']

/**
 * Demand Letter API
 * GET  /api/demand-letters?agencyId=...            — list drafts for agency
 * POST /api/demand-letters                         — compose + save a draft
 *   body: { agencyId?, niche, status, recipientName?, businessName?, location? }
 * Letter is composed SERVER-SIDE with the agency's own branding; nothing is
 * emailed. Status default 'draft'.
 */
export async function GET(req: NextRequest) {
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()
  const agencyId = req.nextUrl.searchParams.get('agencyId') || auth.memberships[0]?.agency_id
  if (!agencyId) return NextResponse.json({ ok: false, error: 'No agency membership' }, { status: 403 })
  const letters = await listDemandLetters(agencyId)
  return NextResponse.json({ ok: true, letters })
}

export async function POST(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const body = await req.json().catch(() => ({}))
  const agencyId = body.agencyId || auth.memberships[0]?.agency_id
  if (!agencyId) return NextResponse.json({ ok: false, error: 'No agency membership' }, { status: 403 })
  const member = auth.memberships.find((m) => m.agency_id === agencyId)
  if (!member) return forbiddenResponse()

  const niche: DemandLetterNiche = NICHES.includes(body.niche) ? body.niche : 'gas_station'
  const status: DemandLetterStatus = STATUSES.includes(body.status) ? body.status : 'draft'

  // Compose with the agency's REAL identity (never hardcoded).
  const brand = await resolveAgencyBranding(agencyId)
  const target: LetterTarget = {
    recipientName: body.recipientName || undefined,
    businessName: body.businessName || undefined,
    location: body.location || undefined,
  }
  const { subject, body: letterBody } = composeDemandLetter(niche, target, {
    agencyName: brand.displayName || brand.legalName,
    brokerName: brand.signingName || null,
    phone: brand.phone,
    email: brand.email,
  })

  const row = await createDemandLetter({
    agencyId,
    createdBy: auth.user.id,
    niche,
    status,
    target,
    subject,
    body: letterBody,
  })
  if (!row) return NextResponse.json({ ok: false, error: 'Could not save letter' }, { status: 500 })
  return NextResponse.json({ ok: true, letter: row })
}

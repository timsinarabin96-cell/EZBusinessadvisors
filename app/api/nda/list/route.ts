/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, canManageTeam, unauthorizedResponse } from '@/lib/supabase/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NDA_TEMPLATE_ID = 'd119a19b-8f74-43b6-8ed9-719e334b9391'

/**
 * GET /api/nda/list — NDAs visible to the caller.
 *
 * Tenant-walled (agency_id), then role-scoped inside the tenant:
 *   - agent            → only NDAs on listings they own (agent_id = me)
 *   - broker/admin/owner → every NDA in the agency
 * Agents from the same agency can never see each other's storage.
 */
export async function GET(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const agencyIds = auth.memberships.map((m) => m.agency_id)
  if (agencyIds.length === 0) return NextResponse.json({ ok: true, ndas: [] })

  const { data: docs, error } = await db
    .from('documents')
    .select('id, title, status, listing_id, deal_id, parties, created_at, updated_at, filled_data, listings(agency_id, agent_id, business_name)')
    .eq('template_id', NDA_TEMPLATE_ID)
    .order('created_at', { ascending: false })
    .limit(300)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  // Tenant wall + role scoping in one pass.
  const visible: any[] = []
  for (const d of docs || []) {
    const listing = (Array.isArray(d.listings) ? d.listings[0] : d.listings) as { agency_id: string | null; agent_id?: string | null; business_name?: string | null } | null
    if (!listing || !listing.agency_id || !agencyIds.includes(listing.agency_id)) continue
    if (canManageTeam(auth, listing.agency_id)) {
      visible.push(d) // broker/admin/owner: whole agency
    } else if (listing.agent_id && listing.agent_id === auth.user.id) {
      visible.push(d) // agent: own listings only
    }
  }

  // Signing status per document.
  const ids = visible.map((d) => d.id)
  let links: any[] = []
  if (ids.length) {
    const { data } = await db.from('document_signing_links').select('document_id, party_key, party_name, status, signed_at').in('document_id', ids)
    links = (data || []) as any[]
  }
  const byDoc: Record<string, any[]> = {}
  for (const l of links) {
    ;(byDoc[l.document_id] ||= []).push(l)
  }

  const ndas = visible.map((d) => {
    const listing = d.listings as { business_name?: string | null } | null
    const parties = (d.parties || []) as Array<{ key: string; name?: string | null; email?: string | null }>
    const buyer = parties.find((p) => p.key === 'buyer')
    const signers = byDoc[d.id] || []
    const buyerSigned = signers.some((s) => s.party_key === 'buyer' && s.status === 'signed')
    const brokerSigned = signers.some((s) => s.party_key === 'broker' && s.status === 'signed')
    return {
      id: d.id,
      title: d.title,
      status: d.status,
      business_name: listing?.business_name || null,
      listing_id: d.listing_id,
      deal_id: d.deal_id,
      buyer_name: buyer?.name || null,
      buyer_email: buyer?.email || null,
      created_at: d.created_at,
      updated_at: d.updated_at,
      buyer_signed: buyerSigned,
      broker_signed: brokerSigned,
      fully_signed: d.status === 'signed',
      signers: signers.map((s) => ({ party_key: s.party_key, party_name: s.party_name, status: s.status, signed_at: s.signed_at })),
    }
  })

  return NextResponse.json({ ok: true, ndas })
}

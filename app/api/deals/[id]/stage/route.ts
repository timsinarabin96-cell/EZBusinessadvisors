import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, canAccessProfile, forbiddenResponse, unauthorizedResponse } from '@/lib/supabase/auth'
import { recordCommission } from '@/lib/commissions'

export const runtime = 'nodejs'

/**
 * POST /api/deals/[id]/stage  { stage: DealStage }
 * Server-side deal stage change. When a deal moves to `closed`, this
 * AUTO-RECORDS the commission: purchase_price × fee_rate × agent split
 * (fee rate defaults to 10%, agent split from the listing's
 * commission_split_agent, else 70%). Idempotent per deal — a closed deal
 * already carrying a commission record won't double-record.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const dealId = params.id
  if (!dealId) return NextResponse.json({ ok: false, error: 'deal id is required' }, { status: 400 })

  const body = await req.json().catch(() => ({}))
  const stage = String(body.stage || '')
  const VALID = ['letter_of_intent', 'under_contract', 'due_diligence', 'closing', 'closed']
  if (!VALID.includes(stage)) {
    return NextResponse.json({ ok: false, error: `stage must be one of ${VALID.join('|')}` }, { status: 400 })
  }

  // Load the deal + its listing (agency + split + price) server-side.
  const { data: deal } = await db
    .from('deals')
    .select('id, listing_id, purchase_price, agency_id, listings(agency_id, commission_split_agent, commission_split_brokerage, asking_price)')
    .eq('id', dealId)
    .maybeSingle()
  if (!deal) return NextResponse.json({ ok: false, error: 'Deal not found' }, { status: 404 })

  const listing = (deal as any).listings as
    | { agency_id?: string | null; commission_split_agent?: number | null; commission_split_brokerage?: number | null; asking_price?: number | null }
    | null
  const agencyId = (deal as any).agency_id || listing?.agency_id || auth.memberships[0]?.agency_id
  if (!agencyId) return forbiddenResponse('No agency on this deal')

  // Update the stage.
  const { error: updateErr } = await db.from('deals').update({ status: stage, updated_at: new Date().toISOString() }).eq('id', dealId)
  if (updateErr) return NextResponse.json({ ok: false, error: updateErr.message }, { status: 500 })

  // Auto-record commission on close (idempotent per deal).
  let commission: { ok: boolean; error?: string; data?: unknown; skipped?: boolean } = { ok: true, skipped: true }
  if (stage === 'closed') {
    const price = Number((deal as any).purchase_price ?? listing?.asking_price ?? 0)
    const feeRate = 10 // standard brokerage fee % — matches DealDetail economics
    const agentSplit = Number(listing?.commission_split_agent ?? 70) // default 70/30
    const fee = (price * feeRate) / 100
    const agentTake = (fee * agentSplit) / 100

    if (Number.isFinite(agentTake) && agentTake > 0) {
      // Dedupe: skip if this deal already has a commission record.
      const { data: existing } = await db
        .from('commission_records')
        .select('id')
        .eq('deal_id', dealId)
        .limit(1)
      if (!existing || existing.length === 0) {
        const result = await recordCommission({
          agencyId,
          listingId: (deal as any).listing_id || null,
          dealId,
          amount: Math.round(agentTake),
          commissionPct: feeRate,
          notes: `Auto-recorded on deal close — ${agentSplit}% agent split on ${feeRate}% fee (price ${Math.round(price).toLocaleString()})`,
        })
        commission = result
      }
    }
  }

  return NextResponse.json({ ok: true, stage, commission })
}

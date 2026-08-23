// =============================================================================
// Red-Flag Forensics — scans recast financials for sale-dress-up patterns
// -----------------------------------------------------------------------------
// Broker tooling: run a listing's recast financial history through the
// deterministic anomaly engine (lib/redFlagCore.mts) and get a risk report
// with flags, score, and a summary — before buyers or lenders do their own
// diligence. Advisory only: every flag means "verify this", not "it's fraud".
// =============================================================================

import { supabase } from '@/lib/supabase/client'
import { analyzeRedFlags, type RedFlagReport, type RedFlagInput } from '@/lib/redFlagCore.mts'

export { analyzeRedFlags, type RedFlagReport, type RedFlagInput }

export interface ListingFinancialSnapshot {
  listingId: string
  businessName: string | null
  years: {
    year: number
    label: string
    grossRevenue: number
    netIncome: number
    ownerComp: number
  }[]
  addBacks: {
    id: string
    category: string
    description: string
    amount: number
    recurring: boolean
    year: number
  }[]
  avgSDE: number | null
  avgEBITDA: number | null
}

/**
 * Load a listing's recast financial snapshot (financial_history + add_backs)
 * and run the red-flag engine. Returns null when there's no financial data.
 */
export async function forensicReportForListing(listingId: string): Promise<RedFlagReport | null> {
  const { data: listing } = await supabase
    .from('listings')
    .select('id, agency_id, business_name')
    .eq('id', listingId)
    .maybeSingle()
  if (!listing) return null

  const [{ data: history }, { data: addBacks }] = await Promise.all([
    supabase.from('financial_history').select('year, label, gross_revenue, net_income, owner_comp').eq('listing_id', listingId).order('year', { ascending: true }),
    supabase.from('recast_add_backs').select('id, category, description, amount, recurring, year').eq('listing_id', listingId),
  ])

  if (!history || history.length === 0) return null

  const years = history.map((h) => ({
    year: h.year,
    label: h.label || String(h.year),
    grossRevenue: Number(h.gross_revenue) || 0,
    netIncome: Number(h.net_income) || 0,
    ownerComp: Number(h.owner_comp) || 0,
  }))

  const addBackRows = (addBacks || []).map((a) => ({
    id: a.id,
    category: a.category,
    description: a.description || '',
    amount: Number(a.amount) || 0,
    recurring: !!a.recurring,
    year: a.year,
  }))

  const input: RedFlagInput = { businessName: listing.business_name, years, addBacks: addBackRows }
  return analyzeRedFlags(input)
}

/** Run forensics across all listings in my agency (dashboard feed). */
export async function forensicScanForAgency(): Promise<{ listingId: string; businessName: string | null; report: RedFlagReport }[]> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data: memberships } = await supabase.from('agency_members').select('agency_id').eq('profile_id', user.id).limit(1)
  const agencyId = memberships?.[0]?.agency_id
  if (!agencyId) return []

  const { data: listings } = await supabase
    .from('listings')
    .select('id, business_name')
    .eq('agency_id', agencyId)
    .order('created_at', { ascending: false })
    .limit(60)

  const results: { listingId: string; businessName: string | null; report: RedFlagReport }[] = []
  for (const l of listings || []) {
    const report = await forensicReportForListing(l.id)
    if (report) results.push({ listingId: l.id, businessName: l.business_name, report })
  }
  return results.sort((a, b) => b.report.score - a.report.score)
}

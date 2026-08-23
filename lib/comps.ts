// =============================================================================
// Comps Database — sold-deal comparables
// -----------------------------------------------------------------------------
// Track closed transactions per agency and aggregate valuation multiples by
// industry to inform BOVs and the valuation engine. Server-only, never throws.
// =============================================================================

import { createClient } from '@supabase/supabase-js'

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const svc =
  SUPABASE_URL && SERVICE_KEY
    ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
    : null

export interface CompInput {
  agency_id: string
  business_name: string
  industry?: string | null
  location?: string | null
  sale_price?: number | null
  revenue?: number | null
  sde?: number | null
  multiple?: number | null
  sold_at?: string | null
  notes?: string | null
}

/** Add a comp. If multiple is blank, compute sale_price / sde automatically. */
export async function addComp(input: CompInput): Promise<{ ok: boolean; error?: string; comp?: Record<string, unknown> }> {
  if (!svc) return { ok: false, error: 'Database is not configured' }
  if (!input.business_name) return { ok: false, error: 'business_name is required' }

  let multiple = input.multiple ?? null
  if (multiple == null && input.sale_price != null && input.sde) {
    multiple = Math.round((input.sale_price / input.sde) * 100) / 100
  }

  const { data, error } = await svc
    .from('sold_comps')
    .insert({
      agency_id: input.agency_id,
      business_name: input.business_name,
      industry: input.industry || null,
      location: input.location || null,
      sale_price: input.sale_price ?? null,
      revenue: input.revenue ?? null,
      sde: input.sde ?? null,
      multiple,
      sold_at: input.sold_at || null,
      notes: input.notes || null,
    })
    .select()
    .single()
  if (error) return { ok: false, error: error.message }
  return { ok: true, comp: data as Record<string, unknown> }
}

/** List comps for an agency (optionally filtered by industry). */
export async function listComps(agencyId: string, industry?: string): Promise<Record<string, unknown>[]> {
  if (!svc) return []
  let query = svc.from('sold_comps').select('*').eq('agency_id', agencyId)
  if (industry && industry !== 'all') query = query.eq('industry', industry)
  const { data } = await query.order('sold_at', { ascending: false }).limit(500)
  return (data || []) as Record<string, unknown>[]
}

/** Aggregate average multiples by industry for an agency. */
export async function multiplesByIndustry(agencyId: string): Promise<Record<string, unknown>[]> {
  if (!svc) return []
  const { data } = await svc
    .from('sold_comps')
    .select('industry, multiple, sale_price, sde')
    .eq('agency_id', agencyId)
    .not('multiple', 'is', null)
    .limit(1000)
  const byIndustry: Record<string, { sum: number; count: number; saleSum: number; sdeSum: number }> = {}
  for (const c of data || []) {
    const ind = (c.industry as string) || 'Other'
    const bucket = byIndustry[ind] || { sum: 0, count: 0, saleSum: 0, sdeSum: 0 }
    bucket.sum += Number(c.multiple) || 0
    bucket.count++
    bucket.saleSum += Number(c.sale_price) || 0
    bucket.sdeSum += Number(c.sde) || 0
    byIndustry[ind] = bucket
  }
  return Object.entries(byIndustry)
    .map(([industry, b]) => ({
      industry,
      avg_multiple: b.count ? Math.round((b.sum / b.count) * 100) / 100 : 0,
      count: b.count,
      avg_sale_price: b.count ? Math.round(b.saleSum / b.count) : 0,
    }))
    .sort((a, b) => (b as any).count - (a as any).count)
}

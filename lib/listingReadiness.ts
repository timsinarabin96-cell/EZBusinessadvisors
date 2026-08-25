// =============================================================================
// listingReadiness — client wrapper that assembles a listing snapshot from
// the database and scores it with the pure readiness core.
// =============================================================================

import { supabase } from '@/lib/supabase/client'
import { computeReadiness, type ListingSnapshot, type ReadinessResult } from '@/lib/listingReadinessCore.ts'

export { computeReadiness }
export type { ListingSnapshot, ReadinessResult, StepReadiness, StepStatus } from '@/lib/listingReadinessCore.ts'

/**
 * Fetch everything the readiness engine needs for one listing and score it.
 * Never throws — returns a degraded score on failure.
 */
export async function fetchListingReadiness(listingId: string): Promise<ReadinessResult> {
  const empty: ReadinessResult = {
    score: 0, grade: 'F',
    steps: [], blockers: ['Could not load listing data'],
    nextAction: 'Reload the listing', canPublish: false, isListed: false,
  }
  if (!listingId) return empty

  try {
    const [listingRes, wfRes, docsRes, finRes, recastRes, bovRes, cimRes, bliRes, sbaRes] = await Promise.all([
      supabase.from('listings').select('business_name, headline, description, industry, location_general, asking_price, sde, ebitda, annual_revenue, status, featured_image_url, primary_image_url, image_urls').eq('id', listingId).maybeSingle(),
      supabase.from('listing_workflows').select('current_step, completed_steps').eq('listing_id', listingId).maybeSingle(),
      supabase.from('listing_documents').select('document_type, category, body_text').eq('listing_id', listingId),
      supabase.from('listing_financials').select('sde, annual_revenue').eq('listing_id', listingId).maybeSingle(),
      supabase.from('listing_recasts').select('id').eq('listing_id', listingId).maybeSingle(),
      supabase.from('bov_versions').select('status').eq('listing_id', listingId).maybeSingle(),
      supabase.from('cim_versions').select('status').eq('listing_id', listingId).maybeSingle(),
      supabase.from('bli_versions').select('id').eq('listing_id', listingId).maybeSingle(),
      supabase.from('sba_qualifications').select('id').eq('listing_id', listingId).maybeSingle(),
    ])

    const l = listingRes.data as Record<string, unknown> | null
    const wf = wfRes.data as { current_step?: number; completed_steps?: unknown } | null
    const docs = (docsRes.data as Record<string, unknown>[] | null) || []

    const hasAgreement = docs.some((d) => {
      const t = (d.document_type as string) || (d.category as string) || (d.body_text as string) || ''
      return t.includes('listing_agreement')
    })

    const fin = finRes.data as { sde?: number | null; annual_revenue?: number | null } | null

    const snapshot: ListingSnapshot = {
      listing: {
        business_name: (l?.business_name as string) || null,
        headline: (l?.headline as string) || null,
        description: (l?.description as string) || null,
        industry: (l?.industry as string) || null,
        location_general: (l?.location_general as string) || null,
        asking_price: (l?.asking_price as number | null) ?? null,
        sde: (l?.sde as number | null) ?? null,
        ebitda: (l?.ebitda as number | null) ?? null,
        annual_revenue: (l?.annual_revenue as number | null) ?? null,
        status: (l?.status as string) || null,
        has_cover_image: Boolean(l?.featured_image_url || l?.primary_image_url || (Array.isArray(l?.image_urls) && (l?.image_urls as string[]).length > 0)),
      },
      workflow: wf
        ? {
            current_step: wf.current_step ?? 1,
            completed_steps: Array.isArray(wf.completed_steps) ? (wf.completed_steps as unknown[]).map(Number) : [],
          }
        : null,
      documents: { has_listing_agreement: hasAgreement },
      financials: {
        exists: Boolean(fin) || Boolean(l?.sde || l?.ebitda || l?.annual_revenue || l?.asking_price),
        has_sde: Boolean(fin?.sde) || Boolean(l?.sde),
        has_revenue: Boolean(fin?.annual_revenue) || Boolean(l?.annual_revenue),
      },
      recast: { exists: Boolean(recastRes.data) },
      bov: {
        exists: Boolean(bovRes.data),
        finalized: (bovRes.data as { status?: string } | null)?.status === 'finalized',
      },
      cim: {
        exists: Boolean(cimRes.data),
        finalized: (cimRes.data as { status?: string } | null)?.status === 'finalized',
      },
      bli: {
        exists: Boolean(bliRes.data),
        finalized: (bliRes.data as { status?: string } | null)?.status === 'finalized',
      },
      sba: { exists: Boolean(sbaRes.data) },
    }

    return computeReadiness(snapshot)
  } catch {
    return empty
  }
}

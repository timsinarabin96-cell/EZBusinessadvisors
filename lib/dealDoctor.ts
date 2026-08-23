// =============================================================================
// Deal Doctor — probability-of-close scoring for the CRM pipeline
// -----------------------------------------------------------------------------
// Deterministic, zero-token scoring (no LLM cost per view). Each deal gets a
// 0–100 close-probability score from stage + momentum + engagement + pricing,
// a band label, and a concrete recommended action. Pure scoring lives in
// dealDoctorCore.ts (dependency-free, unit-tested); this file adds the
// pipeline wiring (loads deals + activity feed for the current agency).
// =============================================================================

import { supabase } from '@/lib/supabase/client'
import { fetchActivityFeed } from '@/lib/activityFeed'
import { getAgencyContext } from '@/lib/agencyContext'
import { fetchPipelineDeals, type PipelineItem } from '@/lib/pipeline'
import { scoreDeal } from '@/lib/dealDoctorCore.mts'

export {
  scoreDeal,
  BAND_LABELS,
  BAND_COLORS,
  stageLabel,
  type DealBand,
  type DealDoctorInput,
  type DealDiagnosis,
} from '@/lib/dealDoctorCore.mts'

import type { DealDiagnosis } from '@/lib/dealDoctorCore.mts'

/**
 * Score the whole pipeline for the current agency.
 * Loads deals + activity feed, counts engagement per deal/listing, scores each.
 */
export async function diagnosePipeline(): Promise<{ diagnoses: DealDiagnosis[]; agencyName?: string | null }> {
  const ctx = await getAgencyContext()
  if (!ctx) return { diagnoses: [] }

  const [deals, activity] = await Promise.all([
    fetchPipelineDeals().catch(() => [] as PipelineItem[]),
    fetchActivityFeed(ctx.agencyId, 100).catch(() => []),
  ])

  // Engagement per business name (activity feed is listing-name-keyed).
  const byName = new Map<string, { total: number; recent: number }>()
  const now = Date.now()
  for (const a of activity) {
    const name = a.listingName
    if (!name) continue
    const entry = byName.get(name) || { total: 0, recent: 0 }
    entry.total += 1
    const t = new Date(a.createdAt).getTime()
    if (now - t <= 14 * 86400000) entry.recent += 1
    byName.set(name, entry)
  }

  const diagnoses = deals
    .filter((d) => d.stage !== 'closed')
    .map((d) => {
      const name = d.business_name || ''
      const eng = name ? byName.get(name) : undefined
      return scoreDeal({
        id: d.id,
        stage: d.stage,
        created_at: d.created_at || null,
        updated_at: d.updated_at || null,
        purchase_price: d.purchase_price ?? null,
        asking_price: d.asking_price ?? null,
        business_name: d.business_name || null,
        industry: d.industry || null,
        engagementCount: eng?.total ?? 0,
        engagementLast14d: eng?.recent ?? 0,
      })
    })
    .sort((a, b) => b.score - a.score)

  const { data: agency } = await supabase.from('agencies').select('name').eq('id', ctx.agencyId).maybeSingle()
  return { diagnoses, agencyName: (agency as any)?.name || null }
}

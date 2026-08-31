/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { supabase } from '@/lib/supabase/client'
import { fetchListings } from '@/lib/listings'
import { fetchPipelineDeals, PIPELINE_STAGES } from '@/lib/pipeline'
import { fetchLeadStats } from '@/lib/leads2'

// ---------------------------------------------------------------------------
// Dashboard metrics — corrected against REAL schema.
// deals columns: id, listing_id, status, purchase_price, created_at, updated_at
// ---------------------------------------------------------------------------

export interface DashboardStats {
  totalListings: number
  activeListings: number
  totalDeals: number
  pendingDeals: number
  totalLeads: number
  newLeads: number
}

export interface FunnelPoint {
  stage: string
  value: number
}

export interface ActivityItem {
  id: string
  kind: 'deal' | 'lead' | 'note'
  title: string
  detail?: string
  createdAt: string | null
}

const PENDING_STAGES = ['letter_of_intent', 'under_contract', 'due_diligence', 'closing']

export async function fetchDashboardStats(): Promise<DashboardStats> {
  const [listings, pipelineDeals, leadStats] = await Promise.allSettled([
    fetchListings(),
    fetchPipelineDeals(),
    fetchLeadStats(),
  ])

  const allListings = listings.status === 'fulfilled' ? listings.value : []
  const ptpDeals = pipelineDeals.status === 'fulfilled' ? pipelineDeals.value : []
  const ls = leadStats.status === 'fulfilled' ? leadStats.value : { total: 0, newLeads: 0, buyers: 0, sellers: 0 }

  const pendingDeals = ptpDeals.filter((d) => PENDING_STAGES.includes(d.stage)).length

  return {
    totalListings: allListings.length,
    activeListings: allListings.filter((l) => l.status === 'active').length,
    totalDeals: ptpDeals.length,
    pendingDeals,
    totalLeads: ls.total,
    newLeads: ls.newLeads,
  }
}

export interface BuildRunSummary {
  at: string
  durationMs: number
  status: 'done' | 'error'
  failed: number
  readiness?: number | null
  error?: string | null
  businessName?: string
  listingId?: string
}

/** Pipeline health — aggregates the persisted build_history trail (JSONB on
 *  listings.ai_metadata) written by the One-Shot build route. Zero migration:
 *  reads recent listings, flattens their build runs, and reports success rate,
 *  avg duration, and the most recent runs for the dashboard widget. */
export async function fetchBuildHealth(limit = 40): Promise<{
  runs: BuildRunSummary[]
  successRate: number | null
  avgDurationMs: number | null
}> {
  try {
    const { data } = await supabase.from('listings').select('id, business_name, ai_metadata').order('updated_at', { ascending: false }).limit(limit)
    const runs: BuildRunSummary[] = []
    for (const row of data || []) {
      const history = ((row as any)?.ai_metadata?.build_history as BuildRunSummary[] | undefined) || []
      for (const r of history) {
        runs.push({ ...r, businessName: (row as any)?.business_name || undefined, listingId: (row as any)?.id })
      }
    }
    runs.sort((a, b) => (a.at < b.at ? 1 : -1))
    const done = runs.filter((r) => r.status === 'done').length
    const successRate = runs.length ? Math.round((done / runs.length) * 100) : null
    const avgDurationMs = runs.length ? Math.round(runs.reduce((s, r) => s + (r.durationMs || 0), 0) / runs.length) : null
    return { runs: runs.slice(0, 8), successRate, avgDurationMs }
  } catch {
    return { runs: [], successRate: null, avgDurationMs: null }
  }
}

export async function fetchPipelineFunnel(): Promise<FunnelPoint[]> {
  const deals = await fetchPipelineDeals()
  return PIPELINE_STAGES.map((s) => ({
    stage: s.label,
    value: deals.filter((d) => d.stage === s.id).length,
  }))
}

export async function fetchRecentActivity(): Promise<ActivityItem[]> {
  // Combine deals + leads as recent activity (best-effort; no dedicated audit table)
  const [dealsRes, leadsRes, cimRes, bovRes] = await Promise.allSettled([
    supabase.from('deals').select('id, listing_id, status, purchase_price, created_at, updated_at').order('updated_at', { ascending: false }).limit(8),
    supabase.from('seller_leads').select('*').order('created_at', { ascending: false }).limit(5),
    supabase.from('cim_versions').select('*').order('created_at', { ascending: false }).limit(5),
    supabase.from('bov_versions').select('*').order('created_at', { ascending: false }).limit(5),
  ])

  const items: ActivityItem[] = []

  if (dealsRes.status === 'fulfilled' && !dealsRes.value.error) {
    for (const d of (dealsRes.value.data || [])) {
      items.push({
        id: 'deal-' + d.id,
        kind: 'deal',
        title: `Deal ${d.status || 'letter_of_intent'}`,
        detail: d.purchase_price ? `$` + Math.round(d.purchase_price).toLocaleString() : 'Price TBD',
        createdAt: d.updated_at || d.created_at,
      })
    }
  }
  if (leadsRes.status === 'fulfilled' && !leadsRes.value.error) {
    for (const l of (leadsRes.value.data || [])) {
      items.push({
        id: 'lead-' + l.id,
        kind: 'lead',
        title: `New seller lead: ${l.business_name || 'Unnamed'}`,
        detail: l.status,
        createdAt: l.created_at,
      })
    }
  }
  if (cimRes.status === 'fulfilled' && !cimRes.value.error) {
    for (const c of (cimRes.value.data || [])) {
      const v = c.version_number ?? c.version
      items.push({ id: 'cim-' + c.id, kind: 'note', title: `CIM version ${v} ${c.status}`, detail: c.title || c.business_name || '', createdAt: c.created_at })
    }
  }
  if (bovRes.status === 'fulfilled' && !bovRes.value.error) {
    for (const b of (bovRes.value.data || [])) {
      const v = b.version_number ?? b.version
      items.push({ id: 'bov-' + b.id, kind: 'note', title: `BOV version ${v} ${b.status}`, detail: b.title || b.business_name || '', createdAt: b.created_at })
    }
  }

  items.sort((a, b) => {
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0
    return tb - ta
  })

  return items.slice(0, 12)
}

export async function fetchUpcomingTasks(): Promise<ActivityItem[]> {
  const { data, error } = await supabase
    .from('due_diligence_items')
    .select('*')
    .order('due_date', { ascending: true })
    .limit(10)
  if (error || !data) return []
  return (data as any[]).map((d) => ({
    id: 'dd-' + d.id,
    kind: 'note',
    title: d.title || 'Due diligence task',
    detail: d.status || 'pending',
    createdAt: d.due_date,
  }))
}

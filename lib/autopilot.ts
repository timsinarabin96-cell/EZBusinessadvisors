/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { supabase } from '@/lib/supabase/client'
import { getAgencyContext } from '@/lib/agencyContext'

export interface DealTwin {
  id: string
  listing_id: string | null
  deal_id: string | null
  health_score: number | null
  closing_probability: number | null
  stage: string | null
  summary: string | null
  blockers: unknown[]
  risks: unknown[]
  next_best_actions: unknown[]
  last_analyzed_at: string | null
}

export interface AiAction {
  id: string
  title: string
  description: string | null
  action_type: string
  risk_level: 'low' | 'medium' | 'high' | 'critical'
  approval_required: boolean
  status: string
  created_at: string
}

export async function fetchAutopilotOverview() {
  const context = await getAgencyContext()
  if (!context) return { twins: [], actions: [] as AiAction[], agencyConfigured: false }

  const [twinsResult, actionsResult] = await Promise.all([
    supabase
      .from('deal_twins')
      .select('*')
      .eq('agency_id', context.agencyId)
      .order('health_score', { ascending: true })
      .limit(20),
    supabase
      .from('ai_actions')
      .select('*')
      .eq('agency_id', context.agencyId)
      .in('status', ['proposed', 'approved', 'running', 'failed'])
      .order('created_at', { ascending: false })
      .limit(30),
  ])

  const missingSchema = twinsResult.error?.code === '42P01' || actionsResult.error?.code === '42P01'
  if (missingSchema) return { twins: [], actions: [] as AiAction[], agencyConfigured: true, schemaPending: true }
  if (twinsResult.error) throw new Error(twinsResult.error.message)
  if (actionsResult.error) throw new Error(actionsResult.error.message)

  return {
    twins: (twinsResult.data as DealTwin[]) || [],
    actions: (actionsResult.data as AiAction[]) || [],
    agencyConfigured: true,
    schemaPending: false,
  }
}

/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Instant Underwriting — buyer pre-qualification for the public marketplace
// -----------------------------------------------------------------------------
// Buyers answer a few questions (target price, liquid capital, income, credit)
// and get an instant qualification level + badges (Funded ✅ / Pre-approved /
// Qualified / Exploring). Pure scoring lives in underwritingCore.ts; this
// wrapper adds lead capture so brokers see every qualified buyer.
// =============================================================================

import { supabase } from '@/lib/supabase/client'
import { qualifyBuyer, LEVEL_LABELS, type UnderwritingInput, type UnderwritingResult, type QualificationLevel } from '@/lib/underwritingCore.ts'

export { qualifyBuyer, LEVEL_LABELS, type UnderwritingInput, type UnderwritingResult, type QualificationLevel }

export interface UnderwritingLead {
  email: string
  name?: string
  target_price: number
  liquid_capital: number
  annual_income: number
  credit_tier: string
  sba_pre_approved: boolean
  has_business_experience: boolean
  result: UnderwritingResult
}

/** Save a pre-qualification lead so brokers can follow up. Never throws. */
export async function saveUnderwritingLead(input: UnderwritingLead): Promise<{ ok: boolean; error?: string }> {
  const preQualified = ['funded', 'pre_approved', 'qualified'].includes(input.result.level)
  const { error } = await supabase.from('buyer_leads').insert({
    email: input.email,
    name: input.name || null,
    source: 'instant_underwriting',
    message: JSON.stringify({
      target_price: input.target_price,
      liquid_capital: input.liquid_capital,
      annual_income: input.annual_income,
      credit_tier: input.credit_tier,
      sba_pre_approved: input.sba_pre_approved,
      has_business_experience: input.has_business_experience,
      level: input.result.level,
      score: input.result.score,
      badges: input.result.badges,
      pre_qualified: preQualified,
    }),
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export const CREDIT_OPTIONS: { value: string; label: string }[] = [
  { value: 'excellent', label: 'Excellent (720+)' },
  { value: 'good', label: 'Good (680–719)' },
  { value: 'fair', label: 'Fair (620–679)' },
  { value: 'poor', label: 'Below 620' },
]

export const LEVEL_COLORS: Record<QualificationLevel, string> = {
  funded: '#1e7e34',
  pre_approved: '#0e7490',
  qualified: '#b45309',
  exploring: '#7b8794',
}

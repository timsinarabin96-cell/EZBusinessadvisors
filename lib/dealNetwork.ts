import { supabase } from '@/lib/supabase/client'

export interface DealPassportSummary {
  id: string
  listing_id: string
  verification_score: number
  liquidity_score: number
  financing_score: number
  documentation_score: number
  status: string
  risk_flags: unknown[]
  readiness_actions: unknown[]
}

export interface DealNetworkOverview {
  passports: DealPassportSummary[]
  activeOffers: number
  exchangeOpportunities: number
  activeTransitions: number
  pendingAiQueries: number
  verifiedFacts: number
}

const safeCount = async (table: string, filters?: Array<[string, string]>) => {
  let query = supabase.from(table).select('id', { count: 'exact', head: true })
  for (const [column, value] of filters || []) query = query.eq(column, value)
  const { count, error } = await query
  return error ? 0 : count || 0
}

export async function fetchDealNetworkOverview(): Promise<DealNetworkOverview> {
  const { data: passports } = await supabase.from('deal_passports').select('*').order('updated_at', { ascending: false }).limit(12)
  const [activeOffers, exchangeOpportunities, activeTransitions, pendingAiQueries, verifiedFacts] = await Promise.all([
    safeCount('deal_offers', [['status', 'submitted']]),
    safeCount('exchange_opportunities', [['status', 'active']]),
    safeCount('transition_plans', [['status', 'active']]),
    safeCount('data_room_ai_queries', [['status', 'pending']]),
    safeCount('deal_fact_evidence', [['verification_level', 'document_verified']]),
  ])
  return {
    passports: (passports || []) as DealPassportSummary[],
    activeOffers,
    exchangeOpportunities,
    activeTransitions,
    pendingAiQueries,
    verifiedFacts,
  }
}

export const DEAL_INTELLIGENCE_MODULES = [
  { title: 'Verified Deal Passport', description: 'Evidence-backed facts, confidence levels, liquidity, financing, documentation, and readiness scores.', accent: '#0e7490' },
  { title: 'Permission-Aware Deal Room AI', description: 'Answers only from files the specific buyer can access, with citations, redaction records, and blocked-query reasons.', accent: '#7c3aed' },
  { title: 'Relationship Graph', description: 'Maps warm introduction paths across buyers, sellers, lenders, attorneys, CPAs, and referral partners.', accent: '#0369a1' },
  { title: 'Buyer Engagement Radar', description: 'Combines fit, qualification, data-room activity, financing progress, and closing probability.', accent: '#15803d' },
  { title: 'AI Offer Lab', description: 'Compares true seller value, contingencies, seller notes, earnouts, working capital, and probability of closing.', accent: '#b45309' },
  { title: 'Exit Value Growth', description: 'Nurtures not-ready sellers with value targets, milestone plans, owner-dependence reduction, and readiness tracking.', accent: '#be123c' },
  { title: 'Cooperative Exchange', description: 'Shares anonymous listings or qualified buyers with approved brokerage partners under controlled fee and disclosure rules.', accent: '#1d4ed8' },
  { title: 'Post-Close Transition', description: 'Tracks 30/60/90-day handoff, training, introductions, working capital, earnouts, licenses, and issue resolution.', accent: '#4338ca' },
  { title: 'Agent Performance OS', description: 'Connects listing quality, compliance, training, response time, client satisfaction, revenue, and AI coaching.', accent: '#a21caf' },
  { title: 'Marketplace Trust Center', description: 'Publishes confidentiality, security, AI-use, accessibility, licensing, complaint, copyright, and incident policies.', accent: '#334155' },
] as const

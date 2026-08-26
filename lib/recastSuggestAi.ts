/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// recastSuggestAi — DeepSeek enhancement pass for recast add-back suggestions.
// Server-only (imports the DeepSeek client). Takes the rule-based baseline +
// the listing snapshot, and returns a refined suggestion set. Fail-safe: any
// AI error returns the rule baseline untouched — the AI can make suggestions
// better, never worse.
// =============================================================================

import { isDeepSeekConfigured, completeWithDeepSeek } from '@/lib/deepseek/client'
import type { AddBackSuggestion, RecastSuggestionInput } from '@/lib/recastSuggestions'

const SYSTEM = `You are a senior M&A financial recasting specialist (business broker, CFE-grade).
Your job: given a business's reported financials, propose the add-backs a broker
would apply to normalize owner-discretionary earnings into a sustainable,
sellable SDE/EBITDA.

Rules:
- Only propose add-backs that are defensible to a buyer and a lender.
- Owner salary/benefits, D&A, non-operating interest, one-time items,
  discretionary/personal expenses, non-arm's-length payments are all fair game.
- Be industry-aware (restaurants → meals/tips/owner comp; home services →
  vehicle/fuel; e-commerce → one-time setup/marketing; retail → owner comp).
- Amounts must be positive numbers in USD, rounded to the nearest 100.
- Never exceed 40% of reported SDE in total add-backs for a going concern.
- Return a JSON array only.`

function fmt$(n: number): string {
  return '$' + Math.round(n).toLocaleString('en-US')
}

/**
 * AI refinement pass. Returns the baseline when AI is unavailable or fails.
 */
export async function enhanceRecastSuggestions(
  input: RecastSuggestionInput,
  baseline: AddBackSuggestion[],
): Promise<AddBackSuggestion[]> {
  if (!isDeepSeekConfigured()) return baseline

  const rev = input.annual_revenue || 0
  const sde = input.sde || 0
  const ebitda = input.ebitda || 0

  const profile = [
    `Business: ${input.business_name || 'Unnamed'}`,
    `Industry: ${[input.industry, input.sub_industry].filter(Boolean).join(' / ') || 'Unknown'}`,
    `Description: ${input.description || '—'}`,
    `Annual revenue: ${rev ? fmt$(rev) : '—'}`,
    `Reported SDE: ${sde ? fmt$(sde) : '—'}`,
    `Reported EBITDA: ${ebitda ? fmt$(ebitda) : '—'}`,
    `Asking price: ${input.asking_price ? fmt$(input.asking_price) : '—'}`,
    `Full-time employees: ${input.employees_full_time ?? '—'}`,
    `Year established: ${input.year_established ?? '—'}`,
  ].join('\n')

  const baselineText = baseline.length
    ? baseline.map((b, i) => `${i + 1}. ${b.label} — ${fmt$(b.amount)} (${b.category})`).join('\n')
    : '(none from rules)'

  try {
    const result = await completeWithDeepSeek({
      context: { kind: 'listing', text: profile },
      message:
        `Propose the add-backs a broker would apply to recast this business.\n` +
        `Rule-based baseline (refine, keep, or replace — you know better):\n${baselineText}\n\n` +
        `Return JSON array: [{"label","amount","category","rationale","confidence"}] with 2-6 items.`,
      system: SYSTEM,
      jsonMode: true,
      maxTokens: 1400,
    })

    const raw = result.data || (result.text ? safeParse(result.text) : null)
    const items = Array.isArray(raw) ? raw : null
    if (!items || !items.length) return baseline

    const cap = Math.round(sde * 0.4) || Number.MAX_SAFE_INTEGER
    const out: AddBackSuggestion[] = []
    let total = 0
    for (const it of items) {
      const amount = Math.max(0, Math.round(Number(it.amount) || 0))
      const label = String(it.label || '').trim()
      if (!label || amount <= 0) continue
      if (total + amount > cap && out.length >= 1) continue
      total += amount
      out.push({
        label,
        amount,
        category: String(it.category || 'other').slice(0, 40),
        rationale: String(it.rationale || 'AI-recommended add-back').slice(0, 240),
        confidence: it.confidence === 'high' || it.confidence === 'medium' || it.confidence === 'low' ? it.confidence : 'medium',
      })
    }
    return out.length ? out : baseline
  } catch {
    return baseline
  }
}

function safeParse(text: string): unknown {
  try {
    const cleaned = text.replace(/^```(json)?/i, '').replace(/```$/, '').trim()
    return JSON.parse(cleaned)
  } catch {
    return null
  }
}

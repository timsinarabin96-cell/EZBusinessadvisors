// =============================================================================
// recastSuggestions — AI + rule-based add-back suggestions for the Recast step.
// -----------------------------------------------------------------------------
// Pure core (no imports → unit-testable): given a business snapshot, produce
// broker-grade add-back suggestions (label + amount + rationale) using
// standard recast rules. An optional AI pass (DeepSeek, server-only) sharpens
// the suggestions with industry knowledge.
// =============================================================================

export interface RecastSuggestionInput {
  business_name?: string | null
  industry?: string | null
  sub_industry?: string | null
  description?: string | null
  annual_revenue?: number | null
  sde?: number | null
  ebitda?: number | null
  asking_price?: number | null
  employees_full_time?: number | null
  owner_hours_per_week?: number | null
  year_established?: number | null
}

export interface AddBackSuggestion {
  label: string
  amount: number
  category: string
  rationale: string
  confidence: 'high' | 'medium' | 'low'
}

/**
 * Rule-based add-back suggestions — the deterministic fallback that always
 * works, and the baseline the AI pass refines. Pure function, unit-testable.
 */
export function suggestAddBacks(input: RecastSuggestionInput): AddBackSuggestion[] {
  const out: AddBackSuggestion[] = []
  const rev = input.annual_revenue || 0
  const sde = input.sde || 0
  const ebitda = input.ebitda || 0
  const industry = (input.industry || input.sub_industry || '').toLowerCase()
  const description = (input.description || '').toLowerCase()

  // 1) Owner compensation — the classic add-back. If SDE is small relative to
  //    revenue, the owner is likely paying themselves through the P&L.
  if (sde > 0 && rev > 0) {
    const sdeMargin = sde / rev
    if (sdeMargin < 0.18) {
      // Thin margin → owner comp may be buried in expenses. Suggest a market
      // owner salary based on revenue band (rule of thumb).
      const ownerSalary = rev >= 1_000_000 ? Math.round(rev * 0.12) : Math.round(rev * 0.15)
      out.push({
        label: 'Owner salary & wages (market rate)',
        amount: ownerSalary,
        category: 'owner_salary',
        rationale: `SDE margin is ${(sdeMargin * 100).toFixed(0)}% — below the ~18% typical for this revenue band. Suggests owner comp is inside expenses; add back a market-rate owner salary.`,
        confidence: 'medium',
      })
    }
  }

  // 2) Owner benefits (health, retirement, auto)
  if (sde > 0 && rev > 0 && sde / rev < 0.22) {
    const benefits = Math.round((rev >= 1_000_000 ? rev * 0.03 : rev * 0.04))
    out.push({
      label: 'Owner benefits (health, retirement, auto)',
      amount: benefits,
      category: 'owner_benefits',
      rationale: 'Standard owner benefit package commonly run through the business.',
      confidence: 'medium',
    })
  }

  // 3) Depreciation & amortization — non-cash, always added back when present.
  if (ebitda > 0 && sde > ebitda * 1.05) {
    const da = Math.round((sde - ebitda) * 0.7)
    if (da > 0) {
      out.push({
        label: 'Depreciation & amortization (non-cash)',
        amount: da,
        category: 'depreciation',
        rationale: 'Non-cash expense — added back to reflect true cash earnings.',
        confidence: 'high',
      })
    }
  }

  // 4) Interest expense — if EBITDA is close to SDE, interest may not be
  //    separately visible; flag it for businesses with leverage.
  if (ebitda > 0 && sde > 0 && Math.abs(ebitda - sde) / Math.max(ebitda, sde) < 0.05) {
    out.push({
      label: 'Interest expense (non-operating)',
      amount: Math.round(Math.max(rev * 0.01, 2_000)),
      category: 'interest',
      rationale: 'EBITDA ≈ SDE — if the business carries debt, interest is being absorbed; add back if non-operating.',
      confidence: 'low',
    })
  }

  // 5) Industry-specific hints
  if (/cleaning|janitorial|lawn|landscaping|home service/i.test(industry + ' ' + description)) {
    out.push({
      label: 'Personal vehicle / fuel (owner use)',
      amount: Math.round((rev || 300_000) * 0.02),
      category: 'personal',
      rationale: 'Home-service businesses commonly run personal vehicle costs through the P&L.',
      confidence: 'medium',
    })
  }
  if (/restaurant|cafe|food/i.test(industry + ' ' + description)) {
    out.push({
      label: 'Owner meals & entertainment',
      amount: Math.round((rev || 500_000) * 0.01),
      category: 'discretionary',
      rationale: 'Industry-standard discretionary add-back for food & beverage.',
      confidence: 'medium',
    })
  }
  if (/e-?commerce|online|retail/i.test(industry + ' ' + description)) {
    out.push({
      label: 'One-time setup/website costs',
      amount: Math.round((rev || 500_000) * 0.015),
      category: 'one_time',
      rationale: 'Non-recurring marketing/web expenses common in e-commerce.',
      confidence: 'low',
    })
  }

  // 6) Owner-operator check — absentee owners usually need a replacement
  //    manager's salary added back (negative adjustment is handled elsewhere).
  if (input.owner_hours_per_week && input.owner_hours_per_week < 20 && sde > 0) {
    out.push({
      label: 'Replacement manager allowance (absentee owner)',
      amount: Math.round(Math.min(sde * 0.3, 75_000)),
      category: 'other',
      rationale: 'Owner works <20 hrs/wk — a buyer will likely need management help; budget the cost of a replacement.',
      confidence: 'low',
    })
  }

  return out
}

/**
 * Sum of suggested add-backs (for pre-fill convenience).
 */
export function totalSuggestedAddBacks(input: RecastSuggestionInput): number {
  return suggestAddBacks(input).reduce((s, x) => s + x.amount, 0)
}

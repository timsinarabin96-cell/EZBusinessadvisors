// =============================================================================
// Deal Simulator — learn-by-doing core. Pure + testable.
// A synthetic business with messy owner-bookkeeping financials. The broker
// must: 1) recast SDE (add-backs), 2) pick a defensible multiple, 3) propose
// an asking price. Grading is deterministic (band-based) so the AI feedback
// layer on top is pure enhancement.
// =============================================================================

export interface SimulatorFinancials {
  net_profit: number
  owner_salary: number
  owner_perks: number
  one_time_expenses: number
  non_cash: number
  interest: number
  taxes: number
}

export interface SimulatorScenario {
  id: string
  title: string
  industry: string
  location: string
  asking_hint: string | null
  financials: SimulatorFinancials
  /** Defensible multiple band for this industry (SDE multiples). */
  multiple_band: [number, number]
  /** Hidden answer — never sent to the client. */
  answer: {
    sde: number
    multiple: number
    price: number
  }
  notes: string
}

export const SCENARIOS: SimulatorScenario[] = [
  {
    id: 'sunrise-laundromat',
    title: 'Sunrise Laundromat — Main Street recast',
    industry: 'Laundromat',
    location: 'Harrisburg, PA',
    asking_hint: null,
    financials: {
      net_profit: 61200,
      owner_salary: 48000,
      owner_perks: 7200,
      one_time_expenses: 9400,
      non_cash: 8600,
      interest: 5200,
      taxes: 14600,
    },
    multiple_band: [2.5, 3.5],
    answer: {
      sde: 154200,
      multiple: 3.0,
      price: 462600,
    },
    notes:
      'Laundromats are asset-heavy with low owner dependence; Main Street multiples typically land 2.5–3.5× SDE. The recast adds back owner salary, perks, one-time expenses, non-cash depreciation, interest, and taxes.',
  },
  {
    id: 'corner-deli',
    title: 'Corner Deli — add-backs & seller financing',
    industry: 'Convenience Store / Deli',
    location: 'Scranton, PA',
    asking_hint: null,
    financials: {
      net_profit: 42300,
      owner_salary: 54000,
      owner_perks: 6100,
      one_time_expenses: 3800,
      non_cash: 4100,
      interest: 2900,
      taxes: 9800,
    },
    multiple_band: [2.0, 3.0],
    answer: {
      sde: 123000,
      multiple: 2.5,
      price: 307500,
    },
    notes:
      'Small convenience/deli businesses are owner-operated; buyers expect a seller-financing component. Typical multiples run 2.0–3.0× SDE.',
  },
]

/** Recast SDE: net profit + owner comp + perks + one-time + non-cash + interest + taxes. */
export function recalcSde(f: SimulatorFinancials): number {
  return (
    f.net_profit +
    f.owner_salary +
    f.owner_perks +
    f.one_time_expenses +
    f.non_cash +
    f.interest +
    f.taxes
  )
}

export interface SimulatorGrade {
  scenarioId: string
  sdeCorrect: boolean
  sdeGiven: number
  sdeExpected: number
  multipleCorrect: boolean
  multipleGiven: number
  priceCorrect: boolean
  priceGiven: number
  priceExpected: number
  score: number // 0-100
  passed: boolean
  feedback: string[]
}

const SDE_TOLERANCE = 0.05 // 5%
const MULTIPLE_TOLERANCE = 0.35 // ±0.35 turns
const PRICE_TOLERANCE = 0.12 // 12%

/** Grade a broker's answers against the scenario. Deterministic — no AI needed for the core pass. */
export function gradeSimulator(scenario: SimulatorScenario, sdeGiven: number, multipleGiven: number): SimulatorGrade {
  const sdeExpected = scenario.answer.sde
  const priceExpected = scenario.answer.price
  const priceGiven = sdeGiven * multipleGiven

  const sdeCorrect = Math.abs(sdeGiven - sdeExpected) / sdeExpected <= SDE_TOLERANCE
  const multipleCorrect = Math.abs(multipleGiven - scenario.answer.multiple) <= MULTIPLE_TOLERANCE
  const priceCorrect = Math.abs(priceGiven - priceExpected) / priceExpected <= PRICE_TOLERANCE

  let score = 0
  if (sdeCorrect) score += 40
  if (multipleCorrect) score += 30
  if (priceCorrect) score += 30

  const feedback: string[] = []
  feedback.push(
    sdeCorrect
      ? `✅ SDE recast: $${sdeGiven.toLocaleString()} — right in range (expected ~$${sdeExpected.toLocaleString()}).`
      : `❌ SDE recast: $${sdeGiven.toLocaleString()} vs expected ~$${sdeExpected.toLocaleString()} (add back owner comp, perks, one-time, non-cash, interest, taxes).`,
  )
  feedback.push(
    multipleCorrect
      ? `✅ Multiple: ${multipleGiven.toFixed(1)}× — defensible for ${scenario.industry}.`
      : `❌ Multiple: ${multipleGiven.toFixed(1)}× vs expected ${scenario.multiple_band[0]}–${scenario.multiple_band[1]}× for ${scenario.industry}.`,
  )
  feedback.push(
    priceCorrect
      ? `✅ Price: $${priceGiven.toLocaleString()} — consistent with SDE × multiple.`
      : `ℹ️ Price check: $${priceGiven.toLocaleString()} vs ~$${priceExpected.toLocaleString()} (SDE × multiple). Re-check the math.`,
  )

  return {
    scenarioId: scenario.id,
    sdeCorrect,
    sdeGiven,
    sdeExpected,
    multipleCorrect,
    multipleGiven,
    priceCorrect,
    priceGiven,
    priceExpected,
    score,
    passed: score >= 70,
    feedback,
  }
}

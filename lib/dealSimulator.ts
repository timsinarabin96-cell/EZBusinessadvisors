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
  {
    id: 'prime-auto-repair',
    title: 'Prime Auto Repair — shop with real estate option',
    industry: 'Auto Repair',
    location: 'Allentown, PA',
    asking_hint: null,
    financials: {
      net_profit: 88400,
      owner_salary: 72000,
      owner_perks: 9800,
      one_time_expenses: 6200,
      non_cash: 12400,
      interest: 7100,
      taxes: 21900,
    },
    multiple_band: [2.5, 3.5],
    answer: {
      sde: 217800,
      multiple: 3.0,
      price: 653400,
    },
    notes:
      'Auto repair shops trade on technician quality and bay capacity. Certified techs and a long lease raise the multiple; real estate-inclusive deals price separately (don\'t roll property into the business multiple).',
  },
  {
    id: 'blue-ridge-homecare',
    title: 'Blue Ridge Home Care — recurring-revenue premium',
    industry: 'Home Care',
    location: 'Roanoke, VA',
    asking_hint: null,
    financials: {
      net_profit: 120300,
      owner_salary: 90000,
      owner_perks: 11500,
      one_time_expenses: 8400,
      non_cash: 15800,
      interest: 9600,
      taxes: 31800,
    },
    multiple_band: [4.0, 5.0],
    answer: {
      sde: 287400,
      multiple: 4.5,
      price: 1293300,
    },
    notes:
      'Home care is a market-multiples darling (4–5× EBITDA/SDE) because care contracts are recurring and Medicaid/private-pay mix is stable. Watch customer concentration — one big referral source caps the multiple.',
  },
  {
    id: 'harbor-view-franchise',
    title: 'Harbor View Franchise — QSR with royalty drag',
    industry: 'Franchise / QSR',
    location: 'Norfolk, VA',
    asking_hint: null,
    financials: {
      net_profit: 96200,
      owner_salary: 68000,
      owner_perks: 8100,
      one_time_expenses: 4700,
      non_cash: 9300,
      interest: 5400,
      taxes: 22600,
    },
    multiple_band: [2.0, 2.8],
    answer: {
      sde: 214300,
      multiple: 2.4,
      price: 514320,
    },
    notes:
      'Franchised QSRs trade at a discount to independents because royalty + ad-fund fees and franchisor approval drag the multiple. Compute SDE, then apply the franchise discount — buyers demand it.',
  },
  {
    id: 'summit-logistics',
    title: 'Summit Logistics — mid-market EBITDA deal',
    industry: 'Logistics / Trucking',
    location: 'Nashville, TN',
    asking_hint: null,
    financials: {
      net_profit: 310000,
      owner_salary: 160000,
      owner_perks: 22000,
      one_time_expenses: 15000,
      non_cash: 68000,
      interest: 42000,
      taxes: 98000,
    },
    multiple_band: [4.0, 5.5],
    answer: {
      sde: 715000,
      multiple: 4.75,
      price: 3396250,
    },
    notes:
      'Mid-market logistics uses EBITDA (interest + taxes + D&A added back, but owner comp is often already market-rate — here it is NOT, so the add-back is legitimate). Larger deals trade on 4–5.5× EBITDA.',
  },
  {
    id: 'cedar-springs-landscaping',
    title: 'Cedar Springs Landscaping — seasonal & customer concentration',
    industry: 'Landscaping',
    location: 'Greenville, SC',
    asking_hint: null,
    financials: {
      net_profit: 51400,
      owner_salary: 46000,
      owner_perks: 5900,
      one_time_expenses: 3300,
      non_cash: 6800,
      interest: 4100,
      taxes: 12400,
    },
    multiple_band: [2.0, 2.8],
    answer: {
      sde: 129900,
      multiple: 2.4,
      price: 311760,
    },
    notes:
      'Landscaping is seasonal and often has one anchor commercial contract — customer concentration + weather risk cap the multiple near the low end of 2.0–2.8× SDE.',
  },
  {
    id: 'golden-bowl-restaurant',
    title: 'Golden Bowl — restaurant with key-person risk',
    industry: 'Restaurant',
    location: 'Pittsburgh, PA',
    asking_hint: null,
    financials: {
      net_profit: 67300,
      owner_salary: 52000,
      owner_perks: 8700,
      one_time_expenses: 2900,
      non_cash: 5100,
      interest: 3800,
      taxes: 15600,
    },
    multiple_band: [1.8, 2.5],
    answer: {
      sde: 155400,
      multiple: 2.1,
      price: 326340,
    },
    notes:
      'Restaurants are the riskiest Main Street asset class: key-person dependence (the chef/owner), fickle demand, and lease risk. Multiples cluster at 1.8–2.5× SDE — never above 3× without a triple-net lease and proven manager.',
  },
  {
    id: 'eagle-dental-practice',
    title: 'Eagle Dental Practice — professional services premium',
    industry: 'Dental Practice',
    location: 'Charlotte, NC',
    asking_hint: null,
    financials: {
      net_profit: 201000,
      owner_salary: 180000,
      owner_perks: 14000,
      one_time_expenses: 9000,
      non_cash: 26000,
      interest: 18000,
      taxes: 52000,
    },
    multiple_band: [3.0, 4.0],
    answer: {
      sde: 500000,
      multiple: 3.5,
      price: 1750000,
    },
    notes:
      'Dental practices trade at 3–4× SDE when the owner works IN the practice (production-based) — the buyer replaces the dentist. Add-backs are real (owner salary is above market) but buyer must be a licensed dentist.',
  },
  {
    id: 'river-bend-plumbing',
    title: 'River Bend Plumbing — trades business with fleet',
    industry: 'Plumbing / Trades',
    location: 'Cincinnati, OH',
    asking_hint: null,
    financials: {
      net_profit: 74800,
      owner_salary: 61000,
      owner_perks: 7200,
      one_time_expenses: 4100,
      non_cash: 11200,
      interest: 6800,
      taxes: 18100,
    },
    multiple_band: [2.2, 3.0],
    answer: {
      sde: 183200,
      multiple: 2.6,
      price: 476320,
    },
    notes:
      'Trades businesses (plumbing/HVAC/electrical) trade on recurring service contracts and crew depth. Fleet is usually excluded or priced at book — keep the business multiple on SDE only.',
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

export type ListingSource = 'broker_manual' | 'seller_self_service' | 'ai_phone' | 'import'
export type ListingReviewStage = 'draft' | 'agent_review' | 'broker_review' | 'changes_requested' | 'approved' | 'rejected'

export interface IntelligentListingInput {
  business_name: string
  headline: string
  industry: string
  sub_industry: string
  location_general: string
  description: string
  asking_price: string
  annual_revenue: string
  sde: string
  ebitda: string
  inventory_value: string
  ffe_value: string
  established_year: string
  employees_full_time: string
  employees_part_time: string
  owner_hours_weekly: string
  reason_for_sale: string
  growth_opportunities: string
  competitive_advantages: string
  customer_concentration: string
  facilities_summary: string
  lease_monthly: string
  lease_expires_on: string
  lease_square_feet: string
  real_estate_included: boolean
  ffe_included: boolean
  inventory_included: boolean
  goodwill_included: boolean
  asset_sale: boolean
  property_address: string
  property_city: string
  square_footage: string
  land_acres: string
  year_built: string
  property_value: string
  property_description: string
  seller_financing_available: boolean
  financing_notes: string
  transition_support: string
  training_period_weeks: string
  public_title: string
  public_summary: string
  public_highlights: string
  video_url: string
  gallery_images: string[]
  confidentiality_level: 'anonymous' | 'qualified_buyers' | 'broker_only'
  show_financials: boolean
  seller_approval_reference: string
  source: ListingSource
}

export const EMPTY_INTELLIGENT_LISTING: IntelligentListingInput = {
  business_name: '', headline: '', industry: '', sub_industry: '', location_general: '', description: '',
  asking_price: '', annual_revenue: '', sde: '', ebitda: '', inventory_value: '', ffe_value: '', established_year: '',
  employees_full_time: '', employees_part_time: '', owner_hours_weekly: '', reason_for_sale: '', growth_opportunities: '',
  competitive_advantages: '', customer_concentration: '', facilities_summary: '', lease_monthly: '', lease_expires_on: '',
  lease_square_feet: '',
  real_estate_included: false, ffe_included: false, inventory_included: false, goodwill_included: false, asset_sale: true,
  property_address: '', property_city: '', square_footage: '', land_acres: '', year_built: '', property_value: '', property_description: '',
  seller_financing_available: false, financing_notes: '', transition_support: '',
  training_period_weeks: '', public_title: '', public_summary: '', public_highlights: '', video_url: '', gallery_images: [], confidentiality_level: 'anonymous',
  show_financials: false, seller_approval_reference: '', source: 'broker_manual',
}

const numberOrNull = (value: string): number | null => {
  if (!value.trim()) return null
  const parsed = Number(value.replace(/[$,]/g, ''))
  return Number.isFinite(parsed) ? parsed : null
}

const integerOrNull = (value: string): number | null => {
  const parsed = numberOrNull(value)
  return parsed === null ? null : Math.round(parsed)
}

export function parseHighlights(value: string): string[] {
  return value
    .split(/\n|;/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12)
}

export function buildListingInsert(input: IntelligentListingInput) {
  return {
    business_name: input.business_name.trim(),
    headline: input.headline.trim() || null,
    industry: input.industry.trim() || null,
    sub_industry: input.sub_industry.trim() || null,
    location_general: input.location_general.trim() || null,
    description: input.description.trim() || null,
    asking_price: numberOrNull(input.asking_price),
    annual_revenue: numberOrNull(input.annual_revenue),
    sde: numberOrNull(input.sde),
    ebitda: numberOrNull(input.ebitda),
    inventory_value: numberOrNull(input.inventory_value),
    ffe_value: numberOrNull(input.ffe_value),
    established_year: integerOrNull(input.established_year),
    employees_full_time: integerOrNull(input.employees_full_time),
    employees_part_time: integerOrNull(input.employees_part_time),
    owner_hours_weekly: numberOrNull(input.owner_hours_weekly),
    reason_for_sale: input.reason_for_sale.trim() || null,
    growth_opportunities: input.growth_opportunities.trim() || null,
    competitive_advantages: input.competitive_advantages.trim() || null,
    customer_concentration: input.customer_concentration.trim() || null,
    facilities_summary: input.facilities_summary.trim() || null,
    lease_monthly: numberOrNull(input.lease_monthly),
    lease_expires_on: input.lease_expires_on || null,
    lease_square_feet: integerOrNull(input.lease_square_feet),
    real_estate_included: input.real_estate_included,
    ffe_included: input.ffe_included,
    inventory_included: input.inventory_included,
    goodwill_included: input.goodwill_included,
    asset_sale: input.asset_sale,
    property_address: input.property_address.trim() || null,
    property_city: input.property_city.trim() || null,
    square_footage: integerOrNull(input.square_footage),
    land_acres: numberOrNull(input.land_acres),
    year_built: integerOrNull(input.year_built),
    property_value: numberOrNull(input.property_value),
    property_description: input.property_description.trim() || null,
    seller_financing_available: input.seller_financing_available,
    financing_notes: input.financing_notes.trim() || null,
    transition_support: input.transition_support.trim() || null,
    training_period_weeks: integerOrNull(input.training_period_weeks),
    confidentiality_level: input.confidentiality_level,
    intake_source: input.source,
    review_stage: 'draft' as ListingReviewStage,
    status: 'draft',
    image_urls: input.gallery_images.length ? input.gallery_images : null,
    ai_metadata: {
      public_title: input.public_title.trim() || input.headline.trim() || null,
      public_summary: input.public_summary.trim() || null,
      public_highlights: parseHighlights(input.public_highlights),
      video_url: input.video_url.trim() || null,
      show_financials: input.show_financials,
      seller_approval_reference: input.seller_approval_reference.trim() || null,
    },
  }
}

export interface ListingReadinessResult {
  score: number
  label: 'Not ready' | 'Needs work' | 'Review ready' | 'Approval ready'
  missing: string[]
}

export function calculateListingReadiness(input: IntelligentListingInput): ListingReadinessResult {
  const checks: Array<[boolean, string, number]> = [
    [Boolean(input.business_name.trim()), 'Business identity', 8],
    [Boolean(input.industry.trim()), 'Industry and category', 7],
    [Boolean(input.location_general.trim()), 'General location', 5],
    [input.description.trim().length >= 120, 'Detailed business description', 10],
    [numberOrNull(input.annual_revenue) !== null, 'Annual revenue', 8],
    [numberOrNull(input.sde) !== null || numberOrNull(input.ebitda) !== null, 'SDE or EBITDA', 10],
    [numberOrNull(input.asking_price) !== null, 'Asking price', 7],
    [Boolean(input.reason_for_sale.trim()), 'Seller motivation', 5],
    [Boolean(input.competitive_advantages.trim()), 'Competitive advantages', 7],
    [Boolean(input.growth_opportunities.trim()), 'Growth opportunities', 7],
    [Boolean(input.facilities_summary.trim()), 'Facilities or operating footprint', 5],
    [Boolean(input.transition_support.trim()), 'Transition support', 5],
    [Boolean(input.public_title.trim()), 'Anonymous public title', 5],
    [input.public_summary.trim().length >= 80, 'Confidential public summary', 6],
    [parseHighlights(input.public_highlights).length >= 3, 'At least three public highlights', 5],
  ]

  const score = checks.reduce((total, [complete, , weight]) => total + (complete ? weight : 0), 0)
  const missing = checks.filter(([complete]) => !complete).map(([, label]) => label)
  const readinessScore = Math.min(100, score)
  const label = readinessScore >= 90 ? 'Approval ready' : readinessScore >= 70 ? 'Review ready' : readinessScore >= 45 ? 'Needs work' : 'Not ready'
  return { score: readinessScore, label, missing }
}

export const OWNER_LISTING_PLANS = [
  {
    id: 'free', name: 'Free Listing', price: 0, billing: 'first 2 months',
    description: 'One-time free listing for business owners. Free for the first 2 months, then $50/month per listing to stay live.',
    features: ['1 free listing for 2 months', 'Confidential by default', 'Buyer inquiry notifications', 'Renew at $50/mo after the free window'],
    featured: true,
  },
  {
    id: 'professional', name: 'Renewal', price: 50, billing: 'per listing / month',
    description: 'Keep your listing live after the 2-month free window.',
    features: ['$50 per listing per month', 'Stay live — never auto-delete without notice', 'Price shown only to qualified buyers'],
    featured: false,
  },
] as const

export const BROKERAGE_SAAS_PLANS = [
  { id: 'solo', name: 'Solo Advisor', monthly: 499, users: 1, listings: 25 },
  { id: 'growth', name: 'Growth Brokerage', monthly: 999, users: 10, listings: 150 },
  { id: 'enterprise', name: 'Enterprise Network', monthly: 1999, users: 50, listings: 1000 },
] as const

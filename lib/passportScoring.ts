type ListingFacts = Record<string, unknown>

const hasText = (value: unknown, minimum = 1) => typeof value === 'string' && value.trim().length >= minimum
const hasNumber = (value: unknown) => typeof value === 'number' && Number.isFinite(value)

export function scoreDealPassport(listing: ListingFacts, documentCount: number) {
  const documentationSignals = [listing.annual_revenue, listing.sde, listing.ebitda, listing.asking_price].filter(hasNumber).length
  const operatingSignals = [listing.description, listing.competitive_advantages, listing.growth_opportunities, listing.facilities_summary, listing.transition_support].filter((value) => hasText(value, 30)).length
  const riskFlags: string[] = []

  if (!hasNumber(listing.annual_revenue)) riskFlags.push('Revenue is not documented')
  if (!hasNumber(listing.sde) && !hasNumber(listing.ebitda)) riskFlags.push('No normalized earnings metric')
  if (!hasText(listing.customer_concentration)) riskFlags.push('Customer concentration is unknown')
  if (!hasText(listing.transition_support)) riskFlags.push('Transition support is not defined')
  if (typeof listing.owner_hours_weekly === 'number' && listing.owner_hours_weekly > 50) riskFlags.push('High owner dependence')

  const documentationScore = Math.min(100, documentCount * 8 + documentationSignals * 12)
  const verificationScore = Math.min(100, documentationScore * 0.65 + operatingSignals * 7)
  const financingScore = Math.min(100,
    (hasNumber(listing.sde) || hasNumber(listing.ebitda) ? 30 : 0)
    + (hasNumber(listing.asking_price) ? 20 : 0)
    + (hasText(listing.financing_notes, 20) ? 20 : 0)
    + (listing.seller_financing_available ? 15 : 0)
    + (documentCount >= 5 ? 15 : 0),
  )
  const liquidityScore = Math.max(0, Math.min(100,
    70 + operatingSignals * 5 - riskFlags.length * 10 + (listing.confidentiality_level === 'anonymous' ? 5 : 0),
  ))

  return {
    verificationScore: Math.round(verificationScore),
    liquidityScore: Math.round(liquidityScore),
    financingScore: Math.round(financingScore),
    documentationScore: Math.round(documentationScore),
    riskFlags,
    readinessActions: riskFlags.map((flag) => ({ priority: 'high', action: `Resolve: ${flag}` })),
  }
}

export function extractSellerStatedFacts(listing: ListingFacts) {
  const factKeys = ['asking_price', 'annual_revenue', 'sde', 'ebitda', 'employees_full_time', 'employees_part_time', 'owner_hours_weekly', 'customer_concentration', 'transition_support']
  return factKeys.filter((key) => listing[key] !== null && listing[key] !== undefined && listing[key] !== '').map((key) => ({
    fact_key: key,
    fact_label: key.split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' '),
    fact_value: listing[key],
    verification_level: 'seller_stated',
    source_type: 'listing_intake',
    confidence: 0.35,
    public_disclosure_allowed: false,
  }))
}

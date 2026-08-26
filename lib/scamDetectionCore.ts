import { bandForIndustry } from '@/lib/marketMultiplesCore'

// =============================================================================
// Scam / risk detection core — deterministic, zero token cost.
// Scores a listing 0-100 across cheap signals: instant-publish accounts,
// below-market pricing vs the industry band, missing financials, no images,
// suspicious keywords, extreme prices. Used by the admin moderation queue to
// auto-flag critical listings and to rank what deserves a human/AI look.
// =============================================================================

export interface RiskInput {
  businessName?: string | null
  headline?: string | null
  description?: string | null
  industry?: string | null
  askingPrice?: number | null
  annualRevenue?: number | null
  sde?: number | null
  city?: string | null
  state?: string | null
  imageCount?: number
  listingCreatedAt?: string | null
  publishedAt?: string | null
  ownerCreatedAt?: string | null
  alreadyFlagged?: boolean
  flagReasons?: string[] | null
}

export interface RiskReport {
  score: number
  level: 'low' | 'medium' | 'high' | 'critical'
  reasons: string[]
}

export const RISK_THRESHOLDS = { critical: 75, high: 55, medium: 30 }

const SUSPICIOUS_KEYWORDS = [
  'crypto', 'bitcoin', 'guaranteed return', 'guaranteed income', 'wire transfer',
  'western union', 'lottery', 'inheritance', 'offshore', 'money laundering',
  'no paperwork', 'cash only', 'too good to be true', '100% return', 'pyramid',
  'mlm', 'instant income', 'work from home', 'make money fast', 'passive income overnight',
  'no verification', 'steal', 'smuggle',
]

export function levelForScore(score: number): RiskReport['level'] {
  if (score >= RISK_THRESHOLDS.critical) return 'critical'
  if (score >= RISK_THRESHOLDS.high) return 'high'
  if (score >= RISK_THRESHOLDS.medium) return 'medium'
  return 'low'
}

export function assessListingRisk(input: RiskInput): RiskReport {
  const reasons: string[] = []
  let score = 0

  // --- Instant-publish account: classic scam shape ---------------------------
  const ownerAgeMs = ownerAgeDays(input)
  if (ownerAgeMs !== null && ownerAgeMs <= 1) {
    score += 30
    reasons.push('Owner account created within 24h of the listing')
  } else if (ownerAgeMs !== null && ownerAgeMs <= 7) {
    score += 15
    reasons.push('Owner account is under a week old')
  }

  // --- Price vs market band ---------------------------------------------------
  const bandCheck = belowMarketCheck(input)
  if (bandCheck) {
    score += 25
    reasons.push(bandCheck)
  }

  // --- Missing financials ------------------------------------------------------
  const hasFinancials = (input.sde ?? 0) > 0 || (input.annualRevenue ?? 0) > 0
  if (!hasFinancials && (input.askingPrice ?? 0) > 0) {
    score += 15
    reasons.push('Asking price set but no revenue or SDE provided')
  }

  // --- Thin listing content ----------------------------------------------------
  if (!input.headline && !input.description) {
    score += 10
    reasons.push('No headline or description')
  }
  if ((input.imageCount ?? 0) === 0) {
    score += 10
    reasons.push('No photos uploaded')
  }
  if (!input.city && !input.state) {
    score += 5
    reasons.push('No location provided')
  }

  // --- Suspicious keywords -----------------------------------------------------
  const haystack = [input.businessName, input.headline, input.description].filter(Boolean).join(' ').toLowerCase()
  const hits = SUSPICIOUS_KEYWORDS.filter((k) => haystack.includes(k))
  if (hits.length > 0) {
    score += Math.min(30, hits.length * 15)
    reasons.push(`Suspicious keyword(s): ${hits.join(', ')}`)
  }

  // --- Extreme prices ----------------------------------------------------------
  const price = input.askingPrice ?? 0
  if (price > 0 && (price < 1000 || price > 100_000_000)) {
    score += 10
    reasons.push(`Extreme asking price ($${price.toLocaleString()})`)
  }

  // --- Already flagged ---------------------------------------------------------
  if (input.alreadyFlagged) {
    score += 20
    reasons.push('Already flagged for review')
  }

  const clamped = Math.min(100, score)
  return { score: clamped, level: levelForScore(clamped), reasons }
}

function ownerAgeDays(input: RiskInput): number | null {
  const published = input.publishedAt || input.listingCreatedAt
  const owner = input.ownerCreatedAt
  if (!published || !owner) return null
  const diff = new Date(published).getTime() - new Date(owner).getTime()
  if (Number.isNaN(diff)) return null
  return diff / 86_400_000
}

function belowMarketCheck(input: RiskInput): string | null {
  const sde = input.sde ?? 0
  const price = input.askingPrice ?? 0
  if (sde <= 0 || price <= 0) return null
  const band = bandForIndustry(input.industry, 'SDE')
  const floor = sde * band.min
  if (price < floor * 0.5) {
    return `Priced $${price.toLocaleString()} — under half the market band floor (${band.min}× SDE = $${Math.round(floor).toLocaleString()})`
  }
  return null
}

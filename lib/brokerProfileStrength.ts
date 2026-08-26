/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Broker profile strength — pure scoring, no IO.
// Mirrors what Sunbelt/IBBA surface as trust currency: a complete profile with
// a real headshot, verifiable experience, credentials, and contact options
// converts better. Returns 0–100 + a checklist of what's missing.
// =============================================================================

export interface BrokerStrength {
  score: number
  band: 'Strong' | 'Good' | 'Needs work'
  missing: string[]
}

interface BrokerFields {
  avatar_url?: string | null
  public_name?: string | null
  title?: string | null
  bio?: string | null
  phone?: string | null
  email_public?: string | null
  linkedin?: string | null
  years_experience?: number | null
  credentials?: string[] | string | null
  licensed_states?: string[] | string | null
  service_areas?: string[] | string | null
  expertise?: string[] | string | null
  industries?: string[] | string | null
  languages?: string[] | string | null
  booking_url?: string | null
  closed_deals_count?: number | null
  profile_status?: string | null
  is_public?: boolean | null
}

const asList = (v: string[] | string | null | undefined): string[] => {
  if (Array.isArray(v)) return v
  if (typeof v === 'string' && v.trim()) return v.split(',').map((s) => s.trim()).filter(Boolean)
  return []
}

const has = (v: unknown): boolean => {
  if (v == null) return false
  if (typeof v === 'string') return v.trim().length > 0
  if (Array.isArray(v)) return v.length > 0
  return true
}

export function brokerProfileStrength(b: BrokerFields): BrokerStrength {
  const missing: string[] = []

  const add = (ok: boolean, label: string) => {
    if (!ok) missing.push(label)
  }

  // Core identity (35 pts)
  let score = 0
  const hasAvatar = has(b.avatar_url)
  const hasName = has(b.public_name)
  const hasTitle = has(b.title)
  if (hasAvatar) score += 15
  else add(false, 'Add a professional headshot (profiles with photos get 3× more inquiries)')
  if (hasName) score += 12
  else add(false, 'Set your public name')
  if (hasTitle) score += 8
  else add(false, 'Add your title / role')

  // Credibility (30 pts)
  const experience = Number(b.years_experience) || 0
  if (experience >= 10) score += 10
  else if (experience > 0) score += 6
  else add(false, 'Add your years of experience')
  const credentials = asList(b.credentials)
  if (credentials.length > 0) score += 8
  else add(false, 'Add credentials (CBI, MBA, licenses…)')
  const licensed = asList(b.licensed_states)
  if (licensed.length > 0) score += 7
  else add(false, 'List your licensed states')
  if (Number(b.closed_deals_count) > 0) score += 5
  else add(false, 'Add your closed-deal count')

  // Content (20 pts)
  if (has(b.bio) && String(b.bio).length >= 60) score += 10
  else if (has(b.bio)) score += 5
  else add(false, 'Write a 2–3 sentence bio')
  const expertise = asList(b.expertise)
  const industries = asList(b.industries)
  if (expertise.length + industries.length >= 3) score += 10
  else add(false, 'Add 3+ specialties / industries')

  // Contact & reach (15 pts)
  if (has(b.phone)) score += 5
  else add(false, 'Add a phone number (shows a 📞 call button)')
  if (has(b.email_public)) score += 5
  else add(false, 'Add a public email')
  if (has(b.linkedin) || has(b.booking_url)) score += 5
  else add(false, 'Add LinkedIn or a booking link')

  const band = score >= 80 ? 'Strong' : score >= 55 ? 'Good' : 'Needs work'
  return { score: Math.min(100, score), band, missing }
}

export function strengthColor(score: number): string {
  if (score >= 80) return '#1e7e34'
  if (score >= 55) return '#b45309'
  return '#b91c1c'
}

export function strengthLabel(score: number): string {
  if (score >= 80) return 'Strong — buyers see a complete professional'
  if (score >= 55) return 'Good — a few touches will make it great'
  return 'Needs work — complete the checklist to win more deals'
}

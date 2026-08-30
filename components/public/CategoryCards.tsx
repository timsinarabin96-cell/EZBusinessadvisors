/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import Link from 'next/link'

// =============================================================================
// CategoryCards — "Browse by business type" with rich brand colors.
// Each category gets its own gradient, emoji, and count, so the section pops
// instead of the old flat white pill row. Uses the same industry slugs as the
// /marketplace/industry/[slug] SEO pages.
// =============================================================================

export interface CategoryDef {
  key: string          // canonical industry key (slug-safe)
  label: string        // display name
  emoji: string
  gradient: string     // css linear-gradient
  accent: string       // text/border accent on top of the gradient
}

export const BUSINESS_CATEGORIES: CategoryDef[] = [
  { key: 'Food & Beverage', label: 'Food & Beverage', emoji: '🍽️', gradient: 'linear-gradient(135deg,#7f1d1d,#dc2626)', accent: '#fecaca' },
  { key: 'Restaurant', label: 'Restaurants', emoji: '🍝', gradient: 'linear-gradient(135deg,#991b1b,#ef4444)', accent: '#fee2e2' },
  { key: 'Retail', label: 'Retail & Stores', emoji: '🛍️', gradient: 'linear-gradient(135deg,#7c2d12,#f97316)', accent: '#ffedd5' },
  { key: 'Home Care', label: 'Home Care', emoji: '🏠', gradient: 'linear-gradient(135deg,#0c4a6e,#0ea5e9)', accent: '#e0f2fe' },
  { key: 'Healthcare', label: 'Healthcare', emoji: '🩺', gradient: 'linear-gradient(135deg,#0f766e,#14b8a6)', accent: '#ccfbf1' },
  { key: 'Auto Repair', label: 'Auto & Repair', emoji: '🔧', gradient: 'linear-gradient(135deg,#1e3a8a,#3b82f6)', accent: '#dbeafe' },
  { key: 'Construction', label: 'Construction', emoji: '🏗️', gradient: 'linear-gradient(135deg,#713f12,#eab308)', accent: '#fef9c3' },
  { key: 'Manufacturing', label: 'Manufacturing', emoji: '🏭', gradient: 'linear-gradient(135deg,#111827,#4b5563)', accent: '#e5e7eb' },
  { key: 'Cleaning', label: 'Cleaning Services', emoji: '🧹', gradient: 'linear-gradient(135deg,#155e75,#06b6d4)', accent: '#cffafe' },
  { key: 'Laundromat', label: 'Laundromats', emoji: '🧺', gradient: 'linear-gradient(135deg,#1d4ed8,#60a5fa)', accent: '#dbeafe' },
  { key: 'Salon / Barbershop', label: 'Salon & Beauty', emoji: '💇', gradient: 'linear-gradient(135deg,#9d174d,#ec4899)', accent: '#fce7f3' },
  { key: 'Fitness / Gym', label: 'Fitness & Gym', emoji: '🏋️', gradient: 'linear-gradient(135deg,#374151,#6b7280)', accent: '#f3f4f6' },
  { key: 'E-commerce', label: 'E-commerce', emoji: '🛒', gradient: 'linear-gradient(135deg,#065f46,#10b981)', accent: '#d1fae5' },
  { key: 'Software / IT', label: 'Software & IT', emoji: '💻', gradient: 'linear-gradient(135deg,#312e81,#6366f1)', accent: '#e0e7ff' },
  { key: 'Trucking / Logistics', label: 'Trucking & Logistics', emoji: '🚚', gradient: 'linear-gradient(135deg,#78350f,#f59e0b)', accent: '#fef3c7' },
  { key: 'Pet Services', label: 'Pet Services', emoji: '🐾', gradient: 'linear-gradient(135deg,#581c87,#a855f7)', accent: '#f3e8ff' },
  { key: 'Childcare', label: 'Childcare & Daycare', emoji: '🧸', gradient: 'linear-gradient(135deg,#831843,#f472b6)', accent: '#fce7f3' },
  { key: 'Gas Station / C-Store', label: 'Gas & Convenience', emoji: '⛽', gradient: 'linear-gradient(135deg,#1e1b4b,#4f46e5)', accent: '#e0e7ff' },
  { key: 'Car Wash', label: 'Car Wash', emoji: '🚗', gradient: 'linear-gradient(135deg,#0e7490,#22d3ee)', accent: '#cffafe' },
  { key: 'Self Storage', label: 'Self Storage', emoji: '📦', gradient: 'linear-gradient(135deg,#404040,#a3a3a3)', accent: '#f5f5f5' },
]

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

/** Match a free-text industry label to a known category card (fuzzy). */
export function categoryCardFor(industry: string | null | undefined): CategoryDef | null {
  const target = (industry || '').toLowerCase().trim()
  if (!target) return null
  for (const c of BUSINESS_CATEGORIES) {
    const key = c.key.toLowerCase()
    if (target === key) return c
    if (key.includes(target) || target.includes(key)) return c
  }
  return null
}

export default function CategoryCards({
  industries,
  limit = 12,
  title = 'Browse by business type',
  subtitle = 'Pick a category to see vetted businesses for sale',
}: {
  industries: string[]
  limit?: number
  title?: string
  subtitle?: string
}) {
  const cards = BUSINESS_CATEGORIES.filter((c) => !industries.length || industries.some((i) => categoryCardFor(i)?.key === c.key))
  const shown = cards.slice(0, limit)
  const usedIndustries = new Set(shown.map((c) => c.key))

  return (
    <section style={{ maxWidth: 1200, margin: '0 auto', padding: '48px 24px 8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ color: '#c9a84c', fontSize: 12, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 700 }}>Explore the market</div>
          <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 30, color: '#1a1a2e', margin: '6px 0 4px' }}>{title}</h2>
          {subtitle && <div style={{ color: '#888', fontSize: 14 }}>{subtitle}</div>}
        </div>
        <Link href="/marketplace/listings" style={{ color: '#1a1a2e', fontWeight: 700, fontFamily: 'Georgia, serif', textDecoration: 'none', whiteSpace: 'nowrap' }}>
          View all listings →
        </Link>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(200px, 100%), 1fr))', gap: 14 }}>
        {shown.map((c) => (
          <Link
            key={c.key}
            href={`/marketplace/industry/${slugify(c.key)}`}
            style={{
              display: 'block', textDecoration: 'none', borderRadius: 16, padding: '22px 20px',
              background: c.gradient, color: '#fff', position: 'relative', overflow: 'hidden',
              boxShadow: '0 10px 30px rgba(26,26,46,0.16)', transition: 'transform .18s ease, box-shadow .18s ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 18px 44px rgba(26,26,46,0.28)' }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 10px 30px rgba(26,26,46,0.16)' }}
          >
            <div style={{ position: 'absolute', right: -14, bottom: -14, fontSize: 72, opacity: 0.18, transform: 'rotate(-8deg)' }}>{c.emoji}</div>
            <div style={{ fontSize: 30, marginBottom: 10, filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.25))' }}>{c.emoji}</div>
            <div style={{ fontSize: 15.5, fontWeight: 800, fontFamily: 'Georgia, serif', lineHeight: 1.25 }}>{c.label}</div>
            <div style={{ fontSize: 12, color: c.accent, marginTop: 6, fontWeight: 700, opacity: 0.92 }}>Browse listings →</div>
          </Link>
        ))}
      </div>
    </section>
  )
}

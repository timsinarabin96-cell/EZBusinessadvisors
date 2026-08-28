/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { Plan } from '@/lib/billing'

/**
 * Tiered pricing cards for the public /pricing page.
 * Monthly/annual toggle; per-tier limit chips (listings · seats) so the
 * Professional → Enterprise ladder reads at a glance. Prices come from
 * lib/pricing.ts (single source of truth) — never hardcode here.
 */
export default function PricingTiers({ plans }: { plans: Plan[] }) {
  const [annual, setAnnual] = useState(false)
  const paid = plans.filter((p) => p.monthly > 0)

  return (
    <section style={{ maxWidth: 1100, margin: '0 auto', padding: '56px 24px 8px' }}>
      {/* Billing toggle */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 36 }}>
        <div style={{ display: 'inline-flex', background: '#f0ede2', borderRadius: 999, padding: 4, gap: 4 }}>
          {(['monthly', 'annual'] as const).map((mode) => {
            const active = annual === (mode === 'annual')
            return (
              <button
                key={mode}
                type="button"
                onClick={() => setAnnual(mode === 'annual')}
                aria-pressed={active}
                style={{
                  border: 'none', cursor: 'pointer', borderRadius: 999,
                  padding: '9px 22px', fontSize: 13.5, fontWeight: 800, fontFamily: 'Georgia, serif',
                  background: active ? '#1a1a2e' : 'transparent',
                  color: active ? '#c9a84c' : '#666',
                  transition: 'all 0.15s ease',
                }}
              >
                {mode === 'monthly' ? 'Monthly' : 'Annual · 2 months free'}
              </button>
            )
          })}
        </div>
      </div>

      {/* Tier cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
        {plans.map((plan) => {
          const isFree = plan.monthly === 0
          const annualPerMonth = isFree ? 0 : Math.round(plan.annual / 12)
          const savings = isFree ? 0 : plan.monthly * 12 - plan.annual
          return (
            <div
              key={plan.id}
              style={{
                background: '#fff', borderRadius: 14,
                border: plan.highlighted ? '2px solid #c9a84c' : '1px solid #ece8dc',
                boxShadow: plan.highlighted ? '0 8px 40px rgba(201,168,76,0.2)' : '0 2px 12px rgba(26,26,46,0.06)',
                padding: '30px 28px', display: 'flex', flexDirection: 'column',
              }}
            >
              {plan.highlighted && (
                <div style={{ background: 'linear-gradient(90deg,#c9a84c,#e6ce8c)', color: '#1a1a2e', textAlign: 'center', padding: '6px', fontSize: 12, fontWeight: 800, letterSpacing: 1, borderRadius: 6, marginBottom: 14 }}>MOST POPULAR</div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 26 }}>{plan.icon}</span>
                <span style={{ fontSize: 20, fontWeight: 800, color: '#1a1a2e', fontFamily: 'Georgia, serif' }}>{plan.name}</span>
              </div>
              <div style={{ fontSize: 12, color: '#888', marginTop: 6 }}>{plan.tagline}</div>

              {/* Price */}
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 14 }}>
                <span style={{ fontSize: 38, fontWeight: 800, color: '#c9a84c', fontFamily: 'Georgia, serif' }}>
                  {isFree ? 'Free' : `$${annual ? plan.annual.toLocaleString() : plan.monthly}`}
                </span>
                {!isFree && <span style={{ color: '#888', fontSize: 14 }}>{annual ? '/ year' : '/ month'}</span>}
              </div>
              {!isFree && annual && (
                <div style={{ fontSize: 12.5, color: '#1a1a2e', marginTop: 4, fontWeight: 700 }}>
                  ≈ ${annualPerMonth}/mo billed annually · save ${savings.toLocaleString()}/yr
                </div>
              )}

              {/* Limit chips — the tier ladder at a glance */}
              {(plan.listings || plan.seats) && (
                <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                  {plan.listings != null && (
                    <span style={{ background: '#faf9f4', border: '1px solid #ece8dc', borderRadius: 999, padding: '4px 12px', fontSize: 12.5, fontWeight: 700, color: '#1a1a2e' }}>
                      📋 {plan.listings} {plan.listings === 1 ? 'listing' : 'listings'}
                    </span>
                  )}
                  {plan.seats != null && (
                    <span style={{ background: '#faf9f4', border: '1px solid #ece8dc', borderRadius: 999, padding: '4px 12px', fontSize: 12.5, fontWeight: 700, color: '#1a1a2e' }}>
                      👥 {plan.seats} {plan.seats === 1 ? 'seat' : 'seats'}
                    </span>
                  )}
                </div>
              )}

              <ul style={{ flex: 1, padding: '18px 0 0', margin: 0, listStyle: 'none' }}>
                {plan.features.map((f) => (
                  <li key={f} style={{ padding: '7px 0', fontSize: 13.5, color: '#555', display: 'flex', gap: 8 }}>
                    <span style={{ color: '#c9a84c' }}>✓</span> {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/auth/signup"
                style={{
                  display: 'block', textAlign: 'center', marginTop: 20, padding: '13px', borderRadius: 8, textDecoration: 'none',
                  background: plan.highlighted ? '#1a1a2e' : '#fff', color: plan.highlighted ? '#c9a84c' : '#1a1a2e',
                  border: plan.highlighted ? 'none' : '2px solid #1a1a2e', fontWeight: 800, fontFamily: 'Georgia, serif',
                }}
              >
                {plan.cta}
              </Link>
            </div>
          )
        })}
      </div>

      <p style={{ textAlign: 'center', color: '#999', fontSize: 12.5, marginTop: 22 }}>
        All paid plans include a 14-day free trial. Prices in USD. {paid.length > 0 && 'Need more listings or seats? '}
        <Link href="/contact" style={{ color: '#c9a84c', fontWeight: 700, textDecoration: 'none' }}>Talk to us</Link>.
      </p>
    </section>
  )
}

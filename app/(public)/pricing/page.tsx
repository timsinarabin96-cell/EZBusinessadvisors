/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import type { Metadata } from 'next'
import Link from 'next/link'
import { PLANS, CRM_LICENSE } from '@/lib/billing'
import { BUYER_PASS_PLANS } from '@/lib/buyerPass'
import PricingTiers from '@/components/public/PricingTiers'

export const metadata: Metadata = {
  title: 'Pricing — Concord Deal Platform',
  description: 'List your business free, grow with Professional ($499) or Enterprise ($899), or own the entire CRM platform on your own domain with your own API keys.',
}

export default function PricingPage() {
  return (
    <div>
      {/* Header */}
      <section style={{ background: 'linear-gradient(135deg,#1a1a2e 0%,#16213e 60%,#0f3460 100%)', color: '#fff', padding: '72px 24px 56px', textAlign: 'center' }}>
        <div style={{ color: '#c9a84c', fontSize: 12, letterSpacing: '0.25em', textTransform: 'uppercase', fontWeight: 700 }}>Pricing</div>
        <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(30px, 5vw, 44px)', margin: '12px 0 10px', color: '#fff', textShadow: '0 2px 12px rgba(0,0,0,0.35)' }}>Simple Plans. Serious Platform.</h1>
        <p style={{ color: 'rgba(255,255,255,0.75)', maxWidth: 600, margin: '0 auto', fontSize: 15.5, lineHeight: 1.65 }}>
          Start free as a business owner. Post on our marketplace as a brokerage. Or own the entire CRM on your own domain — your brand, your API keys, your data.
        </p>
      </section>

      {/* Subscription tiers — tiered pricing (monthly/annual toggle, limits) */}
      <PricingTiers plans={PLANS} />

      {/* AI Match Pass — buyers */}
      <section id="match-pass" style={{ maxWidth: 1100, margin: '0 auto', padding: '56px 24px' }}>
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{ color: '#c9a84c', fontSize: 12, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 700 }}>For Buyers</div>
          <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 30, color: '#1a1a2e', margin: '8px 0 8px' }}>🎯 AI Match Pass</h2>
          <p style={{ fontSize: 15, color: '#666', maxWidth: 620, margin: '0 auto', lineHeight: 1.65 }}>
            Be the first to know when a deal matches you. Priority alerts, off-market listings, AI fit-scoring, and a verified-buyer badge that makes sellers take you seriously.
          </p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
          {BUYER_PASS_PLANS.map((plan) => (
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
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 14 }}>
                <span style={{ fontSize: 38, fontWeight: 800, color: '#c9a84c', fontFamily: 'Georgia, serif' }}>${plan.monthly}</span>
                <span style={{ color: '#888', fontSize: 14 }}>/ month</span>
              </div>
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
          ))}
        </div>
      </section>

      {/* Own the CRM */}
      <section style={{ background: '#faf9f4', padding: '56px 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', textAlign: 'center' }}>
          <div style={{ color: '#c9a84c', fontSize: 12, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 700 }}>For Brokerages</div>
          <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 30, color: '#1a1a2e', margin: '8px 0 10px' }}>Own the CRM Platform</h2>
          <p style={{ fontSize: 15, color: '#666', maxWidth: 640, margin: '0 auto 32px', lineHeight: 1.65 }}>
            The complete system behind this marketplace — on <strong>your own domain</strong>, with <strong>your own API keys</strong>, billed entirely to you.
          </p>
          <div style={{ background: '#fff', border: '2px solid #c9a84c', borderRadius: 14, maxWidth: 520, margin: '0 auto', padding: 30, boxShadow: '0 12px 48px rgba(201,168,76,0.18)' }}>
            <div style={{ fontSize: 12, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#8a6d1a', fontWeight: 800 }}>One-Time License</div>
            <div style={{ fontFamily: 'Georgia, serif', fontSize: 44, fontWeight: 800, color: '#1a1a2e', margin: '8px 0 2px' }}>${CRM_LICENSE.setupFee.toLocaleString()}</div>
            <div style={{ fontSize: 13, color: '#888', marginBottom: 18 }}>+ ${CRM_LICENSE.monthly}/month platform fee</div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, textAlign: 'left' }}>
              {CRM_LICENSE.includes.map((f) => (
                <li key={f} style={{ padding: '7px 0', fontSize: 13.5, color: '#555', display: 'flex', gap: 8 }}>
                  <span style={{ color: '#c9a84c' }}>✓</span> {f}
                </li>
              ))}
            </ul>
            <Link href="/contact" style={{ display: 'block', textAlign: 'center', marginTop: 22, background: '#1a1a2e', color: '#c9a84c', padding: '13px 0', borderRadius: 8, textDecoration: 'none', fontWeight: 800, fontFamily: 'Georgia, serif' }}>
              Request a Demo
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}

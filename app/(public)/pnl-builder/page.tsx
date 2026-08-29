/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import type { Metadata } from 'next'
import Link from 'next/link'
import PublicPnlBuilder from '@/components/public/PublicPnlBuilder'
import { SponsoredSlot } from '@/components/public/SponsoredSlot'


export const metadata: Metadata = {
  title: 'Free P&L Builder — See Your Business\u2019s Real Earnings | Concord',
  description: 'Upload-free P&L recast tool: enter your revenue and owner benefits to see the true seller\u2019s discretionary earnings buyers actually pay for.',
  alternates: { canonical: '/pnl-builder' },
  openGraph: {
    title: 'Free P&L Builder — Know Your True Earnings',
    description: 'Recast your P&L in 60 seconds: revenue, add-backs, owner benefits → the SDE figure buyers actually use.',
    url: '/pnl-builder',
    type: 'website',
  },
}

// =============================================================================
// /pnl-builder — public P&L recast lead magnet (Flippa's P&L Builder play).
// Sellers enter high-level numbers; we show an instant SDE-style recast and
// capture the lead → seller lead lands in the CRM.
// =============================================================================

export default function PnlBuilderPage() {
  return (
    <main style={{ background: '#f4f7fb', minHeight: '100vh' }}>
      <section style={{ background: 'linear-gradient(135deg,#071827,#0f3460)', color: '#fff', padding: '72px 24px 56px', textAlign: 'center' }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <div style={{ display: 'inline-block', padding: '7px 16px', borderRadius: 99, background: 'rgba(201,168,76,0.15)', border: '1px solid rgba(201,168,76,0.45)', color: '#c9a84c', fontSize: 12.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            📊 Free · 60 seconds · No uploads needed
          </div>
          <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 44, lineHeight: 1.14, margin: '22px 0 14px', color: '#fff', textShadow: '0 2px 12px rgba(0,0,0,0.35)' }}>
            What does a buyer <span style={{ color: '#c9a84c' }}>actually earn</span> from your business?
          </h1>
          <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.82)', lineHeight: 1.7, maxWidth: 580, margin: '0 auto' }}>
            Buyers don&apos;t pay for revenue — they pay for earnings. Recast your P&L the way brokers do: add back owner perks and one-time costs to see your true Seller&apos;s Discretionary Earnings (SDE).
          </p>
        </div>
      </section>

      <section style={{ padding: '48px 24px 72px' }}>
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          <PublicPnlBuilder />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(240px, 100%), 1fr))', gap: 16, marginTop: 40 }}>
            {[
              ['🧾', 'Broker-standard recast', 'Owner salary, discretionary perks, one-time expenses — the exact add-backs a buyer\u2019s lender and broker will use.'],
              ['🔍', 'Know your number first', 'Sellers who know their SDE negotiate from strength. Most owners under-value their earnings by 20–40%.'],
              ['🔗', 'Pair with a free valuation', 'Use your recast SDE in the valuation tool to see your full market range.'],
            ].map(([icon, t, b]) => (
              <div key={t} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 22 }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>{icon}</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#102a43', fontFamily: 'Georgia, serif' }}>{t}</div>
                <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.6, marginTop: 6 }}>{b}</div>
              </div>
            ))}
          </div>

          <div style={{ textAlign: 'center', marginTop: 36, fontSize: 14, color: '#64748b' }}>
            Have your recast number? <Link href="/valuation" style={{ color: '#0e7490', fontWeight: 700 }}>Get your free market valuation →</Link>
          </div>
        </div>
      </section>
      <SponsoredSlot slotKey="valuation_sidebar" />
    </main>
  )
}

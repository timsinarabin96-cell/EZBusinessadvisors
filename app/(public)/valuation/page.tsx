/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import type { Metadata } from 'next'
import Link from 'next/link'
import FreeValuationTool from '@/components/public/FreeValuationTool'
import { SponsoredSlot } from '@/components/public/SponsoredSlot'


export const metadata: Metadata = {
  title: 'Free Business Valuation — Instant Market Range | Concord',
  description: 'Get an instant, data-backed valuation range for your business in seconds. Industry multiples, market data, and a broker-grade report from Concord.',
  alternates: { canonical: '/valuation' },
  openGraph: {
    title: 'Free Business Valuation — Instant Market Range',
    description: 'See what your business is worth in seconds. Instant range, no account needed — then unlock the full report with your email.',
    url: '/valuation',
    type: 'website',
  },
}

// =============================================================================
// /valuation — the free-valuation lead magnet (Flippa's #1 seller funnel).
// Instant industry-multiple estimate client-side, then email capture → the
// seller lead lands in the CRM and the broker inbox gets notified.
// =============================================================================

export default function ValuationPage() {
  return (
    <main style={{ background: '#f4f7fb', minHeight: '100vh' }}>
      <section style={{ background: 'linear-gradient(135deg,#071827,#0f3460)', color: '#fff', padding: '72px 24px 56px', textAlign: 'center' }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <div style={{ display: 'inline-block', padding: '7px 16px', borderRadius: 99, background: 'rgba(201,168,76,0.15)', border: '1px solid rgba(201,168,76,0.45)', color: '#c9a84c', fontSize: 12.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            💎 Free · 30 seconds · No obligation
          </div>
          <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 46, lineHeight: 1.12, margin: '22px 0 14px' }}>
            What is your business <span style={{ color: '#c9a84c' }}>really worth?</span>
          </h1>
          <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.82)', lineHeight: 1.7, maxWidth: 560, margin: '0 auto' }}>
            Industry multiples, real market data, and a broker-grade read — in seconds. Unlock your full range and report below.
          </p>
        </div>
      </section>

      <section style={{ padding: '48px 24px 72px' }}>
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          <FreeValuationTool />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginTop: 40 }}>
            {[
              ['📊', 'Data-backed multiples', 'Ranges derived from industry transaction data — home care 4–5× EBITDA, restaurants ~2–3× SDE, and 40+ industry bands.'],
              ['🤫', '100% confidential', 'Your business identity is never exposed. The report is private and only your broker sees the details.'],
              ['⚡', 'Same-week broker review', 'A licensed Concord broker reviews your submission and follows up with a detailed opinion of value.'],
            ].map(([icon, t, b]) => (
              <div key={t} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 22 }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>{icon}</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#102a43', fontFamily: 'Georgia, serif' }}>{t}</div>
                <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.6, marginTop: 6 }}>{b}</div>
              </div>
            ))}
          </div>

          <div style={{ textAlign: 'center', marginTop: 36, fontSize: 14, color: '#64748b' }}>
            Not ready to sell yet? <Link href="/brokerai" style={{ color: '#0e7490', fontWeight: 700 }}>See how BrokerAI keeps your deal moving →</Link>
          </div>
        </div>
      </section>
      <SponsoredSlot slotKey="valuation_sidebar" />
    </main>
  )
}

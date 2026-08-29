/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import type { Metadata } from 'next'
import Link from 'next/link'
import { fetchAllIndustries } from '@/lib/marketplace'
import { getPublicAgencyContext } from '@/lib/publicAgency'
import DealAlertsSignup from '@/components/public/DealAlertsSignup'

// ===========================================================================
// /marketplace/alerts — public deal-alert signup + self-service management.
// Accountless email capture (→ deal_notify_subscriptions, CRM-visible) with
// an instant "manage my alerts" flow for the same email.
// ===========================================================================

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://ezbusinessadvisors.vercel.app'

export const metadata: Metadata = {
  title: 'Deal Alerts — Get Notified When a Business Goes Live | Concord',
  description:
    'Create free deal alerts: tell us your target industry and price range, and get an email the moment a matching business is listed. No account needed.',
  alternates: { canonical: `${BASE}/marketplace/alerts` },
}

export default async function DealAlertsPage() {
  const agency = await getPublicAgencyContext()
  const industries = await fetchAllIndustries(agency?.scope || null)

  return (
    <div style={{ background: '#f7f6f2', minHeight: '100vh' }}>
      {/* Hero */}
      <section style={{ background: 'linear-gradient(135deg,#1a1a2e 0%,#16213e 60%,#0f3460 100%)', color: '#fff', padding: '64px 24px' }}>
        <div style={{ maxWidth: 980, margin: '0 auto', textAlign: 'center' }}>
          <div style={{ color: '#c9a84c', fontSize: 13, letterSpacing: '0.25em', textTransform: 'uppercase', fontWeight: 700 }}>
            First to know. First to act.
          </div>
          <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(30px, 4.6vw, 44px)', color: '#fff', margin: '14px 0 12px', lineHeight: 1.15 }}>
            Deal Alerts That Find Your Business Before Anyone Else
          </h1>
          <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.78)', maxWidth: 640, margin: '0 auto', lineHeight: 1.65 }}>
            Set your target industry and price range once. When a matching business goes live,
            we email you immediately — no account, no spam, unsubscribe anytime.
          </p>
          <div style={{ marginTop: 24, display: 'flex', gap: 22, justifyContent: 'center', flexWrap: 'wrap', fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>
            <span>⚡ Instant email on new matches</span>
            <span>🎯 Industry + price targeting</span>
            <span>🔒 Your email stays private</span>
          </div>
        </div>
      </section>

      {/* Signup + manage */}
      <section style={{ maxWidth: 900, margin: '0 auto', padding: '40px 24px 64px' }}>
        <DealAlertsSignup industries={industries} />

        {/* How it works */}
        <div style={{ marginTop: 40, background: '#fff', border: '1px solid #ece8dc', borderRadius: 16, padding: 28 }}>
          <div style={{ fontSize: 12, color: '#c9a84c', letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 16 }}>How it works</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20 }}>
            <Step n="1" title="Set your criteria" body="Pick an industry (restaurant, HVAC, e-commerce…) and a price range that fits your acquisition goals." />
            <Step n="2" title="We watch the market" body="Our brokers review every new listing against active alert criteria before it's even published." />
            <Step n="3" title="You get the email" body="The moment a match goes live, a personalized alert lands in your inbox — often before it's public." />
          </div>
        </div>

        {/* Why alerts beat browsing */}
        <div style={{ marginTop: 28, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18 }}>
          <div style={{ background: '#fff', border: '1px solid #ece8dc', borderRadius: 14, padding: 24 }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>⏱️</div>
            <div style={{ fontWeight: 800, color: '#1a1a2e', fontFamily: 'Georgia, serif', fontSize: 16 }}>Best deals move fast</div>
            <div style={{ fontSize: 13.5, color: '#666', lineHeight: 1.6, marginTop: 6 }}>
              Quality businesses at fair prices get offers within days. Alerts put you in the first round of buyers.
            </div>
          </div>
          <div style={{ background: '#fff', border: '1px solid #ece8dc', borderRadius: 14, padding: 24 }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>🎯</div>
            <div style={{ fontWeight: 800, color: '#1a1a2e', fontFamily: 'Georgia, serif', fontSize: 16 }}>No more daily scrolling</div>
            <div style={{ fontSize: 13.5, color: '#666', lineHeight: 1.6, marginTop: 6 }}>
              Set it once and let the market come to you. Only listings matching your criteria ever reach your inbox.
            </div>
          </div>
          <div style={{ background: '#fff', border: '1px solid #ece8dc', borderRadius: 14, padding: 24 }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>🤝</div>
            <div style={{ fontWeight: 800, color: '#1a1a2e', fontFamily: 'Georgia, serif', fontSize: 16 }}>Broker-curated matches</div>
            <div style={{ fontSize: 13.5, color: '#666', lineHeight: 1.6, marginTop: 6 }}>
              Alerts are matched against real listings vetted by licensed brokers — not scraped feeds or stale inventory.
            </div>
          </div>
        </div>

        <div style={{ textAlign: 'center', marginTop: 36, fontSize: 14, color: '#777' }}>
          Prefer to browse now?{' '}
          <Link href="/marketplace/listings" style={{ color: '#1a1a2e', fontWeight: 800 }}>Browse all listings →</Link>
        </div>
      </section>
    </div>
  )
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div>
      <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#1a1a2e', color: '#c9a84c', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Georgia, serif', fontSize: 15, fontWeight: 700, marginBottom: 10 }}>{n}</div>
      <div style={{ fontWeight: 800, color: '#1a1a2e', fontSize: 15, fontFamily: 'Georgia, serif' }}>{title}</div>
      <div style={{ fontSize: 13.5, color: '#666', lineHeight: 1.6, marginTop: 6 }}>{body}</div>
    </div>
  )
}

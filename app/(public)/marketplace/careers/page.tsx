/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import type { Metadata } from 'next'
import Link from 'next/link'

// Careers — recruiting engine page: why join, open roles, and how to apply.

export const metadata: Metadata = {
  title: 'Careers — Join Our Brokerage Team | Concord Deal Platform',
  description: 'Build a career in business brokerage: open roles for business brokers, intermediaries, and support — with training, certification, and commission-based growth.',
  alternates: { canonical: '/marketplace/careers' },
  openGraph: { title: 'Careers — Concord Deal Platform', description: 'Join a brokerage that trains, certifies, and rewards its brokers.', url: '/marketplace/careers', type: 'website' },
}

const roles = [
  {
    title: 'Business Broker / Intermediary',
    type: 'Full-time · Remote + Local',
    desc: 'Source listings, qualify buyers, and run confidential transactions end-to-end. CBI certification training provided — we invest in your license to close.',
  },
  {
    title: 'Junior Broker Associate',
    type: 'Full-time · Remote',
    desc: 'Learn the craft alongside certified intermediaries: valuations, recasts, CIMs, NDAs, and deal management. The best training seat in Main Street brokerage.',
  },
  {
    title: 'SBA Loan Specialist',
    type: 'Contract · Flexible',
    desc: 'Advise buyers and sellers on SBA 7(a) readiness, structure deals for bankability, and work with lenders to clear deals to close.',
  },
  {
    title: 'Marketing & Syndication Lead',
    type: 'Full-time · Remote',
    desc: 'Own listing marketing, platform syndication, email nurture, and marketplace growth. Data-driven, channel-obsessed, deal-focused.',
  },
]

const perks = [
  ['🎓', 'Paid CBI certification', 'Complete the full 12-module Certified Business Intermediary program — on us — and earn your verifiable certificate.'],
  ['💰', 'Industry-leading splits', 'Tiered commission structure that rewards closers, with no cap on earnings.'],
  ['🛠️', 'The best toolkit in the industry', 'AI deal autopilot, data rooms, recast engine, marketing store, and a full CRM — you sell, we run the software.'],
  ['📈', 'Real growth path', 'Associate → Broker → Senior Broker → Agency Partner. We promote from inside and document every path.'],
  ['🤝', 'Referral network', 'Immediate access to CPAs, lenders, attorneys, and a buyer list that took years to build.'],
  ['🌎', 'Work where you win', 'Remote-first with optional local presence. You bring the hustle; we bring the infrastructure.'],
]

export default function CareersPage() {
  return (
    <main style={{ background: '#f4f7fb', minHeight: '100vh' }}>
      {/* Hero */}
      <section style={{ background: 'linear-gradient(135deg,#071827,#0f3460)', color: '#fff', padding: '72px 24px' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <div style={{ color: '#76d7ea', textTransform: 'uppercase', letterSpacing: '.18em', fontSize: 12, fontWeight: 900 }}>Careers</div>
          <h1 style={{ color: '#fff', fontSize: 46, maxWidth: 720, margin: '14px 0' }}>Close deals. Build a practice. Own your future.</h1>
          <p style={{ color: '#cbdbe7', fontSize: 17, lineHeight: 1.65, maxWidth: 680 }}>
            We\'re building the most professional Main Street brokerage in the country — certified intermediaries, world-class
            software, and a culture that pays closers what they\'re worth.
          </p>
          <div style={{ marginTop: 22, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <a href="mailto:careers@concord.deal?subject=Careers%20Inquiry" style={{ background: '#0e7490', color: '#fff', padding: '12px 22px', borderRadius: 8, textDecoration: 'none', fontWeight: 700, fontSize: 14 }}>
              Apply now — careers@concord.deal
            </a>
            <Link href="/marketplace/certified" style={{ border: '1px solid rgba(255,255,255,0.5)', color: '#fff', padding: '12px 22px', borderRadius: 8, textDecoration: 'none', fontWeight: 700, fontSize: 14 }}>
              See what certification means
            </Link>
          </div>
        </div>
      </section>

      {/* Why join */}
      <section style={{ maxWidth: 1080, margin: '0 auto', padding: '52px 24px' }}>
        <h2 style={{ fontSize: 28, margin: '0 0 8px' }}>Why join Concord</h2>
        <p style={{ color: '#52606d', margin: '0 0 26px', fontSize: 15 }}>
          We give you the training, tools, and deal flow to build a serious brokerage career — then get out of your way.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 18 }}>
          {perks.map(([icon, title, body]) => (
            <div key={title} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 24 }}>
              <div style={{ fontSize: 26 }}>{icon}</div>
              <h3 style={{ fontSize: 16.5, margin: '10px 0 6px' }}>{title}</h3>
              <p style={{ color: '#52606d', fontSize: 13.5, lineHeight: 1.6, margin: 0 }}>{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Open roles */}
      <section style={{ maxWidth: 1080, margin: '0 auto', padding: '16px 24px 72px' }}>
        <h2 style={{ fontSize: 28, margin: '0 0 24px' }}>Open roles</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {roles.map((r) => (
            <div key={r.title} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '22px 26px', display: 'flex', gap: 18, alignItems: 'flex-start', flexWrap: 'wrap', justifyContent: 'space-between' }}>
              <div style={{ maxWidth: 640 }}>
                <h3 style={{ fontSize: 18, margin: '0 0 4px' }}>{r.title}</h3>
                <div style={{ fontSize: 12.5, color: '#0e7490', fontWeight: 700, marginBottom: 8 }}>{r.type}</div>
                <p style={{ color: '#52606d', fontSize: 14, lineHeight: 1.6, margin: 0 }}>{r.desc}</p>
              </div>
              <a href={`mailto:careers@concord.deal?subject=${encodeURIComponent('Application — ' + r.title)}`} style={{ background: '#0e7490', color: '#fff', padding: '10px 18px', borderRadius: 8, textDecoration: 'none', fontWeight: 700, fontSize: 13.5, whiteSpace: 'nowrap' }}>
                Apply →
              </a>
            </div>
          ))}
        </div>
        <p style={{ color: '#7b8794', fontSize: 13, marginTop: 20, textAlign: 'center' }}>
          Don\'t see your role? We\'re always hiring exceptional people — send a note to careers@concord.deal.
        </p>
      </section>
    </main>
  )
}

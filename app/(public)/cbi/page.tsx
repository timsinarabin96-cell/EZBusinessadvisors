/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import type { Metadata } from 'next'
import Link from 'next/link'

// /cbi — standalone CBI certification sales page. Sells the training program
// as its own product (not just a license feature): brokers pay to become
// Certified Business Intermediaries.

export const metadata: Metadata = {
  title: 'CBI Certification — Become a Certified Business Intermediary',
  description: 'The 14-module Certified Business Intermediary program: valuation science, financial recasting, confidentiality, deal structuring, SBA financing, negotiation, and closing. Earn your verifiable certificate.',
  alternates: { canonical: '/cbi' },
  openGraph: {
    title: 'CBI Certification — Concord',
    description: 'Become a Certified Business Intermediary. 14 modules, verifiable certificate, career-grade credential.',
    url: '/cbi',
    type: 'website',
  },
}

const modules = [
  ['📘', 'Introduction to Business Brokerage', 'The broker role, deal lifecycle, ethics, and legal basics.'],
  ['💰', 'Business Valuation Fundamentals', 'SDE, EBITDA, multiples, adjustments, defensible pricing.'],
  ['🔍', 'Sourcing & Qualifying Listings', 'Finding sellable businesses and qualifying sellers.'],
  ['📊', 'P&L Recasting & Normalization', 'Owner bookkeeping → broker-grade financials with add-backs.'],
  ['📑', 'Building the CIM & BOV', 'Memorandums and overviews that actually sell.'],
  ['🤝', 'Buyer Sourcing & Confidentiality', 'NDAs, qualification, and managing confidentiality.'],
  ['⚖️', 'Due Diligence & Deal Structuring', 'LOIs, purchase agreements, and structure options.'],
  ['🏦', 'SBA & Deal Financing', 'SBA 7(a) mechanics, lender qualification, bankability.'],
  ['✍️', 'Negotiation & Closing', 'Price, terms, timeline — driving to closing.'],
  ['📣', 'Marketing & Selling Your Services', 'Listing marketing, lead gen, branding.'],
  ['🎮', 'Deal Simulator & AI Roleplay', 'Practice recasting, valuation, and negotiation with AI grading.'],
  ['⚖️', 'Ethics & Professional Conduct', 'Fiduciary duties, disclosure, and the Code of Ethics.'],
  ['📈', 'Brand Awareness & Business Development', 'Building your book and your reputation.'],
]

const plans = [
  {
    id: 'self',
    name: 'Self-Study',
    price: 497,
    tagline: 'Everything, at your pace',
    features: [
      'All 14 CBI modules + lessons + quizzes',
      'Deal Simulator + AI-graded recast exercises',
      'AI Tutor on every lesson',
      'Module certificates + full program certificate',
      'Gamified XP, streaks & CBI title ladder',
      'CBI Certified public badge (on completion)',
    ],
    cta: 'Start Self-Study',
    highlighted: false,
  },
  {
    id: 'mentored',
    name: 'Mentored',
    price: 997,
    tagline: 'Fastest path to certified',
    highlighted: true,
    features: [
      'Everything in Self-Study',
      'AI Roleplay negotiation practice',
      'Priority AI grading + coaching feedback',
      'Quarterly live group Q&A with senior intermediaries',
      'Resume-ready CBI credential package',
      'Priority placement in the public certified directory',
    ],
    cta: 'Start Mentored',
  },
]

export default function CbiPage() {
  return (
    <main style={{ background: '#f4f7fb', minHeight: '100vh' }}>
      {/* Hero */}
      <section style={{ background: 'linear-gradient(135deg,#1a1a2e 0%,#16213e 60%,#0f3460 100%)', color: '#fff', padding: '80px 24px' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto', textAlign: 'center' }}>
          <div style={{ color: '#c9a84c', textTransform: 'uppercase', letterSpacing: '.18em', fontSize: 12, fontWeight: 900 }}>Career-Grade Credential</div>
          <h1 style={{ color: '#fff', fontSize: 44, maxWidth: 800, margin: '14px auto' }}>
            Become a Certified Business Intermediary
          </h1>
          <p style={{ color: '#cbdbe7', fontSize: 17, lineHeight: 1.65, maxWidth: 720, margin: '0 auto' }}>
            The 14-module CBI program turns you into a complete business-brokerage professional — valuation science, financial
            recasting, confidentiality, deal structuring, SBA financing, negotiation, and closing — with verifiable certificates
            and a public credential buyers and sellers trust.
          </p>
          <div style={{ marginTop: 24, display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            {['🎓 14 modules', '🔎 Verifiable certificates', '🎮 Deal simulator + AI coaching', '🏆 CBI title ladder'].map((t) => (
              <span key={t} style={{ padding: '7px 16px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(201,168,76,0.4)', borderRadius: 999, fontSize: 13, fontWeight: 700 }}>{t}</span>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section style={{ maxWidth: 900, margin: '0 auto', padding: '56px 24px 8px' }}>
        <h2 style={{ fontSize: 30, textAlign: 'center', margin: '0 0 8px' }}>Choose your path</h2>
        <p style={{ color: '#52606d', textAlign: 'center', fontSize: 15, margin: '0 0 32px' }}>
          One-time enrollment. No monthly fee. Your certificates are yours for life (annual re-certification optional).
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 18 }}>
          {plans.map((p) => (
            <div key={p.id} style={{ background: '#fff', borderRadius: 16, border: p.highlighted ? '2px solid #c9a84c' : '1px solid #e2e8f0', boxShadow: p.highlighted ? '0 12px 48px rgba(201,168,76,0.2)' : '0 4px 18px rgba(16,42,67,0.05)', padding: '30px 28px', display: 'flex', flexDirection: 'column' }}>
              {p.highlighted && <div style={{ background: 'linear-gradient(90deg,#c9a84c,#e6ce8c)', color: '#1a1a2e', textAlign: 'center', padding: '5px', fontSize: 11.5, fontWeight: 800, letterSpacing: 1, borderRadius: 6, marginBottom: 12 }}>MOST POPULAR</div>}
              <div style={{ fontSize: 18, fontWeight: 800, color: '#1a1a2e' }}>{p.name}</div>
              <div style={{ fontSize: 13, color: '#888', marginTop: 2 }}>{p.tagline}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 14 }}>
                <span style={{ fontSize: 40, fontWeight: 800, color: '#c9a84c', fontFamily: 'Georgia, serif' }}>${p.price}</span>
                <span style={{ color: '#888', fontSize: 14 }}>one-time</span>
              </div>
              <ul style={{ flex: 1, padding: '18px 0 0', margin: 0, listStyle: 'none' }}>
                {p.features.map((f) => (
                  <li key={f} style={{ padding: '6px 0', fontSize: 13.5, color: '#555', display: 'flex', gap: 8 }}>
                    <span style={{ color: '#c9a84c' }}>✓</span> {f}
                  </li>
                ))}
              </ul>
              <Link href="/auth/signup" style={{ display: 'block', textAlign: 'center', marginTop: 18, padding: '13px 0', borderRadius: 8, textDecoration: 'none', fontWeight: 800, fontFamily: 'Georgia, serif', background: p.highlighted ? '#1a1a2e' : '#fff', color: p.highlighted ? '#c9a84c' : '#1a1a2e', border: p.highlighted ? 'none' : '2px solid #1a1a2e' }}>
                {p.cta} →
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* Curriculum */}
      <section style={{ maxWidth: 1080, margin: '0 auto', padding: '48px 24px' }}>
        <h2 style={{ fontSize: 30, textAlign: 'center', margin: '0 0 8px' }}>The full curriculum</h2>
        <p style={{ color: '#52606d', textAlign: 'center', fontSize: 15, margin: '0 0 32px' }}>
          Every module: lessons → quiz → certificate. Finish all 14 and earn the full program credential.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
          {modules.map(([icon, title, body]) => (
            <div key={title} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '18px 20px', display: 'flex', gap: 12 }}>
              <div style={{ fontSize: 24 }}>{icon}</div>
              <div>
                <div style={{ fontSize: 14.5, fontWeight: 800, color: '#1a1a2e' }}>{title}</div>
                <div style={{ fontSize: 12.5, color: '#666', marginTop: 3, lineHeight: 1.5 }}>{body}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ maxWidth: 1080, margin: '0 auto', padding: '8px 24px 80px' }}>
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: '36px 40px', textAlign: 'center', boxShadow: '0 10px 35px rgba(16,42,67,0.07)' }}>
          <h2 style={{ fontSize: 26, margin: '0 0 8px' }}>Start your CBI certification today</h2>
          <p style={{ color: '#52606d', fontSize: 15, maxWidth: 560, margin: '0 auto 22px' }}>
            Create your free account, enroll, and begin Module 1 — your first lesson takes less than 15 minutes.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/auth/signup" style={{ background: '#1a1a2e', color: '#c9a84c', padding: '13px 26px', borderRadius: 8, textDecoration: 'none', fontWeight: 800, fontSize: 15 }}>
              Create free account →
            </Link>
            <Link href="/marketplace/certified" style={{ border: '1px solid #1a1a2e', color: '#1a1a2e', padding: '13px 26px', borderRadius: 8, textDecoration: 'none', fontWeight: 700, fontSize: 15 }}>
              See certified intermediaries
            </Link>
          </div>
        </div>
      </section>
    </main>
  )
}

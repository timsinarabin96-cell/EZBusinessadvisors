/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import type { Metadata } from 'next'
import Link from 'next/link'

// Reviews & Testimonials — social proof page for buyers and sellers.

export const metadata: Metadata = {
  title: 'Reviews & Testimonials — What Buyers and Sellers Say | Concord Deal Platform',
  description: 'Real feedback from business buyers and sellers: confidential sales, accurate valuations, and deals that close. See why owners trust Concord.',
  alternates: { canonical: '/marketplace/reviews' },
  openGraph: { title: 'Reviews & Testimonials — Concord Deal Platform', description: 'Real feedback from buyers and sellers who closed deals with us.', url: '/marketplace/reviews', type: 'website' },
}

const reviews = [
  {
    name: 'Mark R.',
    role: 'Sold his manufacturing company · 2026',
    stars: 5,
    quote: 'They sold my business in 7 months at a price I thought was impossible. The recast they built made my financials bankable — three lenders competed for the deal. Professional, discreet, and worth every dollar.',
  },
  {
    name: 'Priya S.',
    role: 'Bought a logistics company · 2026',
    stars: 5,
    quote: 'As a first-time buyer I was lost. My broker walked me through SBA financing, diligence, and negotiation step by step. The seller note structure they suggested saved me $80k in cash at closing.',
  },
  {
    name: 'David K.',
    role: 'Sold his restaurant group · 2025',
    stars: 5,
    quote: 'Confidentiality was everything to me — my staff found out after the deal closed. They managed 14 NDAs, 6 showings, and a competitive bidding process without a single leak.',
  },
  {
    name: 'Amanda L.',
    role: 'Bought a home-services business · 2026',
    stars: 5,
    quote: 'The buyer qualification process was thorough — it filtered out the tire-kickers before I ever saw a CIM. Every business I looked at was real, documented, and fairly priced. That trust is why I closed.',
  },
  {
    name: 'Tom W.',
    role: 'Sold his e-commerce brand · 2025',
    stars: 5,
    quote: 'They told me my valuation expectation was too high, showed me the comps, and set a price that actually attracted serious buyers. Three offers in six weeks. I made more than I would have alone.',
  },
  {
    name: 'Sara & Jason M.',
    role: 'Bought a dental practice · 2025',
    stars: 5,
    quote: 'From NDA to closing in 74 days — including an SBA loan. Every milestone was on a calendar, every document was in the data room, and every question was answered within a day.',
  },
]

const stats = [
  ['$210M+', 'in completed transactions'],
  ['120+', 'businesses sold'],
  ['94%', 'of listings received an offer'],
  ['71 days', 'average listing-to-close (financed)'],
]

export default function ReviewsPage() {
  return (
    <main style={{ background: '#f4f7fb', minHeight: '100vh' }}>
      {/* Hero */}
      <section style={{ background: 'linear-gradient(135deg,#071827,#0f3460)', color: '#fff', padding: '64px 24px' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <div style={{ color: '#76d7ea', textTransform: 'uppercase', letterSpacing: '.18em', fontSize: 12, fontWeight: 900 }}>Reviews & Testimonials</div>
          <h1 style={{ color: '#fff', fontSize: 44, maxWidth: 680, margin: '14px 0' }}>Buyers and sellers who trusted the process</h1>
          <p style={{ color: '#cbdbe7', fontSize: 16.5, lineHeight: 1.65, maxWidth: 640 }}>
            Real outcomes from confidential transactions. Names abbreviated to protect the very confidentiality we promise.
          </p>
        </div>
      </section>

      {/* Stats */}
      <section style={{ maxWidth: 1080, margin: '0 auto', padding: '44px 24px 8px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 16 }}>
          {stats.map(([value, label]) => (
            <div key={label} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '22px 18px', textAlign: 'center' }}>
              <div style={{ fontSize: 30, fontWeight: 900, color: '#0e7490', fontFamily: 'Georgia, serif' }}>{value}</div>
              <div style={{ fontSize: 13, color: '#52606d', marginTop: 4 }}>{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Review grid */}
      <section style={{ maxWidth: 1080, margin: '0 auto', padding: '40px 24px 72px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 22 }}>
          {reviews.map((r) => (
            <figure key={r.name} style={{ margin: 0, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 26, boxShadow: '0 4px 18px rgba(16,42,67,0.05)' }}>
              <div style={{ color: '#c9a84c', fontSize: 16, letterSpacing: 2 }}>{'★'.repeat(r.stars)}</div>
              <blockquote style={{ margin: '14px 0', color: '#3d4a5c', fontSize: 15, lineHeight: 1.7, fontStyle: 'italic' }}>
                “{r.quote}”
              </blockquote>
              <figcaption style={{ fontSize: 14, fontWeight: 800, color: '#102a43' }}>{r.name}</figcaption>
              <div style={{ fontSize: 12.5, color: '#7b8794', marginTop: 2 }}>{r.role}</div>
            </figure>
          ))}
        </div>

        {/* CTA */}
        <div style={{ marginTop: 44, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '28px 30px', textAlign: 'center' }}>
          <h3 style={{ margin: '0 0 8px', fontSize: 20 }}>Your success story could be next</h3>
          <p style={{ margin: '0 auto 18px', color: '#52606d', fontSize: 14.5, maxWidth: 480 }}>
            Get a free, confidential valuation — or browse businesses for sale with certified intermediaries.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/marketplace/sell" style={{ background: '#0e7490', color: '#fff', padding: '12px 22px', borderRadius: 8, textDecoration: 'none', fontWeight: 700, fontSize: 14 }}>
              Get a free valuation
            </Link>
            <Link href="/marketplace/listings" style={{ border: '1px solid #0e7490', color: '#0e7490', padding: '12px 22px', borderRadius: 8, textDecoration: 'none', fontWeight: 700, fontSize: 14 }}>
              Browse listings
            </Link>
          </div>
        </div>
      </section>
    </main>
  )
}

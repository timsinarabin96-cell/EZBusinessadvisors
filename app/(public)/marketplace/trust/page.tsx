/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import type { Metadata } from 'next'
import Link from 'next/link'

// Marketplace Trust Center — public trust, security, and compliance page.
// Explains platform controls + gives buyers/sellers the confidence signals.

export const metadata: Metadata = {
  title: 'Trust Center — How We Protect Buyers & Sellers | Concord Deal Platform',
  description: 'See the controls behind every transaction: NDA-first confidentiality, verified recast financials, SBA-ready deal structuring, escrow and compliance, and permission-aware AI.',
  alternates: { canonical: '/marketplace/trust' },
  openGraph: {
    title: 'Trust Center — Concord Deal Platform',
    description: 'Confidential transactions need visible controls. See how every listing is vetted, verified, and protected.',
    url: '/marketplace/trust',
    type: 'website',
  },
}

const controls = [
  { title: 'Confidentiality by design', body: 'Private business identity, addresses, internal notes, call transcripts, and unapproved financial details are never part of the public listing feed.' },
  { title: 'Seller-controlled disclosure', body: 'A listing requires documented seller approval and broker review before public publication or partner-network distribution.' },
  { title: 'Permission-aware AI', body: 'AI access follows the same file and buyer permissions as the user. Blocked content is not used to answer questions.' },
  { title: 'Evidence-backed answers', body: 'Financial and operating claims can be linked to approved source documents with verification level, confidence, reviewer, and expiration.' },
  { title: 'Broker accountability', body: 'Agency administrators control advisor roles, listing approvals, commission rules, training, certification, and external publishing.' },
  { title: 'Auditability', body: 'Sensitive AI actions, disclosures, document access, approvals, exports, and publication events are designed to produce reviewable records.' },
]

const promises = [
  ['🔐', 'NDA-first process', 'Business identity and financials stay confidential until a buyer signs an NDA and qualifies.'],
  ['💵', 'Verified financials', 'Recasts are normalized and documented — lenders and buyers can trace every add-back.'],
  ['🏦', 'SBA-ready deals', 'Listings are structured to clear SBA 7(a) underwriting, with clean earnings and realistic multiples.'],
  ['🛡️', 'Escrow & compliance', 'Funds and documents move through controlled, auditable channels with clear closing conditions.'],
]

export default function TrustCenterPage() {
  return (
    <main style={{ background: '#f4f7fb', minHeight: '100vh' }}>
      {/* Hero */}
      <section style={{ background: '#071827', color: '#fff', padding: '76px 24px' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <div style={{ color: '#76d7ea', textTransform: 'uppercase', letterSpacing: '.18em', fontSize: 12, fontWeight: 900 }}>
            Marketplace Trust Center
          </div>
          <h1 style={{ color: '#fff', fontSize: 50, maxWidth: 780, margin: '14px 0' }}>
            Confidential transactions need visible controls.
          </h1>
          <p style={{ color: '#cbdbe7', fontSize: 17, lineHeight: 1.65, maxWidth: 760 }}>
            Every listing on this marketplace moves through the same disciplined process — valuation, recast, NDA,
            qualification, diligence, and closing. This page explains the controls that protect buyers and sellers at each step.
          </p>
        </div>
      </section>

      {/* Trust promises */}
      <section style={{ maxWidth: 1000, margin: '0 auto', padding: '48px 24px 8px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 16 }}>
          {promises.map(([icon, title, body]) => (
            <div key={title} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 22 }}>
              <div style={{ fontSize: 28 }}>{icon}</div>
              <h3 style={{ fontSize: 16, margin: '10px 0 6px' }}>{title}</h3>
              <p style={{ color: '#52606d', fontSize: 13.5, lineHeight: 1.6, margin: 0 }}>{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Platform controls */}
      <section style={{ maxWidth: 1000, margin: '0 auto', padding: '40px 24px 80px' }}>
        <h2 style={{ fontSize: 26, margin: '0 0 6px' }}>Platform controls</h2>
        <p style={{ color: '#52606d', margin: '0 0 22px' }}>
          Each brokerage publishes its own approved legal, licensing, security, accessibility, AI-use, complaint, copyright,
          and incident-response information. The platform enforces these baseline controls everywhere.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 18 }}>
          {controls.map((c, index) => (
            <article key={c.title} className="card" style={{ padding: 24, background: '#fff' }}>
              <div style={{ color: '#0e7490', fontWeight: 900, fontSize: 12 }}>CONTROL {String(index + 1).padStart(2, '0')}</div>
              <h2 style={{ fontSize: 20, margin: '10px 0' }}>{c.title}</h2>
              <p style={{ color: '#52606d', lineHeight: 1.6, margin: 0, fontSize: 13.5 }}>{c.body}</p>
            </article>
          ))}
        </div>

        {/* CTA */}
        <div style={{ marginTop: 40, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '28px 30px', display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ margin: '0 0 6px', fontSize: 19 }}>See it in action</h3>
            <p style={{ margin: 0, color: '#52606d', fontSize: 14 }}>
              Browse verified listings or talk to a broker about selling your business.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Link href="/marketplace" style={{ background: '#0e7490', color: '#fff', padding: '10px 18px', borderRadius: 8, textDecoration: 'none', fontWeight: 600, fontSize: 14 }}>
              Browse listings
            </Link>
            <Link href="/marketplace/sell" style={{ border: '1px solid #0e7490', color: '#0e7490', padding: '10px 18px', borderRadius: 8, textDecoration: 'none', fontWeight: 600, fontSize: 14 }}>
              Get a free valuation
            </Link>
          </div>
        </div>
      </section>
    </main>
  )
}

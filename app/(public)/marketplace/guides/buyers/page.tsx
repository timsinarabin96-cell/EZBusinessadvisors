/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import Link from 'next/link'
import type { Metadata } from 'next'
import AffiliateResources from '@/components/public/AffiliateResources'

// Buyer Guides — step-by-step acquisition path for buyers. Server component.

export const metadata: Metadata = {
  title: 'How to Buy a Business: Step-by-Step Buyer Guide | Concord Deal Platform',
  description: 'From acquisition criteria to closing: the complete business-buying process — SBA financing, due diligence, deal structure, and transition. Free guide for buyers.',
  alternates: { canonical: '/marketplace/guides/buyers' },
  openGraph: { title: 'How to Buy a Business — Buyer Guide | Concord Deal Platform', description: 'The complete step-by-step process for buying a business: pre-qualification, due diligence, structuring the deal, and closing.', url: '/marketplace/guides/buyers', type: 'website' },
}

const steps = [
  ['01', 'Define your acquisition criteria', 'Industry, size, revenue, location, budget, and financing approach. Clear criteria mean you can act fast when the right business appears — great deals get multiple offers.'],
  ['02', 'Get pre-qualified', 'Talk to an SBA lender early. Pre-approval proves you are a serious buyer, speeds up the process, and sellers (and their brokers) prioritize pre-approved buyers.'],
  ['03', 'Browse confidential listings', 'Use the marketplace to shortlist businesses. Save favorites, compare listings side by side, and sign NDAs to unlock full financial details.'],
  ['04', 'Run your due diligence', 'Review the recast financials, customer concentration, contracts, employees, and operations. Visit the business. Talk to the owner\'s team. Verify every claim.'],
  ['05', 'Structure the deal', 'Price, seller note, earnout, asset vs. stock, transition period. A good structure bridges the gap between what the seller wants and what the bank will finance.'],
  ['06', 'Close & transition', 'Clear the lender\'s conditions, sign the purchase agreement, wire the funds, and take over with a written transition plan. Then execute the growth plan you bought.'],
]

const faqs = [
  ['How much money do I need to buy a business?', 'With SBA 7(a) financing, buyers typically put down 10% of the purchase price (plus working capital). A $500k business might need ~$50k–$80k out of pocket.'],
  ['Can I use an SBA loan?', 'Yes — most Main Street acquisitions use SBA 7(a) loans. You\'ll need a credit score around 680+, a reasonable debt-to-income ratio, and relevant experience or a solid rationale.'],
  ['What is a recast and why does it matter?', 'A recast shows the business\'s true earnings by adding back owner perks and one-time expenses. Buyers and lenders underwrite off this number — learn to read it before you make an offer.'],
  ['How long does the process take?', 'From LOI to closing, plan on 60–90 days for an SBA-financed deal. Cash deals can close in 30–45 days. The timeline is driven by diligence and lender underwriting.'],
  ['Should I buy a business or start one?', 'Buying a business costs more upfront but buys cash flow, customers, systems, and a track record. Starting costs less but takes years and carries a much higher failure rate.'],
]

export default function BuyerGuidesPage() {
  return (
    <main style={{ background: '#f4f7fb', minHeight: '100vh' }}>
      {/* Hero */}
      <section style={{ background: 'linear-gradient(135deg,#071827,#0f3460)', color: '#fff', padding: '72px 24px' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <div style={{ color: '#76d7ea', textTransform: 'uppercase', letterSpacing: '.18em', fontSize: 12, fontWeight: 900 }}>Buyer Guides</div>
          <h1 style={{ color: '#fff', fontSize: 46, maxWidth: 720, margin: '14px 0' }}>How to buy a business the right way</h1>
          <p style={{ color: '#cbdbe7', fontSize: 17, lineHeight: 1.65, maxWidth: 700 }}>
            From first search to final handshake — the acquisition playbook used by certified intermediaries and their buyers.
          </p>
          <div style={{ marginTop: 22, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Link href="/marketplace/listings" style={{ background: '#0e7490', color: '#fff', padding: '12px 22px', borderRadius: 8, textDecoration: 'none', fontWeight: 700, fontSize: 14 }}>
              Browse businesses for sale
            </Link>
            <Link href="/marketplace/qualify" style={{ border: '1px solid rgba(255,255,255,0.5)', color: '#fff', padding: '12px 22px', borderRadius: 8, textDecoration: 'none', fontWeight: 700, fontSize: 14 }}>
              Pre-qualify as a buyer
            </Link>
          </div>
        </div>
      </section>

      {/* Steps */}
      <section style={{ maxWidth: 1000, margin: '0 auto', padding: '56px 24px' }}>
        <h2 style={{ fontSize: 28, margin: '0 0 8px' }}>The 6-step buying process</h2>
        <p style={{ color: '#52606d', margin: '0 0 28px', fontSize: 15 }}>
          Disciplined buyers win. Here is exactly how to move from "I want to buy a business" to handing over the keys.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {steps.map(([num, title, body]) => (
            <div key={num} style={{ display: 'flex', gap: 20, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 24 }}>
              <div style={{ fontSize: 26, fontWeight: 900, color: '#0e7490', fontFamily: 'Georgia, serif', minWidth: 48 }}>{num}</div>
              <div>
                <h3 style={{ fontSize: 19, margin: '0 0 6px' }}>{title}</h3>
                <p style={{ color: '#52606d', fontSize: 14.5, lineHeight: 1.65, margin: 0 }}>{body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* FAQs */}
      <section style={{ maxWidth: 1000, margin: '0 auto', padding: '16px 24px 72px' }}>
        <h2 style={{ fontSize: 28, margin: '0 0 24px' }}>Buyer FAQ</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {faqs.map(([q, a]) => (
            <details key={q} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '16px 20px' }}>
              <summary style={{ fontWeight: 700, fontSize: 15.5, cursor: 'pointer', color: '#102a43' }}>{q}</summary>
              <p style={{ color: '#52606d', fontSize: 14.5, lineHeight: 1.65, margin: '12px 0 0' }}>{a}</p>
            </details>
          ))}
        </div>

        {/* CTA */}
        <div style={{ marginTop: 40, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '28px 30px', display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ margin: '0 0 6px', fontSize: 19 }}>Find businesses that match your criteria</h3>
            <p style={{ margin: 0, color: '#52606d', fontSize: 14 }}>Browse verified, confidential listings — or save a search and get matched automatically.</p>
          </div>
          <Link href="/marketplace/listings" style={{ background: '#0e7490', color: '#fff', padding: '12px 22px', borderRadius: 8, textDecoration: 'none', fontWeight: 700, fontSize: 14 }}>
            Browse listings →
          </Link>
        </div>
      </section>
      <AffiliateResources surface="guides" />
    </main>
  )
}

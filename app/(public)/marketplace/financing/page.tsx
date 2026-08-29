/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import type { Metadata } from 'next'
import Link from 'next/link'
import { fetchFinancingHubStats } from '@/lib/financing'
import { fetchPublicProfessionals, PROFESSIONAL_LABELS, type DealProfessional } from '@/lib/professionals'
import SbaCalculator from '@/components/public/SbaCalculator'
import AffiliateResources from '@/components/public/AffiliateResources'
import { safeJsonLd } from '@/lib/safeJsonLd'

export const dynamic = 'force-dynamic'

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://ezbusinessadvisors.vercel.app'

export const metadata: Metadata = {
  title: 'Business Acquisition Financing — SBA Lenders & Loan-Ready Deals',
  description: 'How to finance a business purchase: SBA 7(a) down payments, debt-service coverage, loan-ready package checklist, and vetted SBA lenders.',
  alternates: { canonical: `${BASE}/marketplace/financing` },
}

export default async function FinancingPage() {
  const [{ lenderCount, verifiedLenders }, lenders] = await Promise.all([
    fetchFinancingHubStats(),
    fetchPublicProfessionals({ type: 'lender' }).catch(() => [] as DealProfessional[]),
  ])

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FinancialService',
    name: 'Concord Financing Marketplace',
    description: 'SBA acquisition financing guidance and vetted lenders for business buyers.',
    url: `${BASE}/marketplace/financing`,
  }

  return (
    <div style={{ maxWidth: 1080, margin: '0 auto', padding: '56px 24px 80px' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <div style={{ color: '#c9a84c', fontSize: 12, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 700 }}>Financing Marketplace</div>
        <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 36, color: '#1a1a2e', margin: '10px 0 12px' }}>
          How Buyers Finance a Business
        </h1>
        <p style={{ color: '#666', fontSize: 15, maxWidth: 640, margin: '0 auto', lineHeight: 1.6 }}>
          Most main-street deals close with SBA 7(a) financing. Here&apos;s what lenders actually require — and the vetted lenders our brokers work with.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 40 }}>
        <Metric label="SBA lenders in network" value={String(lenderCount)} />
        <Metric label="Verified lenders" value={String(verifiedLenders)} />
        <Metric label="Typical down payment" value="10%" />
        <Metric label="Typical term" value="10 years" />
      </div>

      {/* Payment calculator + eligibility quiz */}
      <SbaCalculator />

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)', gap: 24, alignItems: 'start', marginBottom: 40 }}>
        <div style={{ background: '#fff', border: '1px solid #ece8dc', borderRadius: 16, padding: 28, boxShadow: '0 10px 35px rgba(16,42,67,0.07)' }}>
          <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 22, color: '#1a1a2e', margin: '0 0 16px' }}>The SBA 7(a) Playbook</h2>
          {[
            ['1. Down payment', 'Lenders finance ~90% of the purchase. Buyers bring ~10% down plus closing costs — roughly 15% of price in cash.'],
            ['2. Debt service coverage', 'Lenders want the business earnings (SDE) to cover the loan payment at least 1.25×. If it doesn’t, the price is too high for the earnings.'],
            ['3. Credit & collateral', 'Personal credit 680+ and business collateral (equipment, real estate, receivables) strengthen approval odds.'],
            ['4. The loan package', 'PFS, 2-year projections, 3 years of tax returns, collateral schedule, and a business plan — assembled before you shop the loan.'],
            ['5. Seller financing', 'Sellers who carry a note (10–20%) make deals bankable and close faster.'],
          ].map(([title, body]) => (
            <div key={title} style={{ padding: '14px 0', borderBottom: '1px solid #f0ecdf' }}>
              <div style={{ fontWeight: 800, color: '#1a1a2e', fontSize: 15 }}>{title}</div>
              <div style={{ fontSize: 13.5, color: '#666', lineHeight: 1.6, marginTop: 4 }}>{body}</div>
            </div>
          ))}
          <Link href="/marketplace/qualify" style={{ display: 'inline-block', marginTop: 20, background: 'linear-gradient(135deg, #c9a84c, #a8873a)', color: '#1a1a2e', fontFamily: 'Georgia, serif', fontWeight: 800, fontSize: 14, padding: '12px 24px', borderRadius: 8, textDecoration: 'none', boxShadow: '0 2px 6px rgba(201,168,76,0.3)' }}>
            Am I qualified? Check instantly →
          </Link>
        </div>

        <div style={{ background: '#fff', border: '1px solid #ece8dc', borderRadius: 16, padding: 28, boxShadow: '0 10px 35px rgba(16,42,67,0.07)' }}>
          <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 22, color: '#1a1a2e', margin: '0 0 6px' }}>Vetted Lenders</h2>
          <p style={{ color: '#888', fontSize: 13.5, margin: '0 0 16px' }}>
            SBA lenders referred by our brokers. Credentials as provided — verify directly.
          </p>
          {lenders.length === 0 ? (
            <div style={{ color: 'var(--muted)', fontSize: 13.5, textAlign: 'center', padding: 24 }}>
              Lenders are being onboarded. Ask any broker for an introduction.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {lenders.slice(0, 6).map((l) => (
                <Link key={l.id} href={`/marketplace/professionals/${l.id}`} style={{ textDecoration: 'none', display: 'block', border: '1px solid #ece8dc', borderRadius: 12, padding: 14, background: '#fcfbf7' }}>
                  <div style={{ fontWeight: 800, color: '#1a1a2e', fontSize: 14.5 }}>
                    {l.name} {l.is_platform_verified && '✅'}
                  </div>
                  <div style={{ fontSize: 12.5, color: '#0e7490', fontWeight: 700, marginTop: 2 }}>
                    {PROFESSIONAL_LABELS[l.professional_type]}{l.firm ? ` · ${l.firm}` : ''}
                  </div>
                  {l.specialty && <div style={{ fontSize: 12, color: '#7b8794', marginTop: 3 }}>{l.specialty}</div>}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ background: '#f5f3ec', border: '1px solid #e5dfcc', borderRadius: 14, padding: 28, textAlign: 'center' }}>
        <div style={{ fontFamily: 'Georgia, serif', fontSize: 22, color: '#1a1a2e', fontWeight: 700 }}>Found a deal? Get it loan-ready.</div>
        <p style={{ color: '#666', fontSize: 14.5, maxWidth: 540, margin: '10px auto 18px', lineHeight: 1.6 }}>
          Our brokers run every listing through a loan-readiness check — down payment, DSCR, package checklist — before it hits the market.
        </p>
        <Link href="/marketplace/listings" style={{ background: 'linear-gradient(135deg, #c9a84c, #a8873a)', color: '#1a1a2e', fontFamily: 'Georgia, serif', fontWeight: 700, fontSize: 15, padding: '13px 28px', borderRadius: 8, textDecoration: 'none', display: 'inline-block', boxShadow: '0 2px 6px rgba(201,168,76,0.3)' }}>
          Browse Businesses →
        </Link>
      <AffiliateResources surface="financing" />
      </div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div style={{ background: '#fff', border: '1px solid #ece8dc', borderRadius: 14, padding: 20, textAlign: 'center', boxShadow: '0 1px 6px rgba(26,26,46,0.05)' }}>
    <div style={{ fontSize: 13, color: '#888', fontWeight: 600 }}>{label}</div>
    <div style={{ fontSize: 26, fontWeight: 800, color: '#1a1a2e', marginTop: 6, fontFamily: 'Georgia, serif' }}>{value}</div>
  </div>
}

/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import type { Metadata } from 'next'
import Link from 'next/link'
import { buildSoldCompsReport } from '@/lib/soldComps'
import { getPublicAgencyContext } from '@/lib/publicAgency'
import { MARKET_MULTIPLES } from '@/lib/marketMultiplesCore.ts'

export const dynamic = 'force-dynamic'

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://concord.ezbusinessadvisors.com'

const fmt$ = (n: number | null | undefined) => (n != null ? '$' + n.toLocaleString('en-US') : '—')

export const metadata: Metadata = {
  title: 'Business Sale Comps by Industry — Market Multiples & Prices',
  description: 'See what businesses actually sell for: average sale multiples and prices by industry and state. Anonymized market data for buyers and sellers.',
  alternates: { canonical: `${BASE}/marketplace/comps` },
}

export default async function SoldCompsPage() {
  const agency = await getPublicAgencyContext()
  const report = await buildSoldCompsReport(agency?.scope || null)
  const { industries, states, totals } = report

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: 'Business Sale Comparables',
    description: 'Anonymized business sale multiples and prices by industry and state.',
    url: `${BASE}/marketplace/comps`,
    variableMeasured: totals.deals,
  }

  return (
    <div style={{ maxWidth: 1080, margin: '0 auto', padding: '56px 24px 80px' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <div style={{ color: '#c9a84c', fontSize: 12, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 700 }}>Market Data</div>
        <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 36, color: '#1a1a2e', margin: '10px 0 12px' }}>
          What Businesses Actually Sell For
        </h1>
        <p style={{ color: '#666', fontSize: 15, maxWidth: 640, margin: '0 auto', lineHeight: 1.6 }}>
          Anonymized sale multiples and prices from businesses we&apos;ve closed — by industry and state.
          Names and owners stay confidential, always. Use this to price your business or benchmark a deal.
        </p>
        <a
          href="/api/public/comps-report"
          style={{ display: 'inline-block', marginTop: 20, background: 'linear-gradient(135deg, #c9a84c, #a8873a)', color: '#1a1a2e', fontFamily: 'Georgia, serif', fontWeight: 700, fontSize: 14, padding: '12px 26px', borderRadius: 8, textDecoration: 'none', boxShadow: '0 2px 6px rgba(201,168,76,0.3)' }}
        >
          ⬇ Download market report (PDF)
        </a>
      </div>

      {totals.deals === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 24px', background: '#fff', border: '1px solid #ece8dc', borderRadius: 12, color: '#888' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#1a1a2e' }}>Market data is building</div>
          <div style={{ fontSize: 14, marginTop: 8 }}>
            Comp data appears as deals close. Ask a broker for recent comparables in your industry.
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 36 }}>
            <Metric label="Closed deals tracked" value={totals.deals.toLocaleString()} />
            <Metric label="Average multiple" value={totals.avgMultiple != null ? `${totals.avgMultiple.toFixed(2)}× SDE` : '—'} />
            <Metric label="Average sale price" value={fmt$(totals.avgSalePrice)} />
            <Metric label="Industries covered" value={String(totals.industries)} />
          </div>

          <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 24, color: '#1a1a2e', margin: '0 0 6px' }}>Multiples by Industry</h2>
          <p style={{ color: '#888', fontSize: 13.5, margin: '0 0 18px' }}>
            Sorted by transaction count. Multiple = sale price ÷ owner earnings (SDE).
          </p>
          <div style={{ background: '#fff', border: '1px solid #ece8dc', borderRadius: 14, overflow: 'hidden', marginBottom: 40 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ background: '#1a1a2e', color: '#fff', textAlign: 'left' }}>
                  <Th>Industry</Th>
                  <Th>Deals</Th>
                  <Th>Avg Multiple</Th>
                  <Th>Avg Price</Th>
                  <Th>Median Price</Th>
                  <Th>Avg Days to Sell</Th>
                </tr>
              </thead>
              <tbody>
                {industries.map((i, idx) => (
                  <tr key={i.industry} style={{ background: idx % 2 ? '#faf9f5' : '#fff', borderBottom: '1px solid #f0ecdf' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 700, color: '#1a1a2e' }}>{i.industry}</td>
                    <Td>{i.count}</Td>
                    <Td>{i.avgMultiple != null ? `${i.avgMultiple.toFixed(2)}×` : '—'}</Td>
                    <Td>{fmt$(i.avgSalePrice)}</Td>
                    <Td>{fmt$(i.medianSalePrice)}</Td>
                    <Td>{i.avgDaysToSell != null ? `${i.avgDaysToSell} days` : '—'}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

      {/* Typical market multiples reference — what these industries usually sell for */}
      <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 24, color: '#1a1a2e', margin: '40px 0 6px' }}>Typical Sale Multiples by Industry</h2>
      <p style={{ color: '#888', fontSize: 13.5, margin: '0 0 18px' }}>
        Reference bands for common small-business industries — what buyers typically pay relative to earnings. SDE = seller&apos;s discretionary earnings; EBITDA = earnings before interest, taxes, depreciation &amp; amortization.
      </p>
      <div style={{ background: '#fff', border: '1px solid #ece8dc', borderRadius: 14, overflow: 'hidden', marginBottom: 40 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ background: '#1a1a2e', color: '#fff', textAlign: 'left' }}>
              <Th>Industry</Th>
              <Th>SDE multiple</Th>
              <Th>EBITDA multiple</Th>
            </tr>
          </thead>
          <tbody>
            {[...new Set(MARKET_MULTIPLES.map((b) => b.industry))]
              .sort()
              .map((ind, idx) => {
                const sde = MARKET_MULTIPLES.find((b) => b.industry === ind && b.basis === 'SDE')
                const ebitda = MARKET_MULTIPLES.find((b) => b.industry === ind && b.basis === 'EBITDA')
                const slug = ind.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '')
                return (
                  <tr key={ind} style={{ background: idx % 2 ? '#faf9f5' : '#fff', borderBottom: '1px solid #f0ecdf' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 700, color: '#1a1a2e' }}>
                      <Link href={`/marketplace/industry/${slug}`} style={{ color: '#1a1a2e', textDecoration: 'none' }}>{ind}</Link>
                    </td>
                    <Td>{sde ? `${sde.min.toFixed(1)}–${sde.max.toFixed(1)}×` : '—'}</Td>
                    <Td>{ebitda ? `${ebitda.min.toFixed(1)}–${ebitda.max.toFixed(1)}×` : '—'}</Td>
                  </tr>
                )
              })}
          </tbody>
        </table>
      </div>

          {states.length > 0 && (
            <>
              <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 24, color: '#1a1a2e', margin: '0 0 6px' }}>Where Deals Are Closing</h2>
              <p style={{ color: '#888', fontSize: 13.5, margin: '0 0 18px' }}>
                Recent closings by state — a read on market activity near you.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {states.map((s) => (
                  <div key={s.state} style={{ background: '#fff', border: '1px solid #ece8dc', borderRadius: 12, padding: '14px 18px', minWidth: 130 }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#1a1a2e' }}>{s.state}</div>
                    <div style={{ fontSize: 12.5, color: '#888', marginTop: 3 }}>{s.count} deal{s.count === 1 ? '' : 's'}{s.avgMultiple != null ? ` · ${s.avgMultiple.toFixed(2)}× avg` : ''}</div>
                  </div>
                ))}
              </div>
            </>
          )}

          <div style={{ marginTop: 44, background: '#f5f3ec', border: '1px solid #e5dfcc', borderRadius: 14, padding: 28, textAlign: 'center' }}>
            <div style={{ fontFamily: 'Georgia, serif', fontSize: 22, color: '#1a1a2e', fontWeight: 700 }}>What is your business worth?</div>
            <p style={{ color: '#666', fontSize: 14.5, maxWidth: 520, margin: '10px auto 18px', lineHeight: 1.6 }}>
              Get a confidential valuation estimate in minutes — no obligation, no spam.
            </p>
            <Link href="/marketplace/sell" style={{ background: 'linear-gradient(135deg, #c9a84c, #a8873a)', color: '#1a1a2e', fontFamily: 'Georgia, serif', fontWeight: 700, fontSize: 15, padding: '13px 28px', borderRadius: 8, textDecoration: 'none', display: 'inline-block', boxShadow: '0 2px 6px rgba(201,168,76,0.3)' }}>
              Get My Valuation →
            </Link>
          </div>
        </>
      )}
    </div>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return <th style={{ padding: '12px 16px', fontSize: 12, textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700 }}>{children}</th>
}

function Td({ children }: { children: React.ReactNode }) {
  return <td style={{ padding: '12px 16px', color: '#555' }}>{children}</td>
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div style={{ background: '#fff', border: '1px solid #ece8dc', borderRadius: 14, padding: 20, textAlign: 'center', boxShadow: '0 1px 6px rgba(26,26,46,0.05)' }}>
    <div style={{ fontSize: 13, color: '#888', fontWeight: 600 }}>{label}</div>
    <div style={{ fontSize: 26, fontWeight: 800, color: '#1a1a2e', marginTop: 6, fontFamily: 'Georgia, serif' }}>{value}</div>
  </div>
}

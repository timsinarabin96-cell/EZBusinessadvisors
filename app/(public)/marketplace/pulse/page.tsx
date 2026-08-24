import type { Metadata } from 'next'
import Link from 'next/link'
import { buildSoldCompsReport } from '@/lib/soldComps'

export const dynamic = 'force-dynamic'

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://concord.ezbusinessadvisors.com'

const fmt$ = (n: number | null | undefined) => (n != null ? '$' + Math.round(n).toLocaleString('en-US') : '—')
const fmtMult = (n: number | null | undefined) => (n != null ? n.toFixed(2) + 'x' : '—')

export const metadata: Metadata = {
  title: 'Market Pulse — Business Sale Multiples, Prices & Days on Market',
  description: 'Live anonymized market data: median sale multiples and prices by industry, average days to sell, and state-level activity. Built from actual closed transactions.',
  alternates: { canonical: `${BASE}/marketplace/pulse` },
}

export default async function MarketPulsePage() {
  const report = await buildSoldCompsReport()
  const { industries, states, totals } = report
  const top = industries.slice(0, 12)

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: 'Main Street Market Pulse',
    description: 'Anonymized business sale multiples, prices, and time-to-sell by industry and state.',
    url: `${BASE}/marketplace/pulse`,
    variableMeasured: totals.deals,
  }

  return (
    <main style={{ background: '#f4f7fb', minHeight: '100vh' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* Hero */}
      <section style={{ background: 'linear-gradient(135deg,#071827,#0f3460)', color: '#fff', padding: '64px 24px' }}>
        <div style={{ maxWidth: 1080, margin: '0 auto' }}>
          <div style={{ color: '#76d7ea', textTransform: 'uppercase', letterSpacing: '.18em', fontSize: 12, fontWeight: 900 }}>Market Pulse</div>
          <h1 style={{ color: '#fff', fontSize: 44, maxWidth: 720, margin: '14px 0' }}>What Main Street businesses actually sell for</h1>
          <p style={{ color: '#cbdbe7', fontSize: 16.5, lineHeight: 1.65, maxWidth: 680 }}>
            Live, anonymized market intelligence from real closed transactions — multiples, prices, and time-to-sell by industry
            and state. No guesswork, no gatekeeping.
          </p>
        </div>
      </section>

      {/* Market stats band */}
      <section style={{ maxWidth: 1080, margin: '0 auto', padding: '40px 24px 8px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 16 }}>
          <StatCard label="Closed transactions tracked" value={totals.deals.toLocaleString()} />
          <StatCard label="Average sale multiple" value={fmtMult(totals.avgMultiple)} />
          <StatCard label="Average sale price" value={fmt$(totals.avgSalePrice)} />
          <StatCard label="Industries with data" value={String(totals.industries)} />
        </div>
        <p style={{ color: '#7b8794', fontSize: 12, marginTop: 10 }}>
          Updated {new Date(report.updatedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })} ·
          All figures anonymized — never the names of businesses or owners.
        </p>
      </section>

      {/* Industry table */}
      <section style={{ maxWidth: 1080, margin: '0 auto', padding: '32px 24px' }}>
        <h2 style={{ fontSize: 26, margin: '0 0 6px' }}>Sale multiples by industry</h2>
        <p style={{ color: '#52606d', fontSize: 14.5, margin: '0 0 20px' }}>
          Median and average multiples (price ÷ earnings) from recent closed sales. Higher multiples = stronger earnings quality, growth, and transferability.
        </p>
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: '#0f2038', color: '#fff', textAlign: 'left' }}>
                <th style={{ padding: '14px 18px' }}>Industry</th>
                <th style={{ padding: '14px 18px' }}>Deals</th>
                <th style={{ padding: '14px 18px' }}>Avg multiple</th>
                <th style={{ padding: '14px 18px' }}>Median price</th>
                <th style={{ padding: '14px 18px' }}>Avg days to sell</th>
              </tr>
            </thead>
            <tbody>
              {top.map((s, i) => (
                <tr key={s.industry} style={{ borderTop: '1px solid #eef2f6', background: i % 2 ? '#fafbfd' : '#fff' }}>
                  <td style={{ padding: '13px 18px', fontWeight: 700, color: '#102a43' }}>{s.industry}</td>
                  <td style={{ padding: '13px 18px', color: '#52606d' }}>{s.count}</td>
                  <td style={{ padding: '13px 18px', fontWeight: 700, color: '#0e7490' }}>{fmtMult(s.avgMultiple)}</td>
                  <td style={{ padding: '13px 18px', color: '#3d4a5c' }}>{fmt$(s.medianSalePrice)}</td>
                  <td style={{ padding: '13px 18px', color: '#52606d' }}>{s.avgDaysToSell != null ? s.avgDaysToSell + ' days' : '—'}</td>
                </tr>
              ))}
              {top.length === 0 && (
                <tr><td colSpan={5} style={{ padding: 30, textAlign: 'center', color: '#888' }}>Market data populates as transactions close.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {industries.length > 12 && (
          <p style={{ color: '#7b8794', fontSize: 12.5, marginTop: 10 }}>
            +{industries.length - 12} more industries tracked. Full breakdown on the <Link href="/marketplace/comps" style={{ color: '#0e7490' }}>Sale Comps</Link> page.
          </p>
        )}
      </section>

      {/* State activity */}
      <section style={{ maxWidth: 1080, margin: '0 auto', padding: '8px 24px 40px' }}>
        <h2 style={{ fontSize: 26, margin: '0 0 6px' }}>Activity by state</h2>
        <p style={{ color: '#52606d', fontSize: 14.5, margin: '0 0 20px' }}>
          Where deals are closing — transaction counts and average multiples by state.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 12 }}>
          {states.slice(0, 18).map((st) => (
            <div key={st.state} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 800, color: '#102a43', fontSize: 15 }}>{st.state}</span>
              <span style={{ fontSize: 13, color: '#52606d' }}>{st.count} deals · {fmtMult(st.avgMultiple)}</span>
            </div>
          ))}
        </div>
      </section>

      {/* CTAs */}
      <section style={{ maxWidth: 1080, margin: '0 auto', padding: '8px 24px 80px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 18 }}>
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 28 }}>
          <div style={{ fontSize: 30 }}>📊</div>
          <h3 style={{ fontSize: 19, margin: '10px 0 6px' }}>Selling? See what your business is worth</h3>
          <p style={{ color: '#52606d', fontSize: 14, lineHeight: 1.6, margin: '0 0 16px' }}>
            Compare your earnings against real market multiples — free and confidential.
          </p>
          <Link href="/marketplace/sell" style={{ background: '#0e7490', color: '#fff', padding: '11px 18px', borderRadius: 8, textDecoration: 'none', fontWeight: 700, fontSize: 14 }}>
            Get a free valuation →
          </Link>
        </div>
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 28 }}>
          <div style={{ fontSize: 30 }}>🎯</div>
          <h3 style={{ fontSize: 19, margin: '10px 0 6px' }}>Buying? Know the market before you bid</h3>
          <p style={{ color: '#52606d', fontSize: 14, lineHeight: 1.6, margin: '0 0 16px' }}>
            Browse live listings priced against real closed deals — and get pre-qualified.
          </p>
          <Link href="/marketplace/listings" style={{ background: '#0e7490', color: '#fff', padding: '11px 18px', borderRadius: 8, textDecoration: 'none', fontWeight: 700, fontSize: 14 }}>
            Browse businesses for sale →
          </Link>
        </div>
        <div style={{ background: 'linear-gradient(135deg,#0f2038,#14294f)', border: 'none', borderRadius: 14, padding: 28 }}>
          <div style={{ fontSize: 30 }}>🏆</div>
          <h3 style={{ fontSize: 19, margin: '10px 0 6px', color: '#fff' }}>Work with certified intermediaries</h3>
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, lineHeight: 1.6, margin: '0 0 16px' }}>
            Every broker completes the 12-module CBI program. Proof, not promises.
          </p>
          <Link href="/marketplace/certified" style={{ border: '1px solid rgba(255,255,255,0.5)', color: '#fff', padding: '11px 18px', borderRadius: 8, textDecoration: 'none', fontWeight: 700, fontSize: 14 }}>
            Meet certified brokers →
          </Link>
        </div>
      </section>
    </main>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '20px 18px', textAlign: 'center' }}>
      <div style={{ fontSize: 27, fontWeight: 900, color: '#0e7490', fontFamily: 'Georgia, serif' }}>{value}</div>
      <div style={{ fontSize: 12.5, color: '#52606d', marginTop: 4 }}>{label}</div>
    </div>
  )
}

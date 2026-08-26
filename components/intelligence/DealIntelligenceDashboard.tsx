/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useEffect, useState } from 'react'
import { DEAL_INTELLIGENCE_MODULES, DealNetworkOverview, fetchDealNetworkOverview } from '@/lib/dealNetwork'

const EMPTY: DealNetworkOverview = { passports: [], activeOffers: 0, exchangeOpportunities: 0, activeTransitions: 0, pendingAiQueries: 0, verifiedFacts: 0 }

export default function DealIntelligenceDashboard() {
  const [overview, setOverview] = useState<DealNetworkOverview>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [market, setMarket] = useState<{ deals: number; avgMultiple: number | null; avgPrice: number | null; industries: number } | null>(null)

  useEffect(() => {
    fetchDealNetworkOverview().then(setOverview).finally(() => setLoading(false))
    // Live market trend cards from anonymized sold comps (public RPC).
    import('@/lib/soldComps').then(({ buildSoldCompsReport }) =>
      buildSoldCompsReport().then((r) =>
        setMarket({
          deals: r.totals.deals,
          avgMultiple: r.totals.avgMultiple,
          avgPrice: r.totals.avgSalePrice,
          industries: r.totals.industries,
        }),
      ),
    ).catch(() => {})
  }, [])

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: 24, alignItems: 'flex-start', marginBottom: 24 }}>
        <div><div className="section-title">Concord Intelligence Network</div><h1 style={{ fontSize: 32, margin: '8px 0' }}>Trust, evidence, engagement, and transaction control</h1><p style={{ color: 'var(--muted)', maxWidth: 790, lineHeight: 1.6, margin: 0 }}>A broker-only operating view for verified deal facts, permission-scoped AI, serious-buyer signals, cooperative opportunities, offer quality, value growth, and post-close execution.</p></div>
        <div style={{ padding: '12px 16px', borderRadius: 12, background: '#ecfeff', color: '#155e75', fontWeight: 800, fontSize: 12 }}>{loading ? 'Loading intelligence…' : 'Evidence controls active'}</div>
      </header>

      <section className="intelligence-metrics-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(5,minmax(0,1fr))', gap: 12, marginBottom: 24 }}>
        <Metric label="Verified facts" value={overview.verifiedFacts} color="#0e7490" /><Metric label="Pending AI questions" value={overview.pendingAiQueries} color="#7c3aed" /><Metric label="Submitted offers" value={overview.activeOffers} color="#b45309" /><Metric label="Exchange opportunities" value={overview.exchangeOpportunities} color="#1d4ed8" /><Metric label="Active transitions" value={overview.activeTransitions} color="#4338ca" />
      </section>

      <section className="card" style={{ padding: 24, marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 18 }}><div><h2 style={{ fontSize: 22, margin: 0 }}>Verified Deal Passports</h2><p style={{ color: 'var(--muted)', fontSize: 13, margin: '5px 0 0' }}>Facts graduate from seller-stated to broker-reviewed, document-verified, CPA-supported, or lender-reviewed.</p></div><span style={{ fontSize: 12, color: '#52606d' }}>{overview.passports.length} passports</span></div>
        {overview.passports.length === 0 ? <div style={{ padding: 34, border: '1px dashed #b9c8d5', borderRadius: 12, textAlign: 'center', background: '#f8fbfd' }}><div style={{ fontSize: 30 }}>◇</div><strong style={{ display: 'block', marginTop: 8 }}>Ready for passport generation</strong><p style={{ color: 'var(--muted)', margin: '6px auto 0', maxWidth: 600, fontSize: 13, lineHeight: 1.55 }}>After the additive migration is applied, approved listings can receive evidence-backed verification, liquidity, financing, and documentation scores without exposing private evidence publicly.</p></div> : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 14 }}>{overview.passports.map((passport) => <PassportCard key={passport.id} passport={passport} />)}</div>}
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 16 }}>
        {DEAL_INTELLIGENCE_MODULES.map((module, index) => <article key={module.title} className="card" style={{ padding: 22, borderTop: `4px solid ${module.accent}` }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><span style={{ fontSize: 11, fontWeight: 900, color: module.accent }}>MODULE {String(index + 1).padStart(2, '0')}</span><span style={{ color: module.accent }}>●</span></div><h3 style={{ fontSize: 18, margin: '10px 0 8px' }}>{module.title}</h3><p style={{ color: 'var(--muted)', fontSize: 13, lineHeight: 1.55, margin: 0 }}>{module.description}</p></article>)}
      </section>

      {/* Market trend cards — live anonymized pulse from sold comps */}
      <section style={{ marginTop: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 14 }}>
          <div><h2 style={{ fontSize: 22, margin: 0 }}>Market pulse</h2><p style={{ color: 'var(--muted)', fontSize: 13, margin: '5px 0 0' }}>Live anonymized sold-deal trends to frame every deal conversation.</p></div>
          <a href="/marketplace/pulse" style={{ fontSize: 12.5, color: '#0e7490', fontWeight: 700, textDecoration: 'none' }}>Full market pulse →</a>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 12 }}>
          {market ? (
          <>
            <Metric label="Closed transactions" value={market.deals} color="#0e7490" />
            <Metric label="Avg sale multiple" value={market.avgMultiple != null ? Number(market.avgMultiple).toFixed(2) + 'x' : 0} color="#b45309" />
            <Metric label="Avg sale price" value={market.avgPrice != null ? '$' + Math.round(market.avgPrice / 1000) + 'k' : 0} color="#1d4ed8" />
            <Metric label="Industries tracked" value={market.industries} color="#4338ca" />
          </>
          ) : (
            <div style={{ color: 'var(--muted)', fontSize: 13, padding: 8 }}>Loading market data…</div>
          )}
        </div>
      </section>
    </div>
  )
}

function Metric({ label, value, color }: { label: string; value: number | string; color: string }) { return <div className="card" style={{ padding: 16 }}><div style={{ fontSize: 28, fontWeight: 900, color }}>{value}</div><div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 4 }}>{label}</div></div> }

function PassportCard({ passport }: { passport: DealNetworkOverview['passports'][number] }) { return <div style={{ padding: 16, border: '1px solid #dce6ef', borderRadius: 12 }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><strong>Listing {passport.listing_id.slice(0, 8)}</strong><span style={{ fontSize: 11, color: '#0e7490', fontWeight: 800 }}>{passport.status}</span></div><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 14 }}><Score label="Verification" value={passport.verification_score} /><Score label="Liquidity" value={passport.liquidity_score} /><Score label="Financing" value={passport.financing_score} /><Score label="Documents" value={passport.documentation_score} /></div></div> }

function Score({ label, value }: { label: string; value: number }) { return <div style={{ padding: 9, borderRadius: 8, background: '#f4f8fb' }}><div style={{ fontSize: 10, color: '#7b8794' }}>{label}</div><strong style={{ fontSize: 16, color: value >= 75 ? '#166534' : '#9a6700' }}>{value}</strong></div> }

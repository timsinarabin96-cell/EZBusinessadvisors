/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

// =============================================================================
// /admin/marketplace-health — marketplace liquidity dashboard (admin only).
// The funnel that makes a marketplace valuable: listings → views → NDAs →
// leads → deals. Tracks growth so you can see liquidity improving week over
// week — the #1 thing that makes the marketplace worth selling.
// =============================================================================

import { useCallback, useEffect, useState } from 'react'
import { authenticatedFetch } from '@/lib/authenticatedFetch'
import { LoadingState } from '@/components/ui'

interface HealthData {
  days: number
  funnel: {
    liveListings: number
    totalListings: number
    views: number
    uniqueVisitors: number
    ndaRequests: number
    ndaSigned: number
    ndaApproved: number
    buyerLeads: number
    sellerLeads: number
  }
  trend: { week: string; views: number }[]
  topListings: { listing_id: string; public_title: string; is_featured: boolean }[]
  recentNdas: { id: string; status: string; created_at: string; listing_id: string | null }[]
}

export default function AdminMarketplaceHealthPage() {
  const [data, setData] = useState<HealthData | null>(null)
  const [days, setDays] = useState(30)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await authenticatedFetch(`/api/admin/marketplace-health?days=${days}`)
      const j = await res.json()
      if (!res.ok || !j.ok) setError(j.error || 'Access denied — platform admin only.')
      else setData(j)
    } catch {
      setError('Failed to load marketplace health.')
    } finally {
      setLoading(false)
    }
  }, [days])

  useEffect(() => { load() }, [load])

  const f = data?.funnel
  const maxViews = data ? Math.max(1, ...data.trend.map((t) => t.views)) : 1
  const conversion = f && f.views > 0 ? ((f.ndaRequests / f.views) * 100).toFixed(1) : '0.0'
  const leadConversion = f && f.ndaSigned > 0 ? ((f.buyerLeads / Math.max(1, f.ndaSigned)) * 100).toFixed(1) : '0.0'

  return (
    <div style={{ maxWidth: 1150, margin: '0 auto', padding: '28px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#1a1a2e' }}>🌐 Marketplace Health</div>
          <div style={{ color: '#888', fontSize: 13, marginTop: 4 }}>
            Liquidity funnel — listings → views → NDAs → leads. The #1 metric that makes a marketplace valuable.
          </div>
        </div>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid #d8d2c4', fontSize: 13, background: '#fff' }}>
          {[7, 30, 90, 365].map((d) => <option key={d} value={d}>Last {d} days</option>)}
        </select>
      </div>

      {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '14px 18px', borderRadius: 10, marginBottom: 16 }}>{error}</div>}

      {loading || !data ? (
        <LoadingState />
      ) : (
        <>
          {/* Funnel cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
            {[
              { label: 'Live listings', value: f?.liveListings ?? 0, color: '#1a1a2e', sub: `${f?.totalListings ?? 0} total` },
              { label: 'Listing views', value: f?.views ?? 0, color: '#0e7490', sub: `${f?.uniqueVisitors ?? 0} unique visitors` },
              { label: 'NDA requests', value: f?.ndaRequests ?? 0, color: '#7c3aed', sub: `${f?.ndaSigned ?? 0} signed · ${f?.ndaApproved ?? 0} approved` },
              { label: 'Buyer leads', value: f?.buyerLeads ?? 0, color: '#15803d', sub: `${f?.sellerLeads ?? 0} seller leads` },
            ].map((s) => (
              <div key={s.label} style={{ background: '#fff', border: '1px solid #ece8dc', borderRadius: 12, padding: '14px 18px' }}>
                <div style={{ fontSize: 11.5, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em' }}>{s.label}</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: s.color, marginTop: 4 }}>{s.value}</div>
                {s.sub && <div style={{ fontSize: 11.5, color: '#aaa', marginTop: 2 }}>{s.sub}</div>}
              </div>
            ))}
          </div>

          {/* Conversion rates */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
            <div style={{ background: '#fff', border: '1px solid #ece8dc', borderRadius: 12, padding: '16px 18px' }}>
              <div style={{ fontSize: 11.5, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em' }}>View → NDA</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#7c3aed', marginTop: 4 }}>{conversion}%</div>
              <div style={{ fontSize: 11.5, color: '#aaa', marginTop: 2 }}>of views become NDA requests</div>
            </div>
            <div style={{ background: '#fff', border: '1px solid #ece8dc', borderRadius: 12, padding: '16px 18px' }}>
              <div style={{ fontSize: 11.5, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em' }}>NDA → Lead</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#15803d', marginTop: 4 }}>{leadConversion}%</div>
              <div style={{ fontSize: 11.5, color: '#aaa', marginTop: 2 }}>of signed NDAs become buyer leads</div>
            </div>
            <div style={{ background: '#fff', border: '1px solid #ece8dc', borderRadius: 12, padding: '16px 18px' }}>
              <div style={{ fontSize: 11.5, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em' }}>Inventory ratio</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#0e7490', marginTop: 4 }}>{f && f.buyerLeads > 0 ? (f.liveListings / f.buyerLeads).toFixed(1) : '0.0'}</div>
              <div style={{ fontSize: 11.5, color: '#aaa', marginTop: 2 }}>listings per buyer lead (lower = hotter)</div>
            </div>
          </div>

          {/* View trend */}
          <div style={{ background: '#fff', border: '1px solid #ece8dc', borderRadius: 14, padding: '18px 22px', marginBottom: 20 }}>
            <div style={{ fontWeight: 800, color: '#1a1a2e', fontSize: 14, marginBottom: 12 }}>Weekly listing views</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 120 }}>
              {data.trend.map((t, i) => (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: '100%', background: '#0e7490', borderRadius: '6px 6px 0 0', height: `${Math.max(3, (t.views / maxViews) * 100)}%`, minHeight: 3 }} title={`${t.views} views`} />
                  <div style={{ fontSize: 10, color: '#94a3b8', whiteSpace: 'nowrap' }}>{t.week}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {/* Top listings */}
            <div style={{ background: '#fff', border: '1px solid #ece8dc', borderRadius: 14, padding: '18px 22px' }}>
              <div style={{ fontWeight: 800, color: '#1a1a2e', fontSize: 14, marginBottom: 12 }}>Live listings</div>
              {data.topListings.length === 0 ? (
                <div style={{ color: '#aaa', fontSize: 13 }}>No live listings — add inventory or publish drafts.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {data.topListings.map((l) => (
                    <div key={l.listing_id} style={{ display: 'flex', justifyContent: 'space-between', border: '1px solid #f1ede3', borderRadius: 8, padding: '8px 12px', fontSize: 13 }}>
                      <span style={{ color: '#1a1a2e', fontWeight: 600 }}>{l.public_title || l.listing_id.slice(0, 8)}</span>
                      {l.is_featured && <span style={{ color: '#b45309', fontWeight: 700, fontSize: 11 }}>⭐ featured</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recent NDAs */}
            <div style={{ background: '#fff', border: '1px solid #ece8dc', borderRadius: 14, padding: '18px 22px' }}>
              <div style={{ fontWeight: 800, color: '#1a1a2e', fontSize: 14, marginBottom: 12 }}>Recent NDA requests</div>
              {data.recentNdas.length === 0 ? (
                <div style={{ color: '#aaa', fontSize: 13 }}>No NDA requests in this window.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {data.recentNdas.slice(0, 10).map((n) => (
                    <div key={n.id} style={{ display: 'flex', justifyContent: 'space-between', border: '1px solid #f1ede3', borderRadius: 8, padding: '8px 12px', fontSize: 13 }}>
                      <span style={{ color: '#1a1a2e', fontWeight: 600 }}>{n.status}</span>
                      <span style={{ color: '#94a3b8', fontSize: 12 }}>{new Date(n.created_at).toLocaleDateString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      <div style={{ marginTop: 24, fontSize: 12, color: '#aaa', lineHeight: 1.6 }}>
        📈 Liquidity is the marketplace's moat: more live listings → more views → more NDAs → more leads → more closed deals → more success fees.
        Recruit 5–10 brokerages to list and watch these numbers compound.
      </div>
    </div>
  )
}

/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

// Visitor Intent panel — shared by the AI cockpit and the standalone route.
import { useCallback, useEffect, useState } from 'react'
import { LoadingState } from '@/components/ui'
import { fetchIntentForAgency, fetchIntentTotals, fetchVisitorPaths, type ListingIntentStats, type IntentTotals, type VisitorPath } from '@/lib/visitorIntent'
import ListingBuyerMatch from '@/components/intent/ListingBuyerMatch'

const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return '—'
  const d = new Date(iso)
  const now = new Date()
  const diffH = (now.getTime() - d.getTime()) / 3600000
  if (diffH < 1) return 'just now'
  if (diffH < 24) return `${Math.round(diffH)}h ago`
  if (diffH < 48) return 'yesterday'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function VisitorIntentPanel() {
  const [stats, setStats] = useState<ListingIntentStats[]>([])
  const [totals, setTotals] = useState<IntentTotals>({ totalViews: 0, uniqueVisitors: 0, hotListings: 0, listingsTracked: 0 })
  const [paths, setPaths] = useState<VisitorPath[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [s, t, p] = await Promise.all([fetchIntentForAgency(), fetchIntentTotals(), fetchVisitorPaths()])
    setStats(s)
    setTotals(t)
    setPaths(p)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const hot = stats.filter((s) => s.hot)

  return (
    <div>
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 26, color: 'var(--navy)', margin: 0 }}>Visitor Intent 👀</h1>
        <p style={{ color: 'var(--muted)', margin: '6px 0 0', fontSize: 14, maxWidth: 660 }}>
          Anonymous engagement on your public listings — views, unique visitors, and repeat lookers. Most buyers never register; this surfaces the 90% you&apos;d otherwise miss.
        </p>
      </div>

      {loading ? <LoadingState /> : stats.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, background: '#fff', border: '1px solid var(--line)', borderRadius: 14, color: 'var(--muted)' }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>👀</div>
          <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--navy)' }}>No listing views tracked yet</div>
          <div style={{ fontSize: 14, marginTop: 6 }}>Views accumulate as buyers browse your public listings.</div>
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 14, marginBottom: 24 }}>
            <Stat label="Total views" value={String(totals.totalViews)} accent="#102a43" />
            <Stat label="Unique visitors" value={String(totals.uniqueVisitors)} accent="#0e7490" />
            <Stat label="Hot listings (7d)" value={String(totals.hotListings)} accent="#b00020" />
            <Stat label="Listings tracked" value={String(totals.listingsTracked)} accent="#1e7e34" />
          </div>

          {hot.length > 0 && (
            <div style={{ background: '#fff', border: '1px solid rgba(176,0,32,0.25)', borderRadius: 14, padding: 18, marginBottom: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#b00020', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>🔥 Hot right now — 3+ viewers this week</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {hot.map((s) => (
                  <div key={s.listingId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 800, color: 'var(--navy)', fontSize: 14.5 }}>{s.businessName || 'Confidential listing'}</span>
                    <span style={{ fontSize: 13, color: '#5b6b7c' }}>{s.uniqueVisitors} unique · {s.totalViews} views · last {fmtDate(s.lastViewedAt)}</span>
                    <ListingBuyerMatch listingId={s.listingId} businessName={s.businessName} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {paths.length > 0 && (
            <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 18, marginBottom: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--navy)' }}>🧭 Buyer journeys — ranked by intent</div>
                <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{paths.length} anonymous visitors</span>
              </div>
              <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '0 0 14px' }}>
                Each anonymous visitor ranked by a recency-weighted intent score (views, re-reads, breadth). Expand to see which listings they walked through — the hot buyers you can&apos;t see in the CRM.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {paths.slice(0, 10).map((p, idx) => (
                  <div key={p.visitorId} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: '12px 14px' }}>
                    <button
                      onClick={() => setExpanded(expanded === p.visitorId ? null : p.visitorId)}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left', fontFamily: 'inherit' }}
                    >
                      <span style={{ width: 24, height: 24, borderRadius: 12, background: p.score >= 70 ? 'rgba(176,0,32,0.12)' : 'var(--paper)', color: p.score >= 70 ? '#b00020' : 'var(--navy)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, flexShrink: 0 }}>{idx + 1}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--navy)' }}>Score {p.score}<span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 400 }}>/100</span></span>
                          {p.score >= 70 && <span style={{ fontSize: 11, fontWeight: 700, color: '#b00020', background: 'rgba(176,0,32,0.08)', borderRadius: 10, padding: '1px 8px' }}>HOT</span>}
                          <span style={{ fontSize: 12, color: 'var(--muted)' }}>{p.totalViews} views · {p.distinctListings} listings · first {fmtDate(p.firstSeenAt)}</span>
                        </div>
                        <div style={{ marginTop: 6, height: 4, background: 'var(--line)', borderRadius: 2, overflow: 'hidden' }}>
                          <div style={{ height: '100%', borderRadius: 2, background: p.score >= 70 ? '#b00020' : p.score >= 40 ? '#d97706' : '#94a3b8', width: `${Math.max(6, p.score)}%` }} />
                        </div>
                      </div>
                      <span style={{ fontSize: 12, color: 'var(--muted)' }}>{expanded === p.visitorId ? '▲' : '▼'}</span>
                    </button>
                    {expanded === p.visitorId && (
                      <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {p.listings.map((l) => (
                          <div key={l.listingId} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                            <span style={{ fontSize: 15 }}>📄</span>
                            <span style={{ flex: 1, fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.businessName || 'Confidential listing'}</span>
                            <span style={{ color: 'var(--muted)', fontSize: 12 }}>{l.views}× · {fmtDate(l.lastViewedAt)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {stats.map((s) => (
              <div key={s.listingId} style={{ display: 'flex', alignItems: 'center', gap: 16, background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, color: 'var(--navy)', fontSize: 15 }}>
                    {s.businessName || 'Confidential listing'} {s.hot && <span style={{ fontSize: 12 }}>🔥</span>}
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 3 }}>Last viewed {fmtDate(s.lastViewedAt)}</div>
                  <div style={{ marginTop: 8 }}><ListingBuyerMatch listingId={s.listingId} businessName={s.businessName} /></div>
                </div>
                <Mini label="Views" value={String(s.totalViews)} />
                <Mini label="Unique" value={String(s.uniqueVisitors)} />
                <Mini label="Repeat" value={String(s.repeatViewers)} />
                <Mini label="7-day" value={String(s.viewsLast7d)} />
              </div>
            ))}
          </div>
          <p style={{ color: '#9aa5b1', fontSize: 12, marginTop: 20, textAlign: 'center' }}>
            Visitor ids are anonymous browser-generated UUIDs — never emails, never personal data.
          </p>
        </>
      )}
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return <div style={{ padding: 16, borderRadius: 12, background: '#fff', border: '1px solid var(--line)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
    <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</div>
    <div style={{ fontSize: 26, color: accent, fontWeight: 800, marginTop: 4 }}>{value}</div>
  </div>
}

function Mini({ label, value }: { label: string; value: string }) {
  return <div style={{ textAlign: 'center', minWidth: 54 }}><div style={{ fontSize: 18, fontWeight: 800, color: 'var(--navy)' }}>{value}</div><div style={{ fontSize: 10.5, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</div></div>
}

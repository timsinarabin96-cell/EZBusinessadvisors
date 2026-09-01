/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

// =============================================================================
// /dashboard/off-market — the private deal room.
// Off-market listings never appear on the public feed. They're visible only to
// verified buyers (buyer pass / POF-verified) and agency members. Full details
// require the NDA + broker flow — this page shows the curated teaser.
// =============================================================================

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import AppShell from '@/components/layout/AppShell'
import { ToastProvider } from '@/components/ui/Toast'
import { LoadingState } from '@/components/ui'
import { authenticatedFetch } from '@/lib/authenticatedFetch'
import { PageHero, EmptyState } from '@/components/ui/premium'

interface OffMarketDeal {
  listing_id: string
  slug: string
  public_title: string
  industry: string | null
  sub_industry: string | null
  location_general: string | null
  asking_price: number | null
  annual_revenue: number | null
  sde: number | null
  ebitda: number | null
  gallery_json: unknown
  agency_name: string | null
  contact_phone: string | null
}

const money = (n: number | null | undefined) => (n != null ? '$' + Math.round(n).toLocaleString() : '—')

const CLEARED_KEY = 'offmarket_cleared_v1'

function loadCleared(): string[] {
  try {
    const raw = localStorage.getItem(CLEARED_KEY)
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

function saveCleared(ids: string[]) {
  try {
    localStorage.setItem(CLEARED_KEY, JSON.stringify(ids))
  } catch { /* non-fatal */ }
}

export default function OffMarketPage() {
  const [deals, setDeals] = useState<OffMarketDeal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [cleared, setCleared] = useState<string[]>([])

  const load = useCallback(async () => {
    try {
      const res = await authenticatedFetch('/api/off-market')
      const j = await res.json()
      if (!res.ok || !j.ok) setError(j.error || 'Access denied — verified buyers and agency members only.')
      else setDeals(j.deals || [])
    } catch {
      setError('Failed to load the off-market room.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { setCleared(loadCleared()) }, [])

  const clearDeal = (id: string) => {
    const next = cleared.includes(id) ? cleared : [...cleared, id]
    setCleared(next)
    saveCleared(next)
  }
  const restoreDeal = (id: string) => {
    const next = cleared.filter((x) => x !== id)
    setCleared(next)
    saveCleared(next)
  }
  const clearAllVisible = () => {
    const next = Array.from(new Set([...cleared, ...deals.map((d) => d.listing_id)]))
    setCleared(next)
    saveCleared(next)
  }
  const restoreAll = () => {
    setCleared([])
    saveCleared([])
  }

  const visible = deals.filter((d) => !cleared.includes(d.listing_id))
  const clearedDeals = deals.filter((d) => cleared.includes(d.listing_id))

  return (
    <AppShell active="Off-Market">
      <ToastProvider>
        <div style={{ maxWidth: 1080, margin: '0 auto', padding: '0 18px 60px' }}>
          <PageHero
            icon="🔐"
            eyebrow="Off-Market"
            title="Off-Market Deal Room"
            sub="Private opportunities that never hit the public feed. Visible only to verified buyers and agency members — full details after NDA + broker review."
          />

          {loading ? <LoadingState label="Opening the deal room..." /> : error ? (
            <div style={{ textAlign: 'center', color: '#b91c1c', padding: 40, background: '#fff', border: '1px solid #fecaca', borderRadius: 12 }}>{error}</div>
          ) : deals.length === 0 ? (
            <EmptyState
              icon="🤫"
              title="Nothing off-market right now"
              sub="When an agency flags a listing as broker-only, it appears here for verified buyers."
            />
          ) : (
            <>
              {visible.length > 0 && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
                  <button
                    onClick={clearAllVisible}
                    style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}
                  >
                    ✕ Clear feed (mark all viewed)
                  </button>
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 18 }}>
                {visible.map((d) => (
                  <div key={d.listing_id} className="p-card" style={{ overflow: 'hidden' }}>
                    <div style={{ padding: '16px 18px', background: 'linear-gradient(135deg,#1a1a2e,#26264a)', color: '#fff' }}>
                      <div style={{ fontSize: 12, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#c9a84c', fontWeight: 800 }}>Off-Market · {d.industry || 'Business'}</div>
                      <div style={{ fontSize: 17, fontWeight: 800, marginTop: 6, lineHeight: 1.35 }}>{d.public_title}</div>
                      {d.location_general && <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.7)', marginTop: 4 }}>📍 {d.location_general}</div>}
                    </div>
                    <div style={{ padding: 16 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                        <div style={{ background: '#f8fafc', borderRadius: 10, padding: '10px 12px' }}>
                          <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Asking</div>
                          <div style={{ fontSize: 17, fontWeight: 800, color: '#1a1a2e' }}>{money(d.asking_price)}</div>
                        </div>
                        <div style={{ background: '#f8fafc', borderRadius: 10, padding: '10px 12px' }}>
                          <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>SDE</div>
                          <div style={{ fontSize: 17, fontWeight: 800, color: '#1a1a2e' }}>{money(d.sde)}</div>
                        </div>
                      </div>
                      {d.agency_name && <div style={{ fontSize: 12.5, color: '#64748b', marginBottom: 12 }}>Represented by <strong>{d.agency_name}</strong></div>}
                      <div style={{ display: 'flex', gap: 8 }}>
                        <Link href={`/marketplace/listings/${d.slug}`} style={{ flex: 1, textAlign: 'center', padding: '10px 12px', borderRadius: 8, background: '#1a1a2e', color: '#fff', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>
                          Request details (NDA)
                        </Link>
                        {d.contact_phone && (
                          <a href={`tel:${d.contact_phone.replace(/[^+\d]/g, '')}`} style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid #c9a84c', color: '#1a1a2e', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>
                            📞
                          </a>
                        )}
                        <button
                          onClick={() => clearDeal(d.listing_id)}
                          title="Clear from feed (view later via Retrieve)"
                          style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#94a3b8', fontSize: 13, cursor: 'pointer' }}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {clearedDeals.length > 0 && (
                <div style={{ marginTop: 28, borderTop: '1px solid #e2e8f0', paddingTop: 18 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: '#1a1a2e' }}>🗂 Cleared from feed ({clearedDeals.length})</div>
                    <button
                      onClick={restoreAll}
                      style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #c9a84c', background: '#fff', color: '#1a1a2e', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                    >
                      ↺ Retrieve all
                    </button>
                  </div>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {clearedDeals.map((d) => (
                      <div key={d.listing_id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fafafa', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 14px' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, color: '#1a1a2e', fontSize: 13.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.public_title}</div>
                          <div style={{ fontSize: 11.5, color: '#94a3b8' }}>{d.industry || 'Business'} · {money(d.asking_price)}</div>
                        </div>
                        <button
                          onClick={() => restoreDeal(d.listing_id)}
                          style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid var(--line)', background: '#fff', color: 'var(--navy)', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
                        >
                          ↺ Retrieve
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </ToastProvider>
    </AppShell>
  )
}

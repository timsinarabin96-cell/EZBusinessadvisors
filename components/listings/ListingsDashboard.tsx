/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Listing, fetchListings, updateListing, deleteListing, fmtMoney, LISTING_STATUSES } from '@/lib/listings'
import { listingImageFor } from '@/lib/stockImages'
import { useToast } from '@/components/ui/Toast'
import { LoadingState, EmptyState, Card, Badge } from '@/components/ui'
import { queueAutoPosts } from '@/lib/services/social'
import { supabase } from '@/lib/supabase/client'
import StaleListingPanel from '@/components/listings/StaleListingPanel'

export default function ListingsDashboard() {
  const router = useRouter()
  const toast = useToast()
  const [listings, setListings] = useState<Listing[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setListings(await fetchListings())
    } catch (e: any) {
      toast(e.message, 'error')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { load() }, [load])

  const handleDelete = async (listing: Listing) => {
    if (!confirm(`Delete listing "${listing.business_name}"?`)) return
    try {
      await deleteListing(listing.id)
      toast('Listing deleted', 'success')
      await load()
    } catch (e: any) {
      toast(e.message, 'error')
    }
  }

  const handleStatus = async (listing: Listing, status: string) => {
    setListings((p) => p.map((l) => (l.id === listing.id ? { ...l, status } : l)))
    try {
      await updateListing(listing.id, { status })
      toast(`Status → ${status}`, 'success')
    } catch (e: any) {
      toast(e.message, 'error')
    }
  }

  const filtered = statusFilter === 'all' ? listings : listings.filter((l) => l.status === statusFilter)
  const statusColor = (s?: string | null) =>
    s === 'active' ? '#22c55e' : s === 'under_contract' ? '#f59e0b' : s === 'sold' ? '#3b82f6' : s === 'draft' ? '#94a3b8' : '#64748b'

  return (
    <div>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26 }}>Listings</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: 14 }}>
            {listings.length} total · {listings.filter((l) => l.status === 'active').length} active
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-ghost" onClick={load}>↻ Refresh</button>
          <Link href="/dashboard/studio" className="btn btn-primary" style={{ textDecoration: 'none' }}>+ New Listing (AI Studio)</Link>
        </div>
      </header>

      {/* Stale-listing intelligence — views, inquiries, price vs market band */}
      <StaleListingPanel />

      {/* Status filter */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        <FilterPill active={statusFilter === 'all'} onClick={() => setStatusFilter('all')}>All</FilterPill>
        {LISTING_STATUSES.map((s) => (
          <FilterPill key={s} active={statusFilter === s} onClick={() => setStatusFilter(s)}>{s.replace(/_/g, ' ')}</FilterPill>
        ))}
      </div>

      {loading ? <LoadingState /> : null}

      {!loading && filtered.length === 0 ? (
        <EmptyState icon="🏢" title="No listings found" subtitle="Create a listing to get started." />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
          {!loading && filtered.map((listing) => (
            <Card key={listing.id} style={{ overflow: 'hidden' }}>
              {/* Image — auto branded cover when no photo (same fallback as the public site) */}
              <div style={{ height: 140, background: 'var(--navy)', position: 'relative' }}>
                {(() => {
                  const img = listingImageFor((listing as any).image_urls, (listing as any).industry, { title: (listing as any).business_name, price: (listing as any).asking_price })
                  return img ? (
                    <img src={img} alt={listing.business_name || ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--gold-light)', fontSize: 32 }}>🏢</div>
                  )
                })()}
                <div style={{ position: 'absolute', top: 10, left: 10 }}>
                  <Badge color={statusColor(listing.status)}>{listing.status || 'draft'}</Badge>
                </div>
              </div>

              <div style={{ padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {listing.listing_ref && (
                        <span style={{ background: 'var(--gold-light)', color: 'var(--navy)', fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 99, whiteSpace: 'nowrap' }}>
                          {listing.listing_ref}
                        </span>
                      )}
                      <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--navy)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {listing.business_name || 'Unnamed listing'}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>
                      {listing.industry || ''}{listing.location_general ? ` · ${listing.location_general}` : ''}
                      {listing.ai_readiness_score != null && (
                        <span
                          style={{
                            display: 'inline-block', marginLeft: 8, padding: '1px 8px', borderRadius: 99,
                            fontSize: 11, fontWeight: 700,
                            background: listing.ai_readiness_score >= 75 ? '#dcfce7' : listing.ai_readiness_score >= 45 ? '#fef3c7' : '#fee2e2',
                            color: listing.ai_readiness_score >= 75 ? '#15803d' : listing.ai_readiness_score >= 45 ? '#b45309' : '#b91c1c',
                          }}
                        >
                          Ready {listing.ai_readiness_score}%
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ fontWeight: 700, color: 'var(--gold-dark)', fontSize: 15, whiteSpace: 'nowrap' }}>{fmtMoney(listing.asking_price)}</div>
                </div>

                {listing.headline && (
                  <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 8, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {listing.headline}
                  </div>
                )}

                {/* Metrics */}
                <div style={{ display: 'flex', gap: 16, marginTop: 12, fontSize: 12, color: 'var(--muted)' }}>
                  <span>Rev {listing.annual_revenue ? fmtMoney(listing.annual_revenue) : '—'}</span>
                  <span>SDE {listing.sde ? fmtMoney(listing.sde) : '—'}</span>
                  {listing.ebitda ? <span>EBITDA {fmtMoney(listing.ebitda)}</span> : null}
                  {(() => {
                    const start = listing.published_at || listing.created_at
                    if (!start) return null
                    const days = Math.max(0, Math.floor((Date.now() - new Date(start).getTime()) / 86400000))
                    return <span style={{ color: days > 90 ? '#b91c1c' : days > 45 ? '#b45309' : 'var(--muted)' }}>⏱ {days}d on market</span>
                  })()}
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                  <Link href={`/dashboard/studio?phase=verify&listing=${listing.id}`} className="btn btn-navy" style={{ flex: 1, justifyContent: 'center', padding: '8px 10px', fontSize: 13 }}>✨ Open in Deal Studio</Link>
                  <Link href={`/cim?listing=${listing.id}`} className="btn btn-ghost" style={{ padding: '8px 10px', fontSize: 12.5 }}>📑 CIM</Link>
                  <Link href={`/bov?listing=${listing.id}`} className="btn btn-ghost" style={{ padding: '8px 10px', fontSize: 12.5 }}>⚖️ BOV</Link>
                  <button className="btn btn-danger" onClick={() => handleDelete(listing)}>🗑</button>
                </div>

                {/* Status change */}
                <select
                  className="select"
                  value={listing.status || 'draft'}
                  onChange={(e) => handleStatus(listing, e.target.value)}
                  style={{ marginTop: 10, fontSize: 13 }}
                >
                  {LISTING_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

function FilterPill({ children, active, onClick }: { children: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '7px 14px', borderRadius: 999, cursor: 'pointer', fontFamily: 'Georgia, serif', fontSize: 13, fontWeight: 600,
        border: active ? '2px solid var(--gold-dark)' : '1px solid var(--line)',
        background: active ? 'rgba(201,168,76,0.15)' : '#fff',
        color: active ? 'var(--gold-dark)' : 'var(--muted)',
      }}
    >
      {children}
    </button>
  )
}

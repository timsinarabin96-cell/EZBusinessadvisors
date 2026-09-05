/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useEffect, useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import { Chip, PageHero, SectionTitle } from '@/components/ui/premium'
import { LoadingState } from '@/components/ui'
import { getAgencyContext } from '@/lib/agencyContext'
import { getStoredAccessToken } from '@/lib/authToken'

// =============================================================================
// Unified Buyer Pool — one deduplicated view of every buyer signal: CRM buyer
// leads + marketplace profiles + saved-search watchlists, keyed by email.
// =============================================================================

interface PooledBuyer {
  email: string
  name: string | null
  phone: string | null
  company: string | null
  sources: { crm: boolean; profile: boolean; watchlist: boolean }
  industries: string[]
  locations: string[]
  budget_range: string | null
  min_price: number | null
  max_price: number | null
  status: string | null
  verified_buyer: boolean
  crm_listing_id: string | null
  watchlist_names: string[]
  last_active_at: string | null
  created_at: string | null
}

interface PoolSummary {
  total: number
  crmOnly: number
  marketplaceOnly: number
  inBoth: number
  verified: number
  activeWatchlists: number
}

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

const fmtMoney = (n: number | null) => (n == null ? null : `$${n.toLocaleString()}`)

export default function BuyerPoolPage() {
  const [agencyId, setAgencyId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [pool, setPool] = useState<PooledBuyer[]>([])
  const [summary, setSummary] = useState<PoolSummary | null>(null)

  useEffect(() => {
    ;(async () => {
      const ctx = await getAgencyContext()
      const ag = ctx?.agencyId || ''
      if (!ag) {
        setLoading(false)
        setError('No agency membership')
        return
      }
      setAgencyId(ag)
      const token = getStoredAccessToken()
      const res = await fetch(`/api/buyer-pool?agencyId=${ag}`, {
        headers: token ? { authorization: `Bearer ${token}` } : {},
      }).catch(() => null)
      const json = await res?.json().catch(() => ({}))
      if (json?.ok) {
        setPool(json.pool || [])
        setSummary(json.summary || null)
      } else {
        setError(json?.error || 'Could not load buyer pool')
      }
      setLoading(false)
    })()
  }, [])

  return (
    <AppShell active="Buyer Pool">
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '0 18px 60px' }}>
        <PageHero
          icon="🧲"
          eyebrow="Lead Intelligence"
          title="Unified Buyer Pool"
          sub="Every buyer in one deduplicated list — CRM leads, marketplace profiles, and saved-search watchlists merged by email."
        />

        {loading ? (
          <LoadingState label="Loading buyer pool…" />
        ) : error ? (
          <div style={{ padding: '28px 0', color: 'var(--muted)', fontSize: 13.5 }}>{error}</div>
        ) : (
          <>
            {summary && (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
                <Chip tone="navy">Total buyers: {summary.total}</Chip>
                <Chip tone="blue">CRM only: {summary.crmOnly}</Chip>
                <Chip tone="gold">Marketplace only: {summary.marketplaceOnly}</Chip>
                <Chip tone="green">In both: {summary.inBoth}</Chip>
                <Chip tone="purple">Verified: {summary.verified}</Chip>
                <Chip tone="gray">Active watchlists: {summary.activeWatchlists}</Chip>
              </div>
            )}

            <SectionTitle eyebrow={`${pool.length} buyers`} title="Pool" />
            {pool.length === 0 ? (
              <div style={{ padding: '28px 0', color: 'var(--muted)', fontSize: 13.5 }}>
                No buyers yet — leads and marketplace watchlists will appear here automatically.
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                {pool.map((b) => {
                  const priceRange = b.min_price != null || b.max_price != null
                    ? `${fmtMoney(b.min_price) || '$0'} – ${fmtMoney(b.max_price) || '∞'}`
                    : b.budget_range || null
                  return (
                    <div key={b.email} style={{ background: '#fff', border: '1px solid rgba(15,52,96,.08)', borderRadius: 14, padding: '14px 18px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 800, fontSize: 13.5, color: 'var(--navy)' }}>
                            {b.name || '(no name)'}
                            {b.company ? <span style={{ color: 'var(--muted)', fontWeight: 600 }}> · {b.company}</span> : null}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                            {b.email}
                            {b.phone ? ` · ${b.phone}` : ''}
                            {priceRange ? ` · ${priceRange}` : ''}
                            {` · active ${fmtDate(b.last_active_at)}`}
                          </div>
                          {(b.industries.length > 0 || b.locations.length > 0) && (
                            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 5 }}>
                              {b.industries.slice(0, 3).join(', ') || 'Any industry'}
                              {b.locations.length > 0 ? ` — ${b.locations.slice(0, 3).join(', ')}` : ''}
                            </div>
                          )}
                          {b.watchlist_names.length > 0 && (
                            <div style={{ fontSize: 11.5, color: '#8a6d1a', marginTop: 5 }}>
                              🔎 {b.watchlist_names.join(' · ')}
                            </div>
                          )}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                          <div style={{ display: 'flex', gap: 6 }}>
                            {b.sources.crm && <Chip tone="blue">CRM</Chip>}
                            {b.sources.profile && <Chip tone="gold">Profile</Chip>}
                            {b.sources.watchlist && <Chip tone="purple">Watchlist</Chip>}
                          </div>
                          <div style={{ display: 'flex', gap: 6 }}>
                            {b.verified_buyer && <Chip tone="green">Verified</Chip>}
                            {b.crm_listing_id && <Chip tone="navy">Attached</Chip>}
                            {b.status && <Chip tone="gray">{b.status}</Chip>}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  )
}

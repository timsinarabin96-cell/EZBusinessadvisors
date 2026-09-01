/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

// ---------------------------------------------------------------------------
// /dashboard/command-center — All listings with live status, SBA eligibility,
// workflow progress, and quick actions (open workflow / edit / withdraw).
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, CardHeader, LoadingState } from '@/components/ui'
import { StatCard } from '@/components/ui/premium'
import { useToast } from '@/components/ui/Toast'
import { fetchListings, fmtMoneyCompact } from '@/lib/listings'
import { getWorkflow, setListingStatus, fetchSBA } from '@/lib/workflow'
import StatusBadge from '@/components/listings/StatusBadge'
import SBABadge from '@/components/listings/SBABadge'

export function CommandCenterPanel() {
  const router = useRouter()
  const toast = useToast()
  const [listings, setListings] = useState<any[]>([])
  const [enriched, setEnriched] = useState<Record<string, { workflow?: any; sba?: any }>>({})
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')

  const load = useCallback(async () => {
    const rows = await fetchListings()
    setListings(rows)
    // Enrich workflow + SBA per listing (best-effort, parallel).
    const map: Record<string, any> = {}
    await Promise.all(rows.map(async (l) => {
      const [w, s] = await Promise.all([getWorkflow(l.id).catch(() => null), fetchSBA(l.id).catch(() => null)])
      map[l.id] = { workflow: w, sba: s }
    }))
    setEnriched(map)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) return <LoadingState label="Loading command center…" />

  const statuses = ['all', 'draft', 'active', 'pending_sale', 'under_contract', 'sold', 'withdrawn']
  const shown = filter === 'all' ? listings : listings.filter((l) => l.status === filter)

  const stats = {
    total: listings.length,
    active: listings.filter((l) => l.status === 'active').length,
    pending: listings.filter((l) => ['pending_sale', 'under_contract'].includes(l.status)).length,
    sold: listings.filter((l) => l.status === 'sold').length,
  }

  const doWithdraw = async (id: string) => {
    if (!confirm('Withdraw this listing?')) return
    const ok = await setListingStatus(id, 'withdrawn')
    toast(ok ? 'Listing withdrawn' : 'Withdraw failed', ok ? 'success' : 'error')
    load()
  }

  return (
    <div>
      {/* Stats row — premium stat tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(170px, 100%), 1fr))', gap: 14, marginBottom: 20 }}>
        <StatCard label="Total Listings" value={stats.total} sub="all statuses" />
        <StatCard label="Active" value={stats.active} sub="live on marketplace" accent="#16a34a" />
        <StatCard label="Pending / Contract" value={stats.pending} sub="in negotiation" accent="#b45309" />
        <StatCard label="Sold" value={stats.sold} sub="closed deals" accent="#0e7490" />
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {statuses.map((s) => (
          <button key={s} onClick={() => setFilter(s)} style={{ padding: '8px 15px', borderRadius: 20, cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', border: `1.5px solid ${filter === s ? 'var(--navy)' : 'var(--line)'}`, background: filter === s ? 'var(--navy)' : '#fff', color: filter === s ? '#fff' : 'var(--ink)' }}>
            {s === 'all' ? `All (${stats.total})` : `${s.replace(/_/g, ' ')}`}
          </button>
        ))}
      </div>

      {/* Listings table — premium shell */}
      <div className="p-card" style={{ overflow: 'hidden' }}>
        <div className="p-card-head">
          <div className="p-card-title">🏢 Listings</div>
          <Link href="/dashboard/listings/new" className="btn btn-gold" style={{ padding: '8px 16px', fontSize: 13 }}>+ New listing</Link>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="p-table">
            <thead>
              <tr>
                {['Business', 'Industry', 'Asking', 'Workflow', 'SBA', 'Status', 'Actions'].map((h) => <th key={h}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 && <tr><td colSpan={7} style={{ padding: 24, color: 'var(--muted)', textAlign: 'center' }}>No listings in this view.</td></tr>}
              {shown.map((l) => {
                const w = enriched[l.id]?.workflow
                const sba = enriched[l.id]?.sba
                const pct = w ? Math.round(((w.completed_steps || []).length / 10) * 100) : 0
                return (
                  <tr key={l.id}>
                    <td>
                      <Link href={`/dashboard/listings/${l.id}/workflow`} style={{ fontWeight: 700, color: 'var(--navy)', textDecoration: 'none' }}>{l.business_name}</Link>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>{l.location_general || ''}</div>
                    </td>
                    <td>{l.industry || '—'}</td>
                    <td><strong>{l.asking_price ? fmtMoneyCompact(l.asking_price) : '—'}</strong></td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 70, height: 5, background: 'var(--paper)', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: 'var(--gold)' }} />
                        </div>
                        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{pct}%</span>
                      </div>
                    </td>
                    <td><SBABadge eligible={sba?.is_sba_eligible} reviewed={!!sba?.reviewed_at} /></td>
                    <td><StatusBadge status={l.status} /></td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <Link href={`/dashboard/listings/${l.id}/workflow`} style={miniBtn}>Workflow</Link>
                        <Link href={`/dashboard/listings/${l.id}/edit`} style={miniBtn}>Edit</Link>
                        {l.status !== 'withdrawn' && l.status !== 'sold' && (
                          <button onClick={() => doWithdraw(l.id)} style={{ ...miniBtn, color: '#dc2626', borderColor: '#fecaca' }}>Withdraw</button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

const th: React.CSSProperties = { padding: '12px 14px', fontWeight: 700, color: 'var(--navy)', fontSize: 12.5, textTransform: 'uppercase', letterSpacing: 0.4, whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '14px', verticalAlign: 'middle' }
const miniBtn: React.CSSProperties = { display: 'inline-block', padding: '6px 11px', fontSize: 12, fontWeight: 600, color: 'var(--navy)', border: '1px solid var(--line)', borderRadius: 6, textDecoration: 'none', background: '#fff', cursor: 'pointer', fontFamily: 'inherit' }

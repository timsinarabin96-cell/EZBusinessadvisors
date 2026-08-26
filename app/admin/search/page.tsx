/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

// =============================================================================
// /admin/search — Global lookup (super admin only).
// One box, everything: users, listings, agencies, seller leads, buyer leads,
// and deals (matched via their listing's business name).
// =============================================================================

import { useState } from 'react'
import Link from 'next/link'
import { authenticatedFetch } from '@/lib/authenticatedFetch'

interface SearchResults {
  users: any[]
  listings: any[]
  agencies: any[]
  sellerLeads: any[]
  buyerLeads: any[]
  deals: any[]
}

const EMPTY: SearchResults = { users: [], listings: [], agencies: [], sellerLeads: [], buyerLeads: [], deals: [] }

export default function AdminSearchPage() {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<SearchResults>(EMPTY)
  const [searched, setSearched] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const run = async () => {
    const query = q.trim()
    if (query.length < 2) return
    setLoading(true)
    setError('')
    try {
      const res = await authenticatedFetch(`/api/admin/search?q=${encodeURIComponent(query)}`)
      const j = await res.json()
      if (!res.ok || !j.ok) { setError(j.error || 'Access denied'); return }
      setResults(j)
      setSearched(query)
    } catch { setError('Search failed.') } finally { setLoading(false) }
  }

  const money = (v: number | null) => (v == null ? '—' : '$' + Number(v).toLocaleString())

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 24px' }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ color: '#c9a84c', fontSize: 12, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 700 }}>Platform Control</div>
        <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 30, color: '#1a1a2e', margin: '6px 0 0' }}>Global Search</h1>
        <p style={{ color: '#888', fontSize: 14, margin: '6px 0 0' }}>Find anyone or anything across the entire platform.</p>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
        <input
          autoFocus
          className="input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') run() }}
          placeholder="🔍 Search email, business, agency, lead…"
          style={{ flex: 1, padding: '12px 16px', borderRadius: 10, border: '1px solid #d8d2c2', fontSize: 15 }}
        />
        <button onClick={run} disabled={loading} style={{ padding: '12px 28px', borderRadius: 10, background: '#1a1a2e', color: '#c9a84c', border: 'none', fontWeight: 800, fontSize: 14, cursor: loading ? 'wait' : 'pointer' }}>{loading ? 'Searching…' : 'Search'}</button>
      </div>

      {error && <div style={{ color: '#b91c1c', marginBottom: 16 }}>{error}</div>}

      {searched && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <ResultGroup title={`👥 Users (${results.users.length})`} empty="No users match">
            {results.users.map((u: any) => (
              <Row key={u.id} title={u.full_name || u.email} sub={`${u.email} · ${u.role} · ${u.status}`} right={u.created_at ? new Date(u.created_at).toLocaleDateString() : ''} />
            ))}
          </ResultGroup>
          <ResultGroup title={`🏢 Listings (${results.listings.length})`} empty="No listings match">
            {results.listings.map((l: any) => (
              <Row key={l.id} title={l.business_name || 'Untitled'} sub={`${l.review_stage || l.status} · ${money(l.asking_price)} asking`} right={l.id.slice(0, 8)} />
            ))}
          </ResultGroup>
          <ResultGroup title={`🏛️ Agencies (${results.agencies.length})`} empty="No agencies match">
            {results.agencies.map((a: any) => (
              <Row key={a.id} title={a.name} sub={`${a.slug || '—'} · ${a.plan_type || 'free'} · ${a.is_active ? 'active' : 'suspended'}`} right={a.id.slice(0, 8)} />
            ))}
          </ResultGroup>
          <ResultGroup title={`📥 Seller Leads (${results.sellerLeads.length})`} empty="No seller leads match">
            {results.sellerLeads.map((l: any) => (
              <Row key={l.id} title={l.business_name || l.contact_name || '—'} sub={`${l.contact_name || ''} ${l.contact_email ? '· ' + l.contact_email : ''} ${l.phone ? '· ' + l.phone : ''} · ${l.status}`} right={l.id.slice(0, 8)} />
            ))}
          </ResultGroup>
          <ResultGroup title={`📤 Buyer Leads (${results.buyerLeads.length})`} empty="No buyer leads match">
            {results.buyerLeads.map((l: any) => (
              <Row key={l.id} title={l.full_name || l.company || '—'} sub={`${l.email || ''} ${l.phone ? '· ' + l.phone : ''} · ${l.status}`} right={l.id.slice(0, 8)} />
            ))}
          </ResultGroup>
          <ResultGroup title={`🤝 Deals (${results.deals.length})`} empty="No deals match">
            {results.deals.map((d: any) => (
              <Row key={d.id} title={d.business_name} sub={`${d.status} · ${money(d.purchase_price)}`} right={d.id.slice(0, 8)} />
            ))}
          </ResultGroup>
          {!loading && !error && ['users', 'listings', 'agencies', 'sellerLeads', 'buyerLeads', 'deals'].every((k) => (results as any)[k].length === 0) && (
            <div style={{ textAlign: 'center', color: '#94a3b8', padding: '48px 20px', border: '2px dashed #e2e8f0', borderRadius: 12 }}>
              <div style={{ fontSize: 34, marginBottom: 10 }}>🔍</div>
              <div style={{ fontWeight: 600, color: '#64748b' }}>Nothing found for “{searched}”</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ResultGroup({ title, empty, children }: { title: string; empty: string; children: React.ReactNode }) {
  const rows = Array.isArray(children) ? children : []
  return (
    <div style={{ background: '#fff', border: '1px solid #ece8dc', borderRadius: 14, padding: 18 }}>
      <div style={{ fontWeight: 800, color: '#1a1a2e', marginBottom: 10, fontSize: 14.5 }}>{title}</div>
      {rows.length === 0 ? <div style={{ color: '#94a3b8', fontSize: 13 }}>{empty}</div> : <div style={{ display: 'flex', flexDirection: 'column' }}>{children}</div>}
    </div>
  )
}

function Row({ title, sub, right }: { title: string; sub: string; right?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '10px 4px', borderBottom: '1px solid #f1f5f9', alignItems: 'center' }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 13.5, color: '#1a1a2e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
        <div style={{ fontSize: 12.5, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</div>
      </div>
      {right && <div style={{ fontSize: 11.5, color: '#94a3b8', flexShrink: 0 }}>{right}</div>}
    </div>
  )
}

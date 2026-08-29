/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  UnifiedLead, LeadKind, LeadStatus, LEAD_STATUSES, statusMeta,
  fetchAllLeads, createLead, updateLead, deleteLead, convertLeadToDeal,
  fetchLeadActivities, addLeadActivity, LeadActivity, initials, mergeLeads,
} from '@/lib/leads2'
import { findDuplicateGroups, findCrossKindPairs } from '@/lib/leadDedup'
import type { DupGroup } from '@/lib/leadDedup'
import { fetchListings, Listing } from '@/lib/listings'
import { useToast } from '@/components/ui/Toast'
import { LoadingState, EmptyState, Card, Badge } from '@/components/ui'
import LeadFormModal from './LeadFormModal'
import BuyerProfilePopup from './BuyerProfilePopup'
import UnifiedLeadTimeline from './UnifiedLeadTimeline'
import { getStoredAccessToken } from '@/lib/authToken'

type KindFilter = 'all' | 'buyer' | 'seller'
type StatusFilter = LeadStatus | 'all'

interface LeadComm {
  id: string
  channel: string
  direction: string
  outcome: string
  summary: string | null
  created_at: string | null
}

export default function LeadsDashboard({ initialQuery = '' }: { initialQuery?: string }) {
  const toast = useToast()
  const [leads, setLeads] = useState<UnifiedLead[]>([])
  const [listings, setListings] = useState<Listing[]>([])
  const [kindFilter, setKindFilter] = useState<KindFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [search, setSearch] = useState(initialQuery)
  const [loading, setLoading] = useState(true)

  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<UnifiedLead | null>(null)

  const [selected, setSelected] = useState<UnifiedLead | null>(null)
  const [profileLead, setProfileLead] = useState<UnifiedLead | null>(null)
  const [activities, setActivities] = useState<LeadActivity[]>([])
  const [comms, setComms] = useState<LeadComm[]>([])
  const [converting, setConverting] = useState(false)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [l, ls] = await Promise.all([fetchAllLeads(), fetchListings()])
      setLeads(l)
      setListings(ls)
    } catch (e: any) {
      toast(e.message, 'error')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { load() }, [load])

  const openDetail = async (lead: UnifiedLead) => {
    setSelected(lead)
    setActivities(await fetchLeadActivities(lead.id))
    // Pull the conversation log (calls/emails/SMS) for this lead.
    try {
      const token = getStoredAccessToken()
      const param = lead.kind === 'buyer' ? 'buyerLeadId' : 'sellerLeadId'
      const res = await fetch(`/api/communications?${param}=${lead.id}`, { headers: { authorization: `Bearer ${token}` } })
      const j = await res.json().catch(() => ({}))
      setComms(j.communications || [])
    } catch {
      setComms([])
    }
  }

  const handleCreate = async (input: { kind: LeadKind; business_name?: string; email?: string; phone?: string; status?: LeadStatus }) => {
    if (input.kind === 'buyer') {
      // The modal already persisted the enriched buyer lead — refresh to pick it
      // up instead of double-inserting through the generic path.
      setShowForm(false)
      await load()
      toast('Lead created', 'success')
      return
    }
    const created = await createLead(input.kind, input)
    setShowForm(false)
    setLeads((p) => [created, ...p])
    toast('Lead created', 'success')
  }

  const handleUpdate = async (input: { kind: LeadKind; business_name?: string; email?: string; phone?: string; status?: LeadStatus }) => {
    if (!editing) return
    const updated = await updateLead(editing.kind, editing.id, input)
    setLeads((p) => p.map((l) => (l.kind === updated.kind && l.id === updated.id ? updated : l)))
    if (selected && selected.id === updated.id && selected.kind === updated.kind) setSelected(updated)
    setShowForm(false)
    setEditing(null)
    toast('Lead updated', 'success')
  }

  const handleDelete = async (lead: UnifiedLead) => {
    if (!confirm(`Delete ${lead.kind} lead${lead.business_name ? ` "${lead.business_name}"` : ''}?`)) return
    try {
      await deleteLead(lead.kind, lead.id)
      setLeads((p) => p.filter((l) => !(l.kind === lead.kind && l.id === lead.id)))
      if (selected && selected.id === lead.id) setSelected(null)
      toast('Lead deleted', 'success')
    } catch (e: any) {
      toast(e.message, 'error')
    }
  }

  const handleStatus = async (lead: UnifiedLead, status: LeadStatus) => {
    const prev = lead.status
    const patch = (s: string) => setLeads((p) => p.map((l) => (l.kind === lead.kind && l.id === lead.id ? { ...l, status: s } : l)))
    patch(status)
    if (selected?.id === lead.id) setSelected({ ...selected, status })
    try {
      await updateLead(lead.kind, lead.id, { status })
      await addLeadActivity(lead.id, 'status', `Status changed to ${status.replace(/_/g, ' ')}`)
    } catch (e: any) {
      toast(e.message, 'error')
      patch(prev)
    }
  }

  const handleConvert = async () => {
    if (!selected) return
    setConverting(true)
    try {
      const { dealId } = await convertLeadToDeal(selected)
      toast(`Converted to deal ${dealId.slice(0, 8)}`, 'success')
      await load()
      setSelected(null)
    } catch (e: any) {
      toast(e.message, 'error')
    } finally {
      setConverting(false)
    }
  }

  // --- One-click NDA: send to buyer, then broker counter-signs ----------
  const [ndaSending, setNdaSending] = useState<string | null>(null)
  const [ndaSent, setNdaSent] = useState<Record<string, string>>({})

  const handleSendNda = async (lead: UnifiedLead) => {
    if (lead.kind !== 'buyer' || !lead.email) return
    setNdaSending(lead.id)
    try {
      const token = getStoredAccessToken()
      const res = await fetch('/api/nda/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ leadId: lead.id }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.ok) throw new Error(j.error || 'Could not send NDA')
      setNdaSent((p) => ({ ...p, [lead.id]: j.documentId }))
      toast(j.message || `NDA sent to ${lead.email}`, 'success')
    } catch (e: any) {
      toast(e.message || 'Could not send NDA', 'error')
    } finally {
      setNdaSending(null)
    }
  }

  // --- Lead hygiene: duplicates + cross-kind matches + sources ----------
  const dupGroups = useMemo(() => findDuplicateGroups(leads), [leads])
  const crossPairs = useMemo(
    () => findCrossKindPairs(
      leads.filter((l) => l.kind === 'buyer'),
      leads.filter((l) => l.kind === 'seller'),
    ),
    [leads],
  )
  const groupKey = (g: DupGroup) => g.members.map((m) => m.id).sort().join('|')
  const visibleGroups = dupGroups.filter((g) => !dismissed.has(groupKey(g)))
  const visiblePairs = crossPairs.filter((p) => !dismissed.has(`pair:${p.buyer.id}:${p.seller.id}`))

  const sourceSummary = useMemo(() => {
    const m = new Map<string, number>()
    for (const l of leads) {
      const key = l.source || 'Unattributed'
      m.set(key, (m.get(key) || 0) + 1)
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [leads])

  const handleMergeGroup = async (g: DupGroup) => {
    const keeper = g.members[0]
    try {
      for (let i = 1; i < g.members.length; i++) {
        await mergeLeads(keeper.kind, keeper.id, g.members[i].id)
      }
      toast('Duplicates merged', 'success')
      await load()
    } catch (e: any) {
      toast(e.message, 'error')
    }
  }

  const filtered = leads.filter((l) => {
    if (kindFilter !== 'all' && l.kind !== kindFilter) return false
    if (statusFilter !== 'all' && l.status !== statusFilter) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      const hay = [l.business_name, l.email, l.phone].filter(Boolean).join(' ').toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })

  const countKind = (k: 'buyer' | 'seller') => leads.filter((l) => l.kind === k).length

  return (
    <div>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26 }}>Lead Management</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: 14 }}>
            {leads.length} total · {countKind('buyer')} buyers · {countKind('seller')} sellers
          </p>
          {sourceSummary.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
              {sourceSummary.map(([s, c]) => (
                <span key={s} style={{ fontSize: 11.5, padding: '3px 10px', borderRadius: 999, background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', fontWeight: 600 }}>
                  {s} · {c}
                </span>
              ))}
            </div>
          )}
        </div>
        <button className="btn btn-primary" onClick={() => { setEditing(null); setShowForm(true) }}>+ Add Lead</button>
      </header>

      {/* Filters */}
      <div className="card" style={{ padding: 16, marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            className="input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by business, email, phone..."
            style={{ flex: 1, minWidth: 220 }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <FilterPill active={kindFilter === 'all'} onClick={() => setKindFilter('all')}>All</FilterPill>
            <FilterPill active={kindFilter === 'buyer'} onClick={() => setKindFilter('buyer')}>👤 Buyers</FilterPill>
            <FilterPill active={kindFilter === 'seller'} onClick={() => setKindFilter('seller')}>🏢 Sellers</FilterPill>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <FilterPill active={statusFilter === 'all'} onClick={() => setStatusFilter('all')}>All Statuses</FilterPill>
          {LEAD_STATUSES.map((s) => (
            <FilterPill key={s.id} active={statusFilter === s.id} onClick={() => setStatusFilter(s.id)} color={s.color}>
              {s.label}
            </FilterPill>
          ))}
        </div>
      </div>

      {/* Lead hygiene — duplicates + cross-kind matches */}
      {(visibleGroups.length > 0 || visiblePairs.length > 0) && (
        <div className="card" style={{ padding: 18, marginBottom: 20, border: '1px solid rgba(201,168,76,0.45)' }}>
          <div className="section-title" style={{ marginBottom: 4 }}>🧹 Lead hygiene</div>
          <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--muted)' }}>
            {visibleGroups.length} duplicate {visibleGroups.length === 1 ? 'group' : 'groups'}
            {visiblePairs.length > 0 && ` · ${visiblePairs.length} buyer↔seller ${visiblePairs.length === 1 ? 'match' : 'matches'}`} detected.
          </p>

          {visibleGroups.map((g) => {
            const keeper = g.members[0]
            return (
              <div key={groupKey(g)} style={{ border: '1px solid #e7edf3', borderRadius: 10, padding: 14, marginBottom: 10, background: '#fffdf7' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
                  <span style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--navy)' }}>
                    Duplicate group — {g.reason} ({g.members.length} leads)
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>oldest → newest</span>
                </div>
                {g.members.map((m, i) => (
                  <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', fontSize: 13, gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: i === 0 ? 700 : 500 }}>
                      {i === 0 ? '📌 ' : '➖ '}{m.business_name || m.email || 'Unnamed lead'} <span style={{ color: 'var(--muted)', fontSize: 12 }}>{m.kind === 'buyer' ? '👤 buyer' : '🏢 seller'}</span>
                    </span>
                    <span style={{ color: 'var(--muted)', fontSize: 12 }}>
                      {m.email || '—'} · {m.phone || '—'} · {m.created_at ? new Date(m.created_at).toLocaleDateString() : ''}
                    </span>
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                  <button className="btn btn-navy" style={{ padding: '7px 14px', fontSize: 12.5 }} onClick={() => handleMergeGroup(g)}>
                    Merge into {keeper.business_name || keeper.email || 'oldest lead'}
                  </button>
                  <button className="btn btn-ghost" style={{ padding: '7px 14px', fontSize: 12.5 }} onClick={() => setDismissed((p) => new Set(p).add(groupKey(g)))}>
                    Dismiss
                  </button>
                </div>
              </div>
            )
          })}

          {visiblePairs.map((p) => (
            <div key={`pair:${p.buyer.id}:${p.seller.id}`} style={{ border: '1px solid #bfdbfe', borderRadius: 10, padding: 14, marginBottom: 10, background: '#f8faff' }}>
              <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--navy)', marginBottom: 6 }}>
                🔗 Same person is both a buyer and a seller — {p.via === 'email' ? 'same email' : 'same phone'}
              </div>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 10 }}>
                🏢 {p.seller.business_name || p.seller.email} (seller) · 👤 {p.buyer.email || p.buyer.phone} (buyer)
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn btn-navy" style={{ padding: '7px 14px', fontSize: 12.5 }} onClick={() => setProfileLead(p.seller as UnifiedLead)}>Open seller profile</button>
                <button className="btn btn-navy" style={{ padding: '7px 14px', fontSize: 12.5 }} onClick={() => setProfileLead(p.buyer as UnifiedLead)}>Open buyer profile</button>
                <button className="btn btn-ghost" style={{ padding: '7px 14px', fontSize: 12.5 }} onClick={() => setDismissed((s) => new Set(s).add(`pair:${p.buyer.id}:${p.seller.id}`))}>Dismiss</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {loading ? <LoadingState /> : null}

      {!loading && filtered.length === 0 ? (
        <EmptyState icon="🎯" title="No leads found" subtitle="Add a lead or adjust your filters." />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
          {!loading && filtered.map((lead) => {
            const meta = statusMeta(lead.status)
            // Heat score: recency + status → hot / warm / cold.
            const ageDays = lead.created_at ? Math.max(0, (Date.now() - new Date(lead.created_at).getTime()) / 86400000) : 999
            const heat = (() => {
              if (lead.status === 'closed_won' || lead.status === 'converted') return { label: '🔥 Won', color: '#22c55e' }
              if (ageDays <= 3) return { label: '🔥 Hot', color: '#ef4444' }
              if (ageDays <= 10) return { label: '🟡 Warm', color: '#f59e0b' }
              return { label: '❄️ Cold', color: '#64748b' }
            })()
            return (
              <Card key={`${lead.kind}-${lead.id}`} style={{ padding: 16, cursor: 'pointer' }} onClick={() => openDetail(lead)}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <Badge color={lead.kind === 'buyer' ? '#3b82f6' : '#8b5cf6'}>
                    {lead.kind === 'buyer' ? '👤 Buyer' : '🏢 Seller'}
                  </Badge>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <Badge color={heat.color}>{heat.label}</Badge>
                    <Badge color={meta.color}>{meta.label}</Badge>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'var(--navy)', color: 'var(--gold-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
                    {lead.business_name ? initials(lead.business_name) : lead.email?.slice(0, 2).toUpperCase() || '?'}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, color: 'var(--navy)', fontSize: 15 }}>
                      {lead.business_name || lead.email || 'Unnamed lead'}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                      {lead.phone || '—'} · {lead.created_at ? new Date(lead.created_at).toLocaleDateString() : ''}
                      {lead.source ? ` · ${lead.source}` : ''}
                    </div>
                  </div>
                </div>
                {/* Quick actions — text / call the lead in one tap + profile popup */}
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  {lead.phone && (
                    <>
                      <a
                        href={`sms:${lead.phone}`}
                        onClick={(e) => e.stopPropagation()}
                        style={{ flex: 1, textAlign: 'center', padding: '7px 10px', borderRadius: 8, fontSize: 12.5, fontWeight: 700, background: '#ecfdf5', color: '#15803d', border: '1px solid #bbf7d0', textDecoration: 'none' }}
                      >
                        💬 Text
                      </a>
                      <a
                        href={`tel:${lead.phone}`}
                        onClick={(e) => e.stopPropagation()}
                        style={{ flex: 1, textAlign: 'center', padding: '7px 10px', borderRadius: 8, fontSize: 12.5, fontWeight: 700, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', textDecoration: 'none' }}
                      >
                        📞 Call
                      </a>
                    </>
                  )}
                  {lead.kind === 'buyer' && lead.email && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleSendNda(lead) }}
                      disabled={ndaSending === lead.id}
                      style={{ flex: lead.phone ? 0.7 : 1, textAlign: 'center', padding: '7px 10px', borderRadius: 8, fontSize: 12.5, fontWeight: 700, background: ndaSent[lead.id] ? '#f0fdf4' : '#fff7ed', color: ndaSent[lead.id] ? '#15803d' : '#92400e', border: ndaSent[lead.id] ? '1px solid #bbf7d0' : '1px solid #fed7aa', cursor: ndaSending === lead.id ? 'wait' : 'pointer' }}
                    >
                      {ndaSending === lead.id ? '⏳ Sending…' : ndaSent[lead.id] ? '✅ NDA sent' : '📄 Send NDA'}
                    </button>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); setProfileLead(lead) }}
                    style={{ flex: lead.phone || (lead.kind === 'buyer' && lead.email) ? 0.7 : 1, textAlign: 'center', padding: '7px 10px', borderRadius: 8, fontSize: 12.5, fontWeight: 700, background: '#fff7ed', color: '#92400e', border: '1px solid #fed7aa', cursor: 'pointer', fontFamily: 'Georgia, serif' }}
                  >
                    👤 Profile
                  </button>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* Form modal */}
      {showForm && (
        <LeadFormModal
          lead={editing}
          mode={editing ? editing.kind : 'seller'}
          onClose={() => { setShowForm(false); setEditing(null) }}
          onSubmit={editing ? handleUpdate : handleCreate}
        />
      )}

      {/* Detail drawer */}
      {selected && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(26,26,46,0.55)', zIndex: 1000, display: 'flex', justifyContent: 'flex-end' }} onClick={() => setSelected(null)}>
          <div style={{ background: '#fff', width: 440, maxWidth: '100%', height: '100%', boxShadow: '-20px 0 60px rgba(26,26,46,0.4)', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ background: 'var(--navy)', color: '#fff', padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h2 style={{ margin: 0, fontSize: 18, color: '#fff' }}>{selected.business_name || selected.email || 'Lead'}</h2>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button
                    onClick={() => setProfileLead(selected)}
                    style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.35)', color: '#fff', padding: '5px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Georgia, serif' }}
                  >
                    👤 Profile
                  </button>
                  <button onClick={() => setSelected(null)} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', width: 30, height: 30, borderRadius: '50%', cursor: 'pointer' }}>✕</button>
                </div>
              </div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 6 }}>
                {selected.kind === 'seller' ? 'Seller Lead' : 'Buyer Lead'} · {selected.email || 'no email'} · {selected.phone || 'no phone'}
                {selected.source ? ` · from ${selected.source}` : ''}
              </div>
              <div style={{ marginTop: 10 }}>
                <Badge color={statusMeta(selected.status).color}>{statusMeta(selected.status).label}</Badge>
              </div>
            </div>

            <div style={{ padding: 20, overflowY: 'auto', flex: 1 }}>
              {/* Status */}
              <div className="section-title" style={{ marginBottom: 8 }}>Status</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
                {LEAD_STATUSES.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => handleStatus(selected, s.id)}
                    style={{
                      padding: '6px 12px', borderRadius: 999, cursor: 'pointer', fontFamily: 'Georgia, serif', fontSize: 12.5, fontWeight: 600,
                      border: selected.status === s.id ? `2px solid ${s.color}` : '1px solid var(--line)',
                      background: selected.status === s.id ? s.color + '1a' : '#fff',
                      color: selected.status === s.id ? s.color : 'var(--muted)',
                    }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>

              {/* Convert to deal */}
              <div className="section-title" style={{ marginBottom: 8 }}>Actions</div>
              <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
                <button className="btn btn-navy" style={{ flex: 1 }} onClick={handleConvert} disabled={converting}>
                  {converting ? 'Converting...' : '🎯 Convert to Deal'}
                </button>
                <button className="btn btn-ghost" onClick={() => { setEditing(selected); setShowForm(true) }}>Edit</button>
                <button className="btn btn-danger" onClick={() => handleDelete(selected)}>Delete</button>
              </div>

              {/* Unified timeline — calls / emails / SMS / notes / status in one feed */}
              <div className="section-title" style={{ marginBottom: 10 }}>Timeline</div>
              <ActivityNoteForm leadId={selected.id} onAdded={(a) => setActivities((p) => [a, ...p])} />
              <div style={{ marginTop: 12 }}>
                <UnifiedLeadTimeline comms={comms} activities={activities} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Buyer / Seller profile popup (business-card + deal context) */}
      {profileLead && (
        <BuyerProfilePopup lead={profileLead} onClose={() => setProfileLead(null)} />
      )}
    </div>
  )
}

function FilterPill({ children, active, onClick, color }: { children: React.ReactNode; active: boolean; onClick: () => void; color?: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '7px 14px', borderRadius: 999, cursor: 'pointer', fontFamily: 'Georgia, serif', fontSize: 13, fontWeight: 600,
        border: active ? `2px solid ${color || 'var(--gold-dark)'}` : '1px solid var(--line)',
        background: active ? (color || 'var(--gold)') + '1a' : '#fff',
        color: active ? (color || 'var(--gold-dark)') : 'var(--muted)',
      }}
    >
      {children}
    </button>
  )
}

function ActivityNoteForm({ leadId, onAdded }: { leadId: string; onAdded: (a: LeadActivity) => void }) {
  const toast = useToast()
  const [text, setText] = useState('')
  const [type, setType] = useState('note')
  const [adding, setAdding] = useState(false)

  const add = async () => {
    if (!text.trim()) return
    setAdding(true)
    const a = await addLeadActivity(leadId, type, text.trim())
    setAdding(false)
    if (a) { onAdded(a); setText('') }
    else toast('Could not log activity — try again', 'error')
  }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <input
        className="input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Add a note..."
        onKeyDown={(e) => e.key === 'Enter' && add()}
        style={{ flex: 1 }}
      />
      <select className="select" value={type} onChange={(e) => setType(e.target.value)} style={{ width: 110 }}>
        {['note', 'call', 'email', 'meeting'].map((t) => <option key={t} value={t}>{t}</option>)}
      </select>
      <button className="btn btn-navy" onClick={add} disabled={adding || !text.trim()}>Add</button>
    </div>
  )
}

const timeAgo = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return new Date(iso).toLocaleDateString()
}

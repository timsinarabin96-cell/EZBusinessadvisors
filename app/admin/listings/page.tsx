'use client'

// =============================================================================
// /admin/listings — Platform moderation queue (super admin only).
// Every listing across every tenant: pending review, flagged, live, rejected.
// Actions: approve / reject (with reason) / unpublish / flag / clear flag.
// All actions are audit-logged.
// =============================================================================

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { authenticatedFetch } from '@/lib/authenticatedFetch'
import { LoadingState } from '@/components/ui'
import { useToast } from '@/components/ui/Toast'

interface ListingRow {
  id: string
  business_name: string | null
  status: string
  review_stage: string | null
  flagged: boolean
  flag_reasons: string[] | null
  asking_price: number | null
  annual_revenue: number | null
  sde: number | null
  city: string | null
  state: string | null
  created_at: string | null
  published_at: string | null
  agency_id: string | null
  agency_name: string
  agent_id: string | null
  owner_name: string
  owner_email: string
  moderation_reason: string | null
  moderated_at: string | null
}

const STAGES = [
  { key: 'pending_review', label: '⏳ Pending Review', color: '#b45309' },
  { key: 'approved', label: '✅ Live / Approved', color: '#15803d' },
  { key: 'flagged', label: '🚩 Flagged', color: '#b91c1c' },
  { key: 'rejected', label: '❌ Rejected', color: '#64748b' },
  { key: 'changes_requested', label: '✏️ Changes Requested', color: '#b45309' },
  { key: 'draft', label: '📝 Draft', color: '#94a3b8' },
  { key: 'all', label: 'All', color: '#334155' },
]

const STAGE_PILL: Record<string, { bg: string; color: string }> = {
  approved: { bg: '#22c55e1a', color: '#15803d' },
  pending_review: { bg: '#f59e0b1a', color: '#b45309' },
  rejected: { bg: '#ef44441a', color: '#b91c1c' },
  changes_requested: { bg: '#f59e0b1a', color: '#b45309' },
  agent_review: { bg: '#3b82f61a', color: '#1d4ed8' },
  draft: { bg: '#94a3b81a', color: '#64748b' },
}

export default function AdminListingsPage() {
  const toast = useToast()
  const [listings, setListings] = useState<ListingRow[]>([])
  const [stage, setStage] = useState('pending_review')
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (stage !== 'all') params.set('stage', stage)
      if (stage === 'flagged') params.set('flagged', 'true')
      if (q.trim()) params.set('q', q.trim())
      const res = await authenticatedFetch(`/api/admin/listings?${params.toString()}`)
      const j = await res.json()
      if (!res.ok || !j.ok) { setError(j.error || 'Access denied'); return }
      setListings(j.listings || [])
    } catch { setError('Failed to load listings.') } finally { setLoading(false) }
  }, [stage, q])

  useEffect(() => { load() }, [load])

  const act = async (id: string, action: string, reason?: string) => {
    setBusy(id)
    try {
      const res = await authenticatedFetch('/api/admin/listings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action, reason }),
      })
      const j = await res.json()
      if (j.ok) { toast(`Listing ${action}d ✅`, 'success'); load() } else toast(j.error || 'Failed', 'error')
    } finally { setBusy(null) }
  }

  const withReason = (id: string, action: 'reject' | 'flag') => {
    const reason = window.prompt(action === 'reject' ? 'Rejection reason (sent to the listing owner):' : 'Flag reason:')
    if (reason === null) return
    act(id, action, reason || undefined)
  }

  const money = (v: number | null) => (v == null ? '—' : '$' + Number(v).toLocaleString())

  if (loading && listings.length === 0) return <LoadingState label="Loading moderation queue..." />
  if (error) {
    return (
      <div style={{ maxWidth: 560, margin: '80px auto', textAlign: 'center' }}>
        <div style={{ fontSize: 44 }}>🔐</div>
        <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 24, color: '#1a1a2e' }}>Platform Admin Only</h1>
        <p style={{ color: '#888' }}>{error}</p>
        <Link href="/auth" style={{ display: 'inline-block', marginTop: 16, background: '#1a1a2e', color: '#fff', padding: '11px 26px', borderRadius: 8, textDecoration: 'none', fontWeight: 700 }}>Sign in as admin</Link>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '40px 24px' }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ color: '#c9a84c', fontSize: 12, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 700 }}>Platform Control</div>
        <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 30, color: '#1a1a2e', margin: '6px 0 0' }}>Listing Moderation</h1>
        <p style={{ color: '#888', fontSize: 14, margin: '6px 0 0' }}>Every listing across all tenants. Approve, reject with a reason, unpublish, or flag.</p>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {STAGES.map((s) => (
          <button
            key={s.key}
            onClick={() => setStage(s.key)}
            style={{ padding: '8px 14px', borderRadius: 99, border: '1px solid #e2e8f0', background: stage === s.key ? s.color : '#fff', color: stage === s.key ? '#fff' : s.color, fontSize: 12.5, fontWeight: 800, cursor: 'pointer' }}
          >
            {s.label}
          </button>
        ))}
        <input
          className="input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') load() }}
          placeholder="🔍 Search business name…"
          style={{ marginLeft: 'auto', padding: '8px 12px', borderRadius: 8, border: '1px solid #d8d2c2', fontSize: 13, width: 220 }}
        />
      </div>

      {/* Queue */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {listings.length === 0 && (
          <div style={{ textAlign: 'center', color: '#94a3b8', padding: '60px 20px', border: '2px dashed #e2e8f0', borderRadius: 12 }}>
            <div style={{ fontSize: 34, marginBottom: 10 }}>🗂️</div>
            <div style={{ fontWeight: 600, color: '#64748b' }}>Nothing in this queue</div>
          </div>
        )}
        {listings.map((l) => {
          const pill = STAGE_PILL[l.review_stage || l.status] || STAGE_PILL.draft
          return (
            <div key={l.id} style={{ background: '#fff', border: `1px solid ${l.flagged ? '#fecaca' : '#ece8dc'}`, borderRadius: 14, padding: '16px 20px', display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 280 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 800, fontSize: 15.5, color: '#1a1a2e' }}>{l.business_name || 'Untitled business'}</span>
                  <span style={{ background: pill.bg, color: pill.color, padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 800, textTransform: 'uppercase' }}>{l.review_stage || l.status}</span>
                  {l.flagged && <span style={{ background: '#ef44441a', color: '#b91c1c', padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 800 }}>🚩 {(l.flag_reasons || []).length > 0 ? `${l.flag_reasons!.length} flag(s)` : 'FLAGGED'}</span>}
                </div>
                <div style={{ color: '#64748b', fontSize: 13, marginTop: 5 }}>
                  {[l.city, l.state].filter(Boolean).join(', ') || 'Location —'} · {money(l.asking_price)} asking · {money(l.annual_revenue)} rev · {money(l.sde)} SDE
                </div>
                <div style={{ color: '#94a3b8', fontSize: 12.5, marginTop: 3 }}>
                  <b style={{ color: '#64748b' }}>{l.agency_name}</b> · {l.owner_name} ({l.owner_email}) · created {l.created_at ? new Date(l.created_at).toLocaleDateString() : '—'}
                  {l.published_at ? ` · live ${new Date(l.published_at).toLocaleDateString()}` : ''}
                </div>
                {l.moderation_reason && (
                  <div style={{ marginTop: 8, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px', fontSize: 12.5, color: '#b91c1c' }}>
                    <b>Moderation note:</b> {l.moderation_reason}
                  </div>
                )}
                {(l.flag_reasons || []).length > 0 && (
                  <div style={{ marginTop: 8, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 12px', fontSize: 12.5, color: '#92400e' }}>
                    <b>Flag reasons:</b> {(l.flag_reasons || []).join(' · ')}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                {(l.status !== 'active' || l.review_stage !== 'approved') && (
                  <ActionBtn color="#15803d" bg="#22c55e1a" disabled={busy === l.id} onClick={() => act(l.id, 'approve')}>✅ Approve</ActionBtn>
                )}
                <ActionBtn color="#b91c1c" bg="#ef44441a" disabled={busy === l.id} onClick={() => withReason(l.id, 'reject')}>❌ Reject</ActionBtn>
                <ActionBtn color="#b45309" bg="#f59e0b1a" disabled={busy === l.id} onClick={() => act(l.id, 'unpublish')}>⏸ Unpublish</ActionBtn>
                {l.flagged
                  ? <ActionBtn color="#64748b" bg="#94a3b81a" disabled={busy === l.id} onClick={() => act(l.id, 'clear_flag')}>🚩 Clear flag</ActionBtn>
                  : <ActionBtn color="#b91c1c" bg="#fef2f2" disabled={busy === l.id} onClick={() => withReason(l.id, 'flag')}>🚩 Flag</ActionBtn>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ActionBtn({ children, onClick, color, bg, disabled }: { children: React.ReactNode; onClick: () => void; color: string; bg: string; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{ background: bg, color, padding: '7px 12px', borderRadius: 8, fontSize: 12, fontWeight: 800, border: 'none', cursor: disabled ? 'wait' : 'pointer' }}>{children}</button>
  )
}

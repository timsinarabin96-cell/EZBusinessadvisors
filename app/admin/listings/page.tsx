/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

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
  riskScore?: number
  riskLevel?: string
  riskReasons?: string[]
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
  const [scanning, setScanning] = useState(false)
  const [reviewTarget, setReviewTarget] = useState<ListingRow | null>(null)
  const [reviewReport, setReviewReport] = useState<any | null>(null)
  const [reviewLoading, setReviewLoading] = useState(false)
  const [verifyTarget, setVerifyTarget] = useState<ListingRow | null>(null)
  const [verifyReport, setVerifyReport] = useState<any | null>(null)
  const [verifyLoading, setVerifyLoading] = useState(false)
  const [unlocking, setUnlocking] = useState(false)

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

  const aiVerify = async (l: ListingRow) => {
    setVerifyTarget(l)
    setVerifyReport(null)
    setVerifyLoading(true)
    try {
      const res = await authenticatedFetch('/api/admin/verify-unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingId: l.id, action: 'verify' }),
      })
      const j = await res.json()
      if (!res.ok || !j.ok) throw new Error(j.error || 'Verification failed')
      setVerifyReport(j.report)
    } catch (e: any) {
      setVerifyReport({ error: e.message || 'Verification failed' })
    } finally {
      setVerifyLoading(false)
    }
  }

  const aiUnlock = async (l: ListingRow) => {
    if (!confirm(`Grant ALL unlocks for "${l.business_name}"?\n\n✅ Verified Revenue badge\n⭐ Featured placement\n💰 Financial Intelligence add-on\n\n(Admin-granted — use for demos/partners, or the Stripe webhook handles paid unlocks.)`)) return
    setUnlocking(true)
    try {
      const res = await authenticatedFetch('/api/admin/verify-unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingId: l.id, action: 'unlock' }),
      })
      const j = await res.json()
      if (!res.ok || !j.ok) throw new Error(j.error || 'Unlock failed')
      toast(`Unlocked: ${j.granted.join(', ')} ✅`, 'success')
      setVerifyTarget(null)
      load()
    } catch (e: any) {
      toast(e.message || 'Unlock failed', 'error')
    } finally {
      setUnlocking(false)
    }
  }

  const exportCSV = () => {
    if (!listings.length) return
    const rows = listings.map((l) => ({ business_name: l.business_name || '', status: l.status, review_stage: l.review_stage || '', flagged: l.flagged, agency: l.agency_name, owner: l.owner_name, owner_email: l.owner_email, asking_price: l.asking_price ?? '', annual_revenue: l.annual_revenue ?? '', sde: l.sde ?? '', created_at: l.created_at || '', moderation_reason: l.moderation_reason || '' }))
    const headers = Object.keys(rows[0])
    const csv = [headers.join(','), ...rows.map((r) => headers.map((h) => `"${String((r as any)[h] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = 'listings-moderation.csv'
    a.click()
  }

  const riskStyle = (level: string) =>
    level === 'critical' ? { bg: '#ef44441a', color: '#b91c1c' }
    : level === 'high' ? { bg: '#f973161a', color: '#c2410c' }
    : level === 'medium' ? { bg: '#f59e0b1a', color: '#b45309' }
    : { bg: '#22c55e1a', color: '#15803d' }

  const aiScan = async () => {
    if (!confirm('Run AI risk scan across all listings? Critical-risk listings get auto-flagged for review.')) return
    setScanning(true)
    try {
      const res = await authenticatedFetch('/api/admin/listings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'ai_scan' }),
      })
      const j = await res.json()
      if (j.ok) toast(`Scan done — ${j.autoFlagged} auto-flagged of ${j.scanned} 🚩`, 'success')
      else toast(j.error || 'Scan failed', 'error')
      load()
    } finally { setScanning(false) }
  }

  const aiReview = async (l: ListingRow) => {
    setReviewTarget(l)
    setReviewReport(null)
    setReviewLoading(true)
    try {
      const res = await authenticatedFetch('/api/admin/listings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'ai_review', id: l.id }),
      })
      const j = await res.json()
      if (j.ok) setReviewReport(j)
      else toast(j.error || 'Review failed', 'error')
    } catch { toast('Review failed', 'error') } finally { setReviewLoading(false) }
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
        <button onClick={exportCSV} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #d8d2c2', background: '#fff', color: '#334155', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>⬇️ CSV</button>
        <button onClick={aiScan} disabled={scanning} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: '#7c3aed', color: '#fff', fontSize: 12.5, fontWeight: 800, cursor: scanning ? 'wait' : 'pointer' }}>🤖 {scanning ? 'Scanning…' : 'AI Scan & Flag'}</button>
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
                  {(l.riskScore ?? 0) >= 30 && (
                    <span style={{ background: riskStyle(l.riskLevel).bg, color: riskStyle(l.riskLevel).color, padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 800 }}>🤖 {l.riskScore}/100 {l.riskLevel.toUpperCase()}</span>
                  )}
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
                <ActionBtn color="#7c3aed" bg="#f5f3ff" disabled={busy === l.id} onClick={() => aiReview(l)}>🤖 AI Review</ActionBtn>
                <ActionBtn color="#0e7490" bg="#e6f6fa" disabled={busy === l.id} onClick={() => aiVerify(l)}>🔍 AI Verify</ActionBtn>
              </div>
            </div>
          )
        })}
      </div>

      {/* AI verify & unlock modal (pricing/trust stack) */}
      {verifyTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)', display: 'grid', placeItems: 'center', zIndex: 50, padding: 24 }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 28, maxWidth: 620, width: '100%', maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 30 }}>🔍</div>
                <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 20, color: '#1a1a2e', margin: '6px 0 2px' }}>{verifyTarget.business_name || 'Untitled business'}</h2>
                <div style={{ color: '#888', fontSize: 13 }}>{verifyTarget.agency_name} · {money(verifyTarget.asking_price)} asking</div>
              </div>
              <button onClick={() => setVerifyTarget(null)} style={{ background: 'none', border: 'none', fontSize: 22, color: '#94a3b8', cursor: 'pointer' }}>✕</button>
            </div>

            {verifyLoading ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#64748b', fontSize: 14 }}>Running the full verification stack… (extraction, bank-vs-books, seller interview)</div>
            ) : verifyReport?.error ? (
              <div style={{ color: '#b91c1c', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: 14, fontSize: 13.5 }}>{verifyReport.error}</div>
            ) : verifyReport ? (
              <div>
                {/* Overall verdict */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
                  <span style={{ fontSize: 15, fontWeight: 800, color: verifyReport.overall === 'ready' ? '#15803d' : verifyReport.overall === 'extracted_unreviewed' ? '#b45309' : '#b91c1c', background: verifyReport.overall === 'ready' ? '#e8f7ee' : verifyReport.overall === 'extracted_unreviewed' ? '#fdf3e3' : '#fdeaea', padding: '7px 16px', borderRadius: 99, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                    {verifyReport.overall === 'ready' ? '✅ Ready to unlock' : verifyReport.overall === 'extracted_unreviewed' ? '⚠️ Extracted, unreviewed' : '📄 No financials yet'}
                  </span>
                  {verifyReport.avgConfidence != null && <span style={{ fontSize: 13, color: '#64748b' }}>Avg confidence {verifyReport.avgConfidence}%</span>}
                </div>

                {/* Stack metrics */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 18 }}>
                  <VStat label="Documents" value={String(verifyReport.documents)} sub={`${verifyReport.sellerUploads} by seller`} />
                  <VStat label="AI extractions" value={String(verifyReport.extractions)} sub={`${verifyReport.reviewedExtractions} reviewed`} />
                  <VStat label="Seller interview" value={verifyReport.sellerInterview ? `${verifyReport.sellerInterview} answers` : 'none'} sub="attestation" />
                  {verifyReport.bankBooks && (
                    <VStat
                      label="Bank vs books"
                      value={verifyReport.bankBooks.status === 'verified' ? '✅ match' : verifyReport.bankBooks.status === 'review' ? '⚠️ gap' : 'no bank docs'}
                      sub={verifyReport.bankBooks.variancePct != null ? `${verifyReport.bankBooks.variancePct}% variance` : '—'}
                      color={verifyReport.bankBooks.status === 'verified' ? '#15803d' : verifyReport.bankBooks.status === 'review' ? '#b45309' : '#64748b'}
                    />
                  )}
                </div>

                <div style={{ fontSize: 12.5, color: '#64748b', background: '#f8fafc', border: '1px solid var(--line)', borderRadius: 10, padding: '10px 14px', lineHeight: 1.6, marginBottom: 18 }}>
                  Unlock grants: <b>✅ Verified Revenue badge</b> (public trust layer) · <b>⭐ Featured placement</b> (top of marketplace) · <b>💰 Financial Intelligence</b> (per-agency add-on).
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    onClick={() => aiUnlock(verifyTarget)}
                    disabled={unlocking}
                    style={{ flex: 1, padding: '12px 0', borderRadius: 8, border: 'none', background: '#15803d', color: '#fff', fontWeight: 800, fontSize: 13.5, cursor: unlocking ? 'wait' : 'pointer' }}
                  >
                    {unlocking ? 'Unlocking…' : '✅ Unlock all (admin grant)'}
                  </button>
                  <button onClick={() => setVerifyTarget(null)} style={{ padding: '12px 18px', borderRadius: 8, border: '1px solid var(--line)', background: '#fff', color: '#64748b', fontWeight: 700, fontSize: 13.5, cursor: 'pointer' }}>Close</button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* AI review modal */}
      {reviewTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)', display: 'grid', placeItems: 'center', zIndex: 50, padding: 24 }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 28, maxWidth: 620, width: '100%', maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 30 }}>🤖</div>
                <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 20, color: '#1a1a2e', margin: '6px 0 2px' }}>{reviewTarget.business_name || 'Untitled business'}</h2>
                <div style={{ color: '#888', fontSize: 13 }}>{reviewTarget.agency_name} · {money(reviewTarget.asking_price)} asking</div>
              </div>
              <button onClick={() => setReviewTarget(null)} style={{ background: 'none', border: 'none', fontSize: 22, color: '#94a3b8', cursor: 'pointer' }}>✕</button>
            </div>

            {reviewLoading ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#64748b', fontSize: 14 }}>Analyzing listing…</div>
            ) : reviewReport ? (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                  <span style={{ fontSize: 26, fontWeight: 800, color: riskStyle(reviewReport.risk.level).color }}>{reviewReport.risk.score}/100</span>
                  <span style={{ background: riskStyle(reviewReport.risk.level).bg, color: riskStyle(reviewReport.risk.level).color, padding: '5px 14px', borderRadius: 99, fontSize: 12, fontWeight: 800, textTransform: 'uppercase' }}>{reviewReport.risk.level} risk</span>
                  {reviewReport.ai?.data?.score != null && <span style={{ fontSize: 12, color: '#888' }}>AI model: {reviewReport.ai.data.score}/100</span>}
                </div>

                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontWeight: 800, fontSize: 13, color: '#1a1a2e', marginBottom: 8 }}>Signals detected</div>
                  {reviewReport.risk.reasons.length === 0 ? (
                    <div style={{ color: '#64748b', fontSize: 13 }}>No deterministic red flags — looks clean.</div>
                  ) : (
                    reviewReport.risk.reasons.map((r: string, i: number) => (
                      <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '6px 0', borderBottom: '1px solid #f1f5f9', fontSize: 13, color: '#334155' }}>
                        <span style={{ color: '#b45309' }}>⚠️</span>{r}
                      </div>
                    ))
                  )}
                </div>

                {reviewReport.ai?.data?.summary && (
                  <div style={{ marginBottom: 16, background: '#f5f3ff', border: '1px solid #ede9fe', borderRadius: 10, padding: '12px 14px', fontSize: 13, color: '#4c1d95' }}>
                    <b>AI summary:</b> {reviewReport.ai.data.summary}
                  </div>
                )}
                {reviewReport.ai?.error && <div style={{ color: '#b91c1c', fontSize: 13, marginBottom: 12 }}>AI deep-dive failed: {reviewReport.ai.error}</div>}
                {reviewReport.ai && !reviewReport.ai.available && <div style={{ color: '#888', fontSize: 12.5, marginBottom: 12 }}>AI deep-dive not configured (add DEEPSEEK_API_KEY for model analysis). Deterministic scan shown.</div>}

                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
                  <button onClick={() => setReviewTarget(null)} style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid #d8d2c2', background: '#fff', color: '#334155', fontWeight: 700, cursor: 'pointer' }}>Close</button>
                  {!reviewTarget.flagged && (
                    <button onClick={() => { act(reviewTarget.id, 'flag', `AI review ${reviewReport.risk.score}/100 — ${reviewReport.risk.reasons.slice(0, 2).join('; ')}`); setReviewTarget(null) }} style={{ padding: '10px 22px', borderRadius: 8, border: 'none', background: '#b91c1c', color: '#fff', fontWeight: 800, cursor: 'pointer' }}>🚩 Flag Listing</button>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}

function ActionBtn({ children, onClick, color, bg, disabled }: { children: React.ReactNode; onClick: () => void; color: string; bg: string; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{ background: bg, color, padding: '7px 12px', borderRadius: 8, fontSize: 12, fontWeight: 800, border: 'none', cursor: disabled ? 'wait' : 'pointer' }}>{children}</button>
  )
}

function VStat({ label, value, sub, color = '#1a1a2e' }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{ background: '#f8fafc', border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ fontSize: 10.5, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 800, color, marginTop: 3 }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

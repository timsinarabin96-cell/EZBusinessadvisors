/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

// ---------------------------------------------------------------------------
// DeliveryApprovalQueue — the single-tap approval gate for client-facing
// documents (CIM / BOV / recast). Nothing is emailed until the broker taps
// Approve here. Mobile-friendly: big touch targets, one action per tap.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import { LoadingState } from '@/components/ui'
import { ToastProvider, useToast } from '@/components/ui/Toast'
import { authenticatedFetch } from '@/lib/authenticatedFetch'
import { fetchUserAgencyContext } from '@/lib/agencies'

interface Delivery {
  id: string
  agency_id: string
  listing_id: string | null
  doc_kind: 'cim' | 'bov' | 'recast' | 'bli'
  doc_title: string | null
  recipient_name: string | null
  recipient_email: string
  recipient_role: string
  status: string
  reject_reason: string | null
  share_url: string | null
  email_status: string | null
  created_at: string | null
}

const KIND_META: Record<string, { label: string; icon: string; hint: string }> = {
  cim: { label: 'CIM', icon: '📑', hint: 'Confidential Information Memorandum' },
  bov: { label: 'BOV', icon: '⚖️', hint: 'Broker Opinion of Value' },
  recast: { label: 'Recast', icon: '📊', hint: 'Normalized Earnings Report' },
  bli: { label: 'BLI', icon: '📄', hint: 'Business Listing Information' },
}

export default function DeliveryApprovalQueue() {
  const toast = useToast()
  const [agencyId, setAgencyId] = useState<string | null>(null)
  const [pending, setPending] = useState<Delivery[]>([])
  const [history, setHistory] = useState<Delivery[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [rejecting, setRejecting] = useState<Delivery | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  const load = useCallback(async () => {
    try {
      const ctx = await fetchUserAgencyContext()
      if (!ctx.agency) { setLoading(false); return }
      setAgencyId(ctx.agency.id)
      const [p, h] = await Promise.all([
        authenticatedFetch(`/api/documents/deliver?agencyId=${encodeURIComponent(ctx.agency.id)}&status=pending_approval`),
        authenticatedFetch(`/api/documents/deliver?agencyId=${encodeURIComponent(ctx.agency.id)}`),
      ])
      const pj = await p.json()
      const hj = await h.json()
      setPending((pj.deliveries || []).filter((d: Delivery) => d.status === 'pending_approval'))
      setHistory((hj.deliveries || []).filter((d: Delivery) => d.status !== 'pending_approval').slice(0, 20))
    } catch { /* degrade */ } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const decide = async (delivery: Delivery, action: 'approve' | 'reject') => {
    if (!agencyId) return
    setBusy(delivery.id)
    try {
      const res = await authenticatedFetch(`/api/documents/deliveries/${delivery.id}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agencyId, action, reason: action === 'reject' ? rejectReason : undefined }),
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error || 'Decision failed')
      toast(action === 'approve' ? `Sent — ${delivery.doc_title || 'deliverable'} is on its way.` : 'Rejected — nothing was sent.', action === 'approve' ? 'success' : 'info')
      setRejecting(null)
      setRejectReason('')
      await load()
    } catch (e: any) {
      toast(e.message || 'Decision failed', 'error')
    } finally { setBusy(null) }
  }

  if (loading) return <LoadingState label="Loading approval queue..." />

  return (
    <AppShell active="Approvals">
      <ToastProvider>
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '20px 18px 60px' }}>
          <h1 style={{ fontSize: 24, margin: '0 0 4px' }}>🗂️ Delivery Approvals</h1>
          <p style={{ color: 'var(--muted)', fontSize: 14, margin: '0 0 20px' }}>
            Nothing goes out under your license until you tap Approve. One tap = the send fires (email + Deal Room + secure link).
          </p>

          {/* Pending queue */}
          <h2 style={{ fontSize: 15, margin: '0 0 10px' }}>Awaiting your approval ({pending.length})</h2>
          {pending.length === 0 && (
            <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 22, textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>
              ✅ No pending deliveries. Queue is clear.
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 28 }}>
            {pending.map((d) => {
              const meta = KIND_META[d.doc_kind] || KIND_META.bli
              return (
                <div key={d.id} style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{ fontSize: 26 }}>{meta.icon}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 800, fontSize: 15 }}>{d.doc_title || meta.label}</div>
                      <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>
                        {meta.hint} · to <strong>{d.recipient_name || d.recipient_email}</strong> ({d.recipient_role})
                      </div>
                      {d.created_at && (
                        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                          Requested {new Date(d.created_at).toLocaleString()}
                        </div>
                      )}
                    </div>
                  </div>

                  {rejecting?.id === d.id ? (
                    <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <input
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        placeholder="Reason (visible to your team, not the recipient)"
                        style={{ padding: '10px 12px', borderRadius: 9, border: '1px solid var(--line)', fontSize: 13.5 }}
                      />
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          onClick={() => decide(d, 'reject')}
                          disabled={busy === d.id}
                          style={{ flex: 1, padding: '12px', borderRadius: 10, background: '#b91c1c', color: '#fff', border: 'none', fontWeight: 800, fontSize: 14, cursor: 'pointer' }}
                        >
                          {busy === d.id ? 'Rejecting…' : 'Reject — send nothing'}
                        </button>
                        <button
                          onClick={() => { setRejecting(null); setRejectReason('') }}
                          style={{ padding: '12px 16px', borderRadius: 10, background: 'transparent', border: '1px solid var(--line)', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
                        >
                          Back
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => decide(d, 'approve')}
                        disabled={busy === d.id}
                        style={{ flex: 1, padding: '14px', borderRadius: 10, background: 'var(--gold)', color: 'var(--navy)', border: 'none', fontWeight: 800, fontSize: 15, cursor: busy === d.id ? 'wait' : 'pointer' }}
                      >
                        {busy === d.id ? 'Sending…' : '✓ Approve & Send'}
                      </button>
                      <button
                        onClick={() => { setRejecting(d); setRejectReason('') }}
                        disabled={busy === d.id}
                        style={{ padding: '14px 18px', borderRadius: 10, background: 'transparent', border: '1px solid var(--line)', color: '#b91c1c', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
                      >
                        ✕ Reject
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* History */}
          <h2 style={{ fontSize: 15, margin: '0 0 10px' }}>Recent activity</h2>
          {history.length === 0 && <div style={{ color: 'var(--muted)', fontSize: 13 }}>No sent or rejected deliveries yet.</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {history.map((d) => (
              <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, background: '#fff', border: '1px solid var(--line)', borderRadius: 10, padding: '10px 14px', fontSize: 13 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700 }}>{d.doc_title || KIND_META[d.doc_kind]?.label}</div>
                  <div style={{ color: 'var(--muted)', fontSize: 12 }}>
                    {d.recipient_name || d.recipient_email} · {d.created_at ? new Date(d.created_at).toLocaleDateString() : ''}
                    {d.share_url ? ' · link sent' : ''}
                  </div>
                </div>
                <span style={{ fontSize: 11.5, fontWeight: 800, textTransform: 'uppercase', padding: '3px 9px', borderRadius: 99, background: d.status === 'sent' ? '#e6f4ea' : '#fef3e0', color: d.status === 'sent' ? '#1e7e34' : '#9a6a00' }}>
                  {d.status === 'sent' ? 'Sent' : d.status === 'failed' ? 'Failed' : 'Rejected'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </ToastProvider>
    </AppShell>
  )
}

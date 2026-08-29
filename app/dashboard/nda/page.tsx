/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useCallback, useEffect, useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import { LoadingState, EmptyState, Card, Badge } from '@/components/ui'
import { ToastProvider, useToast } from '@/components/ui/Toast'
import { getStoredAccessToken } from '@/lib/authToken'

interface NdaDoc {
  id: string
  title: string
  status: string
  business_name: string | null
  listing_id: string | null
  deal_id: string | null
  buyer_name: string | null
  buyer_email: string | null
  created_at: string
  updated_at: string
  buyer_signed: boolean
  broker_signed: boolean
  fully_signed: boolean
  signers: Array<{ party_key: string; party_name: string | null; status: string; signed_at: string | null }>
}

const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

export default function NdaPage() {
  return (
    <AppShell active="NDAs">
      <ToastProvider>
        <div style={{ maxWidth: 1080, margin: '0 auto', padding: '24px 20px 60px' }}>
          <NdaBoard />
        </div>
      </ToastProvider>
    </AppShell>
  )
}

function NdaBoard() {
  const toast = useToast()
  const [ndas, setNdas] = useState<NdaDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'awaiting' | 'signed'>('all')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const token = getStoredAccessToken()
      const res = await fetch('/api/nda/list', { headers: { authorization: `Bearer ${token}` } })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.ok) throw new Error(j.error || 'Could not load NDAs')
      setNdas(j.ndas || [])
    } catch (e: any) {
      toast(e.message, 'error')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { load() }, [load])

  const counterSign = async (d: NdaDoc) => {
    setBusy(d.id)
    try {
      const token = getStoredAccessToken()
      const res = await fetch('/api/nda/counter-sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ documentId: d.id }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.ok) throw new Error(j.error || 'Could not sign')
      toast(j.allSigned ? '✅ NDA fully signed — stored under the deal.' : 'Signature recorded.', 'success')
      await load()
    } catch (e: any) {
      toast(e.message, 'error')
    } finally {
      setBusy(null)
    }
  }

  const visible = ndas.filter((d) => {
    if (filter === 'awaiting') return !d.fully_signed
    if (filter === 'signed') return d.fully_signed
    return true
  })

  const awaiting = ndas.filter((d) => !d.fully_signed).length
  const signed = ndas.filter((d) => d.fully_signed).length

  return (
    <div>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26 }}>🤝 NDAs</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: 14 }}>
            {ndas.length} total · {awaiting} awaiting signature · {signed} signed — one click sends an NDA from any buyer lead
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <FilterPill active={filter === 'all'} onClick={() => setFilter('all')}>All ({ndas.length})</FilterPill>
          <FilterPill active={filter === 'awaiting'} onClick={() => setFilter('awaiting')}>⏳ Awaiting ({awaiting})</FilterPill>
          <FilterPill active={filter === 'signed'} onClick={() => setFilter('signed')}>✅ Signed ({signed})</FilterPill>
        </div>
      </header>

      {loading ? <LoadingState /> : null}

      {!loading && visible.length === 0 ? (
        <EmptyState
          icon="🛡️"
          title="No NDAs yet"
          subtitle="Open any buyer lead and hit “Send NDA” — the buyer signs by email, then you approve here."
        />
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {!loading && visible.map((d) => {
            const buyerDone = d.buyer_signed
            const brokerDone = d.broker_signed
            const step = d.fully_signed ? 3 : buyerDone ? 2 : 1
            return (
              <Card key={d.id} style={{ padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 220, flex: 1 }}>
                    <div style={{ fontWeight: 700, color: 'var(--navy)', fontSize: 15 }}>{d.business_name || d.title}</div>
                    <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 3 }}>
                      {d.buyer_name || 'Buyer'}{d.buyer_email ? ` · ${d.buyer_email}` : ''}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Sent {fmtDate(d.created_at)}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <Badge color={d.fully_signed ? '#22c55e' : buyerDone ? '#f59e0b' : '#3b82f6'}>
                      {d.fully_signed ? '✅ Fully signed' : buyerDone ? '⏳ Buyer signed — awaiting you' : '📨 Sent to buyer'}
                    </Badge>
                    {!d.fully_signed && (
                      <button
                        onClick={() => counterSign(d)}
                        disabled={busy === d.id || !buyerDone}
                        title={!buyerDone ? 'Waiting for the buyer to sign first' : 'Record your signature — completes the NDA'}
                        style={{
                          padding: '9px 18px', borderRadius: 8, border: 'none', cursor: !buyerDone || busy === d.id ? 'not-allowed' : 'pointer',
                          background: buyerDone ? '#1a1a2e' : '#e2e8f0', color: buyerDone ? '#c9a84c' : '#94a3b8', fontWeight: 800, fontSize: 13.5,
                        }}
                      >
                        {busy === d.id ? 'Signing…' : buyerDone ? '✍️ Sign & approve' : 'Awaiting buyer'}
                      </button>
                    )}
                  </div>
                </div>
                {/* Progress steps */}
                <div style={{ display: 'flex', gap: 8, marginTop: 14, alignItems: 'center' }}>
                  <Step done={step >= 1} label="Sent to buyer" />
                  <Line active={step >= 2} />
                  <Step done={step >= 2} label="Buyer signed" />
                  <Line active={step >= 3} />
                  <Step done={step >= 3} label="Broker approved" />
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

function FilterPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '7px 14px', borderRadius: 999, border: active ? '1px solid var(--navy)' : '1px solid #d8d2c2',
        background: active ? 'var(--navy)' : '#fff', color: active ? '#c9a84c' : '#1a1a2e',
        fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
      }}
    >
      {children}
    </button>
  )
}

function Step({ done, label }: { done: boolean; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: done ? '#15803d' : '#94a3b8', fontWeight: done ? 700 : 500 }}>
      <span style={{ width: 18, height: 18, borderRadius: '50%', background: done ? '#22c55e' : '#e2e8f0', color: done ? '#fff' : '#94a3b8', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10.5 }}>
        {done ? '✓' : '·'}
      </span>
      {label}
    </div>
  )
}

function Line({ active }: { active: boolean }) {
  return <div style={{ flex: 1, maxWidth: 60, height: 2, background: active ? '#22c55e' : '#e2e8f0', borderRadius: 2 }} />
}

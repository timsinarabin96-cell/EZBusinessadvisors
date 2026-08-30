/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useCallback, useEffect, useState } from 'react'
import { authenticatedFetch } from '@/lib/authenticatedFetch'
import { useToast } from '@/components/ui/Toast'
import {
  SYNDICATION_PROVIDERS,
  providerLabel,
  fetchListingSyncs,
  updateSyncStatus,
  type ListingSyncRow,
} from '@/lib/syndicationEngine'

// =============================================================================
// SyndicationPanel — one-click marketplace push with per-source status.
// Lives in Step 8 (List Business). Push records a pending row + ready-to-paste
// payload per provider; the broker marks each synced once posted (or removed).
// =============================================================================

const STATUS_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: '⏳ Pending', color: '#b45309', bg: '#fdf3e3' },
  synced: { label: '✅ Synced', color: '#15803d', bg: '#e8f7ee' },
  failed: { label: '❌ Failed', color: '#dc2626', bg: '#fdeaea' },
  removed: { label: '🗑 Removed', color: '#64748b', bg: '#f1f5f9' },
}

export default function SyndicationPanel({ listingId }: { listingId: string }) {
  const toast = useToast()
  const [syncs, setSyncs] = useState<ListingSyncRow[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [openPayload, setOpenPayload] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set(SYNDICATION_PROVIDERS.map((p) => p.id)))

  const load = useCallback(async () => {
    setSyncs(await fetchListingSyncs(listingId))
  }, [listingId])

  useEffect(() => { load() }, [load])

  // Latest status per provider (oldest row wins — first in desc order).
  const statusByProvider: Record<string, ListingSyncRow> = {}
  for (const s of syncs) {
    if (!(s.provider in statusByProvider)) statusByProvider[s.provider] = s
  }

  const push = async () => {
    const providers = [...selected]
    if (providers.length === 0) { toast('Pick at least one marketplace', 'error'); return }
    setBusy('push')
    try {
      const res = await authenticatedFetch('/api/listings/syndication', {
        method: 'POST',
        headers: { 'content-type': 'application/json',  },
        body: JSON.stringify({ listingId, providers }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.ok) throw new Error(j.error || 'Push failed')
      toast(`Queued for ${providers.length} marketplace(s)`, 'success')
      await load()
    } catch (e: any) {
      toast(e.message, 'error')
    } finally {
      setBusy(null)
    }
  }

  const setStatus = async (id: string, action: 'synced' | 'removed') => {
    setBusy(id)
    try {
      const r = await updateSyncStatus(id, action)
      if (!r.ok) throw new Error(r.error || 'Update failed')
      toast(action === 'synced' ? 'Marked as posted' : 'Removed from tracking', 'success')
      await load()
    } catch (e: any) {
      toast(e.message, 'error')
    } finally {
      setBusy(null)
    }
  }

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  return (
    <div style={{ marginTop: 16, border: '1px solid var(--line)', borderRadius: 12, padding: 16, background: 'var(--paper)' }}>
      <div className="section-title" style={{ marginBottom: 4 }}>📡 Syndication</div>
      <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '0 0 12px' }}>
        Push the listing to marketplaces. Each source gets a status row with a ready-to-paste payload — mark it <strong>synced</strong> once posted.
      </p>

      {/* Provider picker */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {SYNDICATION_PROVIDERS.map((p) => (
          <button
            key={p.id}
            onClick={() => toggle(p.id)}
            title={p.hint}
            style={{
              padding: '7px 13px', borderRadius: 999, cursor: 'pointer', fontSize: 12.5, fontWeight: 700,
              border: selected.has(p.id) ? '2px solid var(--gold-dark)' : '1px solid var(--line)',
              background: selected.has(p.id) ? 'rgba(201,168,76,0.15)' : '#fff',
              color: selected.has(p.id) ? 'var(--gold-dark)' : 'var(--muted)',
            }}
          >
            {p.label}
          </button>
        ))}
        <button className="btn btn-navy" onClick={push} disabled={busy === 'push'} style={{ padding: '7px 16px', fontSize: 12.5, marginLeft: 'auto' }}>
          {busy === 'push' ? 'Pushing…' : '🚀 Push selected'}
        </button>
      </div>

      {/* Status rows */}
      {syncs.length === 0 ? (
        <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>No syndication yet — push to a marketplace above.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {syncs.slice(0, 12).map((s) => {
            const st = STATUS_STYLE[s.status] || STATUS_STYLE.pending
            return (
              <div key={s.id} style={{ border: '1px solid #eef1f4', borderRadius: 10, padding: '10px 12px', background: '#fff' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)' }}>{providerLabel(s.provider)}</span>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: st.color, background: st.bg, padding: '3px 10px', borderRadius: 999 }}>{st.label}</span>
                  <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 'auto' }}>
                    {s.last_sync_at ? new Date(s.last_sync_at).toLocaleString() : new Date(s.created_at).toLocaleString()}
                  </span>
                  {s.status === 'pending' && (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 11.5 }} onClick={() => setStatus(s.id, 'synced')} disabled={busy === s.id}>Mark posted</button>
                      <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 11.5 }} onClick={() => setStatus(s.id, 'removed')} disabled={busy === s.id}>Remove</button>
                    </div>
                  )}
                  <button
                    onClick={() => setOpenPayload(openPayload === s.id ? null : s.id)}
                    style={{ background: 'none', border: '1px solid var(--line)', borderRadius: 7, padding: '4px 10px', fontSize: 11.5, cursor: 'pointer', color: 'var(--navy)' }}
                  >
                    {openPayload === s.id ? 'Hide payload' : '📋 Payload'}
                  </button>
                </div>
                {openPayload === s.id && s.payload_json && (
                  <pre style={{ margin: '10px 0 0', padding: 12, background: '#0f172a', color: '#e2e8f0', borderRadius: 8, fontSize: 11.5, lineHeight: 1.5, overflowX: 'auto', whiteSpace: 'pre-wrap', maxHeight: 260, overflowY: 'auto' }}>
{JSON.stringify(s.payload_json, null, 2)}
                  </pre>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

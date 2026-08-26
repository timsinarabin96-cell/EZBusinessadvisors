/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

// =============================================================================
// /admin/ads — sponsored slot management (platform admin only).
// Small text-only "Sponsored" slots for business/finance advertisers
// (lenders, CPAs, insurers — recruit from your professional network).
// Tracks monthly fee (→ expenses), impressions, and clicks per slot.
// =============================================================================

import { useCallback, useEffect, useState } from 'react'
import { authenticatedFetch } from '@/lib/authenticatedFetch'
import { LoadingState } from '@/components/ui'
import { useToast } from '@/components/ui/Toast'

interface AdSlot {
  id: string
  slot_key: string
  advertiser: string
  body: string
  url: string
  badge: string
  starts_at: string
  ends_at: string | null
  active: boolean
  monthly_fee_cents: number
  impressions: number
  clicks: number
  notes: string | null
}

const EMPTY = {
  slot_key: '', advertiser: '', body: '', url: '',
  badge: 'Sponsored', starts_at: '', ends_at: '', active: true,
  monthly_fee_cents: 0, notes: '',
}

const SLOT_PLACEMENTS = [
  'marketplace_bottom',
  'marketplace_sidebar',
  'newspaper_top',
  'valuation_sidebar',
  'network_sidebar',
  'listing_detail_bottom',
]

export default function AdminAdsPage() {
  const toast = useToast()
  const [slots, setSlots] = useState<AdSlot[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await authenticatedFetch('/api/admin/ads')
      const j = await res.json()
      if (!res.ok || !j.ok) setError(j.error || 'Access denied — platform admin only.')
      else setSlots(j.slots || [])
    } catch {
      setError('Failed to load ad slots.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const save = async () => {
    if (!form.slot_key.trim() || !form.advertiser.trim() || !form.body.trim() || !form.url.trim()) {
      toast('Slot key, advertiser, body, and URL are required', 'error')
      return
    }
    const res = await authenticatedFetch('/api/admin/ads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, monthly_fee_cents: Math.round(Number(form.monthly_fee_cents) * 100) }),
    })
    const j = await res.json()
    if (!j.ok) { toast(j.error || 'Save failed', 'error'); return }
    toast('Slot saved', 'success')
    setShowForm(false)
    setForm(EMPTY)
    load()
  }

  const toggle = async (s: AdSlot) => {
    const res = await authenticatedFetch('/api/admin/ads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slot_key: s.slot_key, advertiser: s.advertiser, body: s.body, url: s.url,
        badge: s.badge, starts_at: s.starts_at, ends_at: s.ends_at, active: !s.active,
        monthly_fee_cents: s.monthly_fee_cents, notes: s.notes,
      }),
    })
    const j = await res.json()
    if (!j.ok) { toast(j.error || 'Toggle failed', 'error'); return }
    load()
  }

  const remove = async (id: string) => {
    if (!confirm('Remove this slot?')) return
    const res = await authenticatedFetch(`/api/admin/ads?id=${id}`, { method: 'DELETE' })
    const j = await res.json()
    if (!j.ok) { toast(j.error || 'Delete failed', 'error'); return }
    toast('Removed', 'success')
    load()
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#1a1a2e' }}>📣 Sponsored Slots</div>
          <div style={{ color: '#888', fontSize: 13, marginTop: 4 }}>
            Small text-only ads for business/finance advertisers. FTC-safe with a visible "Sponsored" label.
          </div>
        </div>
        <button onClick={() => { setShowForm(!showForm); setForm(EMPTY) }} style={{ background: '#1a1a2e', color: '#fff', border: 'none', padding: '10px 18px', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
          {showForm ? 'Cancel' : '+ New Slot'}
        </button>
      </div>

      {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '14px 18px', borderRadius: 10, marginBottom: 16 }}>{error}</div>}

      {showForm && (
        <div style={{ background: '#fff', border: '1px solid #ece8dc', borderRadius: 14, padding: '20px 24px', marginBottom: 20 }}>
          <div style={{ fontWeight: 800, color: '#1a1a2e', marginBottom: 14 }}>New / edit slot</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <select value={form.slot_key} onChange={(e) => setForm({ ...form, slot_key: e.target.value })} style={inputStyle}>
              <option value="">Placement…</option>
              {SLOT_PLACEMENTS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <input placeholder="Advertiser (e.g. ABC Funding)" value={form.advertiser} onChange={(e) => setForm({ ...form, advertiser: e.target.value })} style={inputStyle} />
            <input placeholder="One-line pitch" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} style={{ ...inputStyle, gridColumn: '1 / -1' }} />
            <input placeholder="Destination URL (https://…)" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} style={{ ...inputStyle, gridColumn: '1 / -1' }} />
            <input placeholder="Monthly fee ($)" type="number" value={form.monthly_fee_cents ? String(Number(form.monthly_fee_cents) / 100) : ''} onChange={(e) => setForm({ ...form, monthly_fee_cents: Math.round(parseFloat(e.target.value) * 100) })} style={inputStyle} />
            <input placeholder="Starts (YYYY-MM-DD)" value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} style={inputStyle} />
            <input placeholder="Ends (YYYY-MM-DD, optional)" value={form.ends_at || ''} onChange={(e) => setForm({ ...form, ends_at: e.target.value })} style={inputStyle} />
            <input placeholder="Notes (contact, deal terms…)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} style={{ ...inputStyle, gridColumn: '1 / -1' }} />
          </div>
          <div style={{ marginTop: 12, display: 'flex', gap: 16, alignItems: 'center' }}>
            <label style={{ fontSize: 13, color: '#555', display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Active
            </label>
            <button onClick={save} style={{ background: '#1a1a2e', color: '#fff', border: 'none', padding: '10px 22px', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Save Slot</button>
          </div>
        </div>
      )}

      {loading ? (
        <LoadingState />
      ) : slots.length === 0 ? (
        <div style={{ background: '#fff', border: '1px dashed #d8d2c4', borderRadius: 14, padding: '40px', textAlign: 'center', color: '#888', fontSize: 14 }}>
          No slots yet. Create your first one — or reach out to a lender/CPA/insurer from your professional network and sell them a slot.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {slots.map((s) => (
            <div key={s.id} style={{ background: '#fff', border: '1px solid #ece8dc', borderRadius: 12, padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ minWidth: 260, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: 'monospace', fontSize: 12, background: '#f4f1e8', padding: '3px 8px', borderRadius: 6, color: '#64748b' }}>{s.slot_key}</span>
                  <span style={{ fontWeight: 800, color: '#1a1a2e', fontSize: 14 }}>{s.advertiser}</span>
                  {!s.active && <span style={{ fontSize: 11, fontWeight: 700, color: '#b45309', background: '#fffbeb', padding: '2px 8px', borderRadius: 999 }}>inactive</span>}
                </div>
                <div style={{ fontSize: 13, color: '#666', marginTop: 4 }}>{s.body}</div>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                  {s.url} · {s.badge} · {s.starts_at}{s.ends_at ? ` → ${s.ends_at}` : ' (no end)'}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 12, color: '#888' }}>
                <span title="Monthly fee">💰 ${(s.monthly_fee_cents / 100).toFixed(0)}/mo</span>
                <span title="Impressions">👁 {s.impressions}</span>
                <span title="Clicks">🖱 {s.clicks}</span>
                <button onClick={() => toggle(s)} style={{ background: s.active ? '#fffbeb' : '#15803d', color: s.active ? '#b45309' : '#fff', border: '1px solid' + (s.active ? ' #fde68a' : ' #15803d'), padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                  {s.active ? 'Deactivate' : 'Activate'}
                </button>
                <button onClick={() => remove(s.id)} style={{ background: 'none', border: '1px solid #fecaca', color: '#b91c1c', padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Remove</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 24, fontSize: 12, color: '#aaa', lineHeight: 1.6 }}>
        💡 Sell slots directly to lenders, CPAs, and insurers from your professional network — no ad networks needed.
        Every ad carries a visible "Sponsored" label (FTC). Log the monthly fee here so it flows into your expenses/accounting.
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  padding: '10px 12px', borderRadius: 8, border: '1px solid #d8d2c4', fontSize: 13, fontFamily: 'inherit',
  width: '100%', boxSizing: 'border-box', background: '#fff',
}

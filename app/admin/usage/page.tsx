/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useToast } from '@/components/ui/Toast'
import { LoadingState } from '@/components/ui'
import { authenticatedFetch } from '@/lib/authenticatedFetch'

// =============================================================================
// /admin/usage — per-agency plan usage + limits + manual overrides.
// The boss (platform admin) sees every agency's plan, real usage vs limit,
// and can override limits per agency (e.g. grant a founding agency 10 listings
// without changing the tier for everyone else).
// =============================================================================

interface UsageRow {
  agency: { id: string; name: string; slug: string | null; planType: string; paid: boolean; trial: boolean }
  usage: { listings: number; agents: number; leads: number; deals: number }
  limits: { listings: number; agents: number; leads: number; deals: number }
  override: { maxListings: number | null; maxAgents: number | null; maxLeads: number | null; maxDeals: number | null } | null
}

const PLAN_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  free: { label: 'Free', color: '#64748b', bg: '#f1f5f9' },
  professional: { label: 'Professional', color: '#8a6d1a', bg: '#fdf6ec' },
  enterprise: { label: 'Enterprise', color: '#1d4ed8', bg: '#eef2f9' },
  license: { label: 'White-Label', color: '#1e7e34', bg: '#eef7f1' },
  founding: { label: 'Founding', color: '#6d28d9', bg: '#f3eefb' },
}

function UsageCell({ used, max, label }: { used: number; max: number; label: string }) {
  const over = max > 0 && used > max
  const pct = max > 0 ? Math.min(100, Math.round((used / max) * 100)) : used > 0 ? 100 : 0
  return (
    <div style={{ minWidth: 130 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontWeight: 800, color: over ? '#b91c1c' : '#1a1a2e' }}>{used}</span>
        <span style={{ color: '#94a3b8' }}>/</span>
        <span style={{ color: max > 0 ? '#475569' : '#94a3b8' }}>{max > 0 ? max : '∞'}</span>
        {over && <span style={{ fontSize: 11, fontWeight: 800, color: '#b91c1c' }}>OVER</span>}
      </div>
      <div style={{ width: 90, height: 5, background: '#f0ede2', borderRadius: 3, marginTop: 4, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: over ? '#dc2626' : pct >= 85 ? '#d97706' : '#c9a84c' }} />
      </div>
      <div style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 3 }}>{label}</div>
    </div>
  )
}

export default function AdminUsagePage() {
  const toast = useToast()
  const [rows, setRows] = useState<UsageRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<UsageRow | null>(null)
  const [form, setForm] = useState({ listings: '', agents: '', leads: '', deals: '' })
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await authenticatedFetch('/api/admin/usage')
      const j = await res.json()
      if (!res.ok || !j.ok) { setError(j.error || 'Access denied'); return }
      setRows(j.agencies || [])
    } catch { setError('Failed to load usage data.') } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const openEdit = (r: UsageRow) => {
    setEditing(r)
    setForm({
      listings: r.override?.maxListings != null ? String(r.override.maxListings) : '',
      agents: r.override?.maxAgents != null ? String(r.override.maxAgents) : '',
      leads: r.override?.maxLeads != null ? String(r.override.maxLeads) : '',
      deals: r.override?.maxDeals != null ? String(r.override.maxDeals) : '',
    })
  }

  const saveOverride = async () => {
    if (!editing) return
    setSaving(true)
    const body: Record<string, unknown> = { agencyId: editing.agency.id }
    if (form.listings !== '') body.maxListings = parseInt(form.listings, 10) || 0
    if (form.agents !== '') body.maxAgents = parseInt(form.agents, 10) || 0
    if (form.leads !== '') body.maxLeads = parseInt(form.leads, 10) || 0
    if (form.deals !== '') body.maxDeals = parseInt(form.deals, 10) || 0
    try {
      const res = await authenticatedFetch('/api/admin/usage', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const j = await res.json()
      if (j.ok) { toast('Override saved ✅', 'success'); setEditing(null); load() }
      else toast(j.error || 'Failed', 'error')
    } finally { setSaving(false) }
  }

  const clearOverride = async (r: UsageRow) => {
    if (!window.confirm(`Clear custom limits for "${r.agency.name}"? They revert to tier defaults.`)) return
    try {
      const res = await authenticatedFetch('/api/admin/usage', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agencyId: r.agency.id, clear: true }),
      })
      const j = await res.json()
      if (j.ok) { toast('Override cleared — tier defaults restored', 'success'); load() }
      else toast(j.error || 'Failed', 'error')
    } catch { toast('Network error', 'error') }
  }

  if (loading) return <LoadingState label="Loading usage..." />
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
        <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 30, color: '#1a1a2e', margin: '6px 0 0' }}>Usage & Limits</h1>
        <p style={{ color: '#888', fontSize: 14, margin: '6px 0 0' }}>
          Real usage vs plan limits per agency. Overrides grant custom limits to specific agencies (e.g. founding grants) without changing the tier for everyone.
        </p>
      </div>

      {rows.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center', color: '#999', border: '1px dashed #ddd', borderRadius: 12 }}>No agencies found.</div>
      )}

      <div style={{ display: 'grid', gap: 14 }}>
        {rows.map((r) => {
          const badge = PLAN_BADGE[r.agency.planType] || PLAN_BADGE.free
          const anyOverride = r.override && Object.values(r.override).some((v) => v != null)
          return (
            <div key={r.agency.id} style={{ background: '#fff', border: '1px solid #ece8dc', borderRadius: 14, padding: '18px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 15, color: '#1a1a2e' }}>{r.agency.name}</div>
                  <span style={{ fontSize: 11, fontWeight: 800, color: badge.color, background: badge.bg, padding: '3px 10px', borderRadius: 999 }}>{badge.label}</span>
                  {r.agency.paid && <span style={{ fontSize: 11, fontWeight: 800, color: '#1e7e34', background: '#eef7f1', padding: '3px 10px', borderRadius: 999 }}>PAID</span>}
                  {r.agency.trial && <span style={{ fontSize: 11, fontWeight: 800, color: '#8a6d1a', background: '#fdf6ec', padding: '3px 10px', borderRadius: 999 }}>TRIAL</span>}
                  {anyOverride && <span style={{ fontSize: 11, fontWeight: 800, color: '#6d28d9', background: '#f3eefb', padding: '3px 10px', borderRadius: 999 }}>✏️ OVERRIDE</span>}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => openEdit(r)} style={{ background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
                    {anyOverride ? 'Edit Override' : 'Override Limits'}
                  </button>
                  {anyOverride && (
                    <button onClick={() => clearOverride(r)} style={{ background: '#fff', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 8, padding: '7px 14px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
                      Clear
                    </button>
                  )}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14 }}>
                <UsageCell used={r.usage.listings} max={r.limits.listings} label="Listings" />
                <UsageCell used={r.usage.agents} max={r.limits.agents} label="Team seats" />
                <UsageCell used={r.usage.leads} max={r.limits.leads} label="Leads" />
                <UsageCell used={r.usage.deals} max={r.limits.deals} label="Deals" />
              </div>
            </div>
          )
        })}
      </div>

      {/* Override modal */}
      {editing && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(26,26,46,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 14, maxWidth: 440, width: '100%', padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
              <div>
                <div style={{ fontSize: 17, fontWeight: 800, color: '#1a1a2e' }}>Override limits — {editing.agency.name}</div>
                <div style={{ fontSize: 12.5, color: '#888', marginTop: 4 }}>
                  Blank = use tier default. Set a number to override that limit for this agency only.
                </div>
              </div>
              <button onClick={() => setEditing(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#999' }}>✕</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 16 }}>
              {([['listings', 'Listings'], ['agents', 'Team seats'], ['leads', 'Leads'], ['deals', 'Deals']] as const).map(([key, label]) => (
                <label key={key} style={{ display: 'block' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 4 }}>{label}</div>
                  <input
                    type="number" min={0} value={form[key]}
                    onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                    placeholder={String(editing.limits[key])}
                    style={{ width: '100%', padding: '9px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14 }}
                  />
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={saveOverride} disabled={saving} style={{ flex: 1, background: saving ? '#999' : '#1a1a2e', color: '#fff', border: 'none', borderRadius: 10, padding: '12px', fontSize: 14, fontWeight: 800, cursor: 'pointer' }}>
                {saving ? 'Saving…' : 'Save Override'}
              </button>
              <button onClick={() => setEditing(null)} style={{ background: '#fff', border: '1px solid #ddd', borderRadius: 10, padding: '12px 18px', fontSize: 14, cursor: 'pointer' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

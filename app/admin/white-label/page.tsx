/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

// =============================================================================
// /admin/white-label — the "sell your own BizBuySell" control room.
// Platform admin assigns each brokerage its own brand (colors, fonts, logo,
// custom domain) and feed scope. The public marketplace then renders ONLY that
// agency's listings on its own domain with its own theme.
// =============================================================================

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { authenticatedFetch } from '@/lib/authenticatedFetch'
import { LoadingState } from '@/components/ui'
import { useToast } from '@/components/ui/Toast'

interface ThemeRow {
  agency_id: string
  custom_domain: string | null
  logo_url: string | null
  favicon_url: string | null
  primary_color: string
  secondary_color: string
  accent_color: string
  heading_font: string
  body_font: string
  hero_style: string
  listing_card_style: string
  business_model: string
  updated_at: string | null
}

interface AgencyRow {
  agency_id: string
  name: string
  slug: string | null
  domain: string | null
  custom_domain: string | null
  logo_url: string | null
  is_active: boolean
  theme: ThemeRow | null
}

const DEFAULT_THEME = {
  custom_domain: '', logo_url: '', favicon_url: '',
  primary_color: '#102a43', secondary_color: '#2563eb', accent_color: '#38bdf8',
  heading_font: 'system', body_font: 'system',
  hero_style: 'editorial', listing_card_style: 'intelligence', business_model: 'full_service_brokerage',
}

const FONT_OPTIONS = ['system', 'Georgia', 'Inter', 'Poppins', 'Merriweather', 'Open Sans', 'Lora', 'Playfair Display']
const HERO_STYLES = ['editorial', 'split', 'centered', 'minimal', 'showcase']
const CARD_STYLES = ['intelligence', 'classic', 'modern', 'minimal']
const BUSINESS_MODELS = ['full_service_brokerage', 'listings_only', 'marketplace', 'consulting']

export default function AdminWhiteLabelPage() {
  const toast = useToast()
  const [agencies, setAgencies] = useState<AgencyRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<AgencyRow | null>(null)
  const [form, setForm] = useState({ ...DEFAULT_THEME })
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await authenticatedFetch('/api/admin/white-label')
      const j = await res.json()
      if (!res.ok || !j.ok) setError(j.error || 'Access denied — platform admin only.')
      else setAgencies(j.agencies || [])
    } catch {
      setError('Failed to load agencies.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const open = (a: AgencyRow) => {
    setSelected(a)
    setForm({
      custom_domain: a.theme?.custom_domain ?? a.custom_domain ?? a.domain ?? '',
      logo_url: a.theme?.logo_url ?? a.logo_url ?? '',
      favicon_url: a.theme?.favicon_url ?? '',
      primary_color: a.theme?.primary_color ?? DEFAULT_THEME.primary_color,
      secondary_color: a.theme?.secondary_color ?? DEFAULT_THEME.secondary_color,
      accent_color: a.theme?.accent_color ?? DEFAULT_THEME.accent_color,
      heading_font: a.theme?.heading_font ?? 'system',
      body_font: a.theme?.body_font ?? 'system',
      hero_style: a.theme?.hero_style ?? 'editorial',
      listing_card_style: a.theme?.listing_card_style ?? 'intelligence',
      business_model: a.theme?.business_model ?? 'full_service_brokerage',
    })
  }

  const save = async () => {
    if (!selected) return
    setSaving(true)
    try {
      const res = await authenticatedFetch('/api/admin/white-label', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agencyId: selected.agency_id,
          custom_domain: form.custom_domain.trim() || null,
          logo_url: form.logo_url.trim() || null,
          favicon_url: form.favicon_url.trim() || null,
          primary_color: form.primary_color,
          secondary_color: form.secondary_color,
          accent_color: form.accent_color,
          heading_font: form.heading_font,
          body_font: form.body_font,
          hero_style: form.hero_style,
          listing_card_style: form.listing_card_style,
          business_model: form.business_model,
        }),
      })
      const j = await res.json()
      if (!j.ok) { toast(j.detail || j.error || 'Save failed', 'error'); return }
      toast('White-label theme saved', 'success')
      setSelected(null)
      load()
    } catch {
      toast('Save failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  const reset = async (a: AgencyRow) => {
    if (!confirm(`Reset ${a.name} back to default branding?`)) return
    const res = await authenticatedFetch(`/api/admin/white-label?action=reset&agencyId=${a.agency_id}`, { method: 'POST' })
    const j = await res.json()
    if (!j.ok) { toast(j.error || 'Reset failed', 'error'); return }
    toast('Theme reset to defaults', 'success')
    if (selected?.agency_id === a.agency_id) setSelected(null)
    load()
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #d8d2c2',
    fontSize: 13.5, background: '#fff', color: '#1a1a2e', boxSizing: 'border-box',
  }
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 700, color: '#64748b', margin: '14px 0 5px', textTransform: 'uppercase', letterSpacing: '.03em' }

  if (loading) return <LoadingState label="Loading agencies..." />
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
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 20px' }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#1a1a2e' }}>🏷️ White-Label Marketplaces</div>
        <div style={{ color: '#888', fontSize: 13, marginTop: 4 }}>
          Give each brokerage its own branded marketplace on its own domain — a private BizBuySell. Feed scoping + themes apply automatically.
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 380px' : '1fr', gap: 20, alignItems: 'start' }}>
        {/* Agency list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {agencies.length === 0 && (
            <div style={{ textAlign: 'center', color: '#94a3b8', padding: '50px 20px', border: '2px dashed #e2e8f0', borderRadius: 12 }}>
              No agencies yet.
            </div>
          )}
          {agencies.map((a) => {
            const themed = a.theme != null
            return (
              <div key={a.agency_id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: 12, border: selected?.agency_id === a.agency_id ? '2px solid #1a1a2e' : '1px solid #e2e8f0', background: '#fff' }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: a.theme?.primary_color || '#1a1a2e', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 15, flexShrink: 0 }}>
                  {a.name.charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: '#1a1a2e', fontSize: 14.5 }}>{a.name}</div>
                  <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2, overflowWrap: 'anywhere' }}>
                    {a.custom_domain || a.domain || (a.slug ? `${a.slug}.concordplatform.com` : 'no domain')}
                    {' · '}{themed ? '✅ themed' : '⬜ defaults'}{!a.is_active ? ' · 🔒 inactive' : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => open(a)} style={{ padding: '8px 16px', borderRadius: 8, background: '#1a1a2e', color: '#fff', border: 'none', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>
                    {themed ? 'Edit' : 'Brand it'}
                  </button>
                  {themed && (
                    <button onClick={() => reset(a)} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #fecaca', background: '#fff', color: '#b91c1c', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>
                      Reset
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Theme editor */}
        {selected && (
          <div style={{ border: '1px solid #e2e8f0', borderRadius: 14, padding: 18, background: '#faf9f6', position: 'sticky', top: 20 }}>
            <div style={{ fontWeight: 800, color: '#1a1a2e', fontSize: 15, marginBottom: 2 }}>🎨 {selected.name}</div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>
              Custom domain must be pointed at the platform (CNAME) to go live.
            </div>

            <label style={labelStyle}>Custom domain</label>
            <input style={inputStyle} value={form.custom_domain} placeholder="brokerage.com" onChange={(e) => setForm({ ...form, custom_domain: e.target.value })} />

            <label style={labelStyle}>Logo URL</label>
            <input style={inputStyle} value={form.logo_url} placeholder="https://…/logo.png" onChange={(e) => setForm({ ...form, logo_url: e.target.value })} />

            <label style={labelStyle}>Favicon URL</label>
            <input style={inputStyle} value={form.favicon_url} placeholder="https://…/favicon.ico" onChange={(e) => setForm({ ...form, favicon_url: e.target.value })} />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={labelStyle}>Primary</label>
                <input type="color" style={{ width: '100%', height: 38, border: '1px solid #d8d2c2', borderRadius: 8, background: '#fff', cursor: 'pointer' }} value={form.primary_color} onChange={(e) => setForm({ ...form, primary_color: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>Secondary</label>
                <input type="color" style={{ width: '100%', height: 38, border: '1px solid #d8d2c2', borderRadius: 8, background: '#fff', cursor: 'pointer' }} value={form.secondary_color} onChange={(e) => setForm({ ...form, secondary_color: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>Accent</label>
                <input type="color" style={{ width: '100%', height: 38, border: '1px solid #d8d2c2', borderRadius: 8, background: '#fff', cursor: 'pointer' }} value={form.accent_color} onChange={(e) => setForm({ ...form, accent_color: e.target.value })} />
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                <div style={{ width: '100%', height: 38, borderRadius: 8, background: `linear-gradient(90deg, ${form.primary_color}, ${form.secondary_color}, ${form.accent_color})`, border: '1px solid #e2e8f0' }} />
              </div>
            </div>

            <label style={labelStyle}>Heading font</label>
            <select style={inputStyle} value={form.heading_font} onChange={(e) => setForm({ ...form, heading_font: e.target.value })}>
              {FONT_OPTIONS.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>

            <label style={labelStyle}>Body font</label>
            <select style={inputStyle} value={form.body_font} onChange={(e) => setForm({ ...form, body_font: e.target.value })}>
              {FONT_OPTIONS.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>

            <label style={labelStyle}>Hero style</label>
            <select style={inputStyle} value={form.hero_style} onChange={(e) => setForm({ ...form, hero_style: e.target.value })}>
              {HERO_STYLES.map((h) => <option key={h} value={h}>{h}</option>)}
            </select>

            <label style={labelStyle}>Listing card style</label>
            <select style={inputStyle} value={form.listing_card_style} onChange={(e) => setForm({ ...form, listing_card_style: e.target.value })}>
              {CARD_STYLES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>

            <label style={labelStyle}>Business model</label>
            <select style={inputStyle} value={form.business_model} onChange={(e) => setForm({ ...form, business_model: e.target.value })}>
              {BUSINESS_MODELS.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>

            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={save} disabled={saving} style={{ flex: 1, padding: '11px 16px', borderRadius: 8, background: '#1a1a2e', color: '#c9a84c', border: 'none', fontWeight: 800, fontSize: 13.5, cursor: saving ? 'wait' : 'pointer' }}>
                {saving ? 'Saving…' : '💾 Save theme'}
              </button>
              <button onClick={() => setSelected(null)} style={{ padding: '11px 16px', borderRadius: 8, border: '1px solid #d8d2c2', background: '#fff', color: '#64748b', fontWeight: 700, fontSize: 13.5, cursor: 'pointer' }}>
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

'use client'

// ---------------------------------------------------------------------------
// BusinessCardBrandSettings — per-broker business card theming UI.
// Loads the current broker's brand context (agency defaults + any overrides),
// shows the agency default as pre-fill, lets the broker override each setting
// (color pickers + hex input, font selector, logo upload, layout), and renders
// a live preview. Saves only explicit overrides; clearing reverts to inherit.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useState } from 'react'
import {
  fetchBrokerBrandContext, resolveBrand, saveBrokerCardOverrides,
  clearBrokerCardOverride, uploadCardLogo, CARD_LAYOUTS, FONTS, fontCss,
  type BrokerBrandContext, type CardBrand, type CardLayout, type BrokerCardOverrides,
} from '@/lib/branding'
import BusinessCardPreview, { type CardOwnerInfo } from '@/components/cards/BusinessCardPreview'
import { ToastProvider, useToast } from '@/components/ui/Toast'

const S = {
  card: { background: 'var(--cream)', border: '1px solid var(--line)', borderRadius: 10, padding: 22, marginBottom: 18 } as const,
  label: { display: 'block', fontFamily: 'Georgia, serif', fontWeight: 600, color: 'var(--navy)', fontSize: 13, marginBottom: 4 } as const,
  input: {
    width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 6,
    border: '1px solid var(--line)', background: '#fff', color: 'var(--text)', fontSize: 14,
    fontFamily: 'Georgia, serif', outline: 'none',
  } as React.CSSProperties,
  field: { display: 'flex', flexDirection: 'column', gap: 4 } as React.CSSProperties,
  section: { fontSize: 12, textTransform: 'uppercase', letterSpacing: 1.2, color: 'var(--gold-dark)', fontWeight: 700, marginBottom: 12 } as const,
  swatchRow: { display: 'flex', alignItems: 'center', gap: 10 } as React.CSSProperties,
}

function ColorField({
  label, value, agencyDefault, onValue, onClear,
}: {
  label: string; value: string; agencyDefault: string; onValue: (v: string) => void; onClear: () => void
}) {
  const inherited = value === agencyDefault
  return (
    <div style={S.field}>
      <span style={S.label}>{label}</span>
      <div style={S.swatchRow}>
        <input
          type="color"
          value={value}
          onChange={(e) => onValue(e.target.value)}
          style={{ width: 40, height: 34, padding: 0, border: '1px solid var(--line)', borderRadius: 6, background: '#fff', cursor: 'pointer' }}
        />
        <input
          value={value}
          onChange={(e) => {
            const v = e.target.value
            if (/^#[0-9a-fA-F]{0,6}$/.test(v)) onValue(v.startsWith('#') ? v : `#${v}`)
          }}
          style={{ ...S.input, width: 120, fontFamily: 'monospace', fontSize: 13 }}
        />
        {!inherited && (
          <button onClick={onClear} style={{ fontSize: 11, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
            inherit
          </button>
        )}
      </div>
      <div style={{ fontSize: 11, color: 'var(--muted-2)' }}>
        {inherited ? 'Agency default' : 'Broker override'}
      </div>
    </div>
  )
}

export default function BusinessCardBrandSettings() {
  const toast = useToast()
  const [ctx, setCtx] = useState<BrokerBrandContext | null>(null)
  const [form, setForm] = useState<CardBrand>({
    primaryColor: '#1a1a2e', secondaryColor: '#16213e', accentColor: '#c9a84c',
    font: 'georgia', logoUrl: null, layout: 'classic',
  })
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    (async () => {
      const c = await fetchBrokerBrandContext()
      setCtx(c)
      setForm(resolveBrand(c))
    })()
  }, [])

  const owner: CardOwnerInfo = useMemo(() => ({
    name: 'Your Name',
    title: 'Business Broker',
    company: ctx?.agencyName || 'Concord Deal Platform',
    phone: '(555) 123-4567',
    email: 'you@concordplatform.com',
    website: 'concordplatform.com',
  }), [ctx?.agencyName])

  const agencyDefaults = ctx?.agency

  const patch = (p: Partial<CardBrand>) => {
    setForm((prev) => ({ ...prev, ...p }))
    setSaved(false)
  }

  const handleUploadLogo = async () => {
    if (!logoFile || !ctx?.brokerProfileId) return
    setUploadingLogo(true)
    const res = await uploadCardLogo(logoFile)
    setUploadingLogo(false)
    if ('url' in res) {
      patch({ logoUrl: res.url })
      toast('Logo uploaded — save to keep', 'success')
    } else {
      toast(res.error || 'Logo upload failed', 'error')
    }
    setLogoFile(null)
  }

  const clearLogo = () => {
    patch({ logoUrl: null })
    if (ctx?.brokerProfileId) clearBrokerCardOverride(ctx.brokerProfileId, 'logoUrl')
  }

  const save = async () => {
    if (!ctx?.brokerProfileId) {
      toast('No broker profile linked yet', 'error')
      return
    }
    setBusy(true)
    const overrides: Partial<BrokerCardOverrides> = {
      primaryColor: form.primaryColor === agencyDefaults?.primaryColor ? null : form.primaryColor,
      secondaryColor: form.secondaryColor === agencyDefaults?.secondaryColor ? null : form.secondaryColor,
      accentColor: form.accentColor === agencyDefaults?.accentColor ? null : form.accentColor,
      font: form.font === agencyDefaults?.font ? null : form.font,
      logoUrl: form.logoUrl === agencyDefaults?.logoUrl ? null : form.logoUrl,
      layout: form.layout,
    }
    const ok = await saveBrokerCardOverrides(ctx.brokerProfileId, overrides)
    setBusy(false)
    if (ok) {
      setSaved(true)
      toast('Card branding saved', 'success')
    } else {
      toast('Save failed', 'error')
    }
  }

  if (!ctx) {
    return (
      <div style={S.card}>
        <div style={{ color: 'var(--muted)', fontSize: 14 }}>Loading brand settings…</div>
      </div>
    )
  }

  return (
    <ToastProvider>
      <div style={S.card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--navy)', fontFamily: 'Georgia, serif' }}>Business Card Branding</div>
          {agencyDefaults && (
            <span style={{ fontSize: 11.5, color: 'var(--muted)', background: 'var(--paper)', padding: '4px 10px', borderRadius: 99 }}>
              Agency default{agencyDefaults.logoUrl ? '' : ''} · {fontCss(agencyDefaults.font)}
            </span>
          )}
        </div>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 6 }}>
          {agencyDefaults
            ? 'Your card inherits your agency brand. Override any field below, or leave it to inherit.'
            : 'You are not linked to an agency — customize your card freely.'}
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 24, alignItems: 'start', marginTop: 16 }}>
          {/* Left: controls */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* Colors */}
            <div>
              <div style={S.section}>Brand Colors</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <ColorField
                  label="Primary"
                  value={form.primaryColor}
                  agencyDefault={agencyDefaults?.primaryColor || '#1a1a2e'}
                  onValue={(v) => patch({ primaryColor: v })}
                  onClear={() => { if (ctx.brokerProfileId) clearBrokerCardOverride(ctx.brokerProfileId, 'primaryColor'); patch({ primaryColor: agencyDefaults?.primaryColor || '#1a1a2e' }); }}
                />
                <ColorField
                  label="Secondary"
                  value={form.secondaryColor}
                  agencyDefault={agencyDefaults?.secondaryColor || '#16213e'}
                  onValue={(v) => patch({ secondaryColor: v })}
                  onClear={() => { if (ctx.brokerProfileId) clearBrokerCardOverride(ctx.brokerProfileId, 'secondaryColor'); patch({ secondaryColor: agencyDefaults?.secondaryColor || '#16213e' }); }}
                />
                <ColorField
                  label="Accent"
                  value={form.accentColor}
                  agencyDefault={agencyDefaults?.accentColor || '#c9a84c'}
                  onValue={(v) => patch({ accentColor: v })}
                  onClear={() => { if (ctx.brokerProfileId) clearBrokerCardOverride(ctx.brokerProfileId, 'accentColor'); patch({ accentColor: agencyDefaults?.accentColor || '#c9a84c' }); }}
                />
                <div style={S.field}>
                  <span style={S.label}>Layout</span>
                  <select
                    value={form.layout}
                    onChange={(e) => patch({ layout: e.target.value as CardLayout })}
                    style={S.input}
                  >
                    {CARD_LAYOUTS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Font */}
            <div>
              <div style={S.section}>Font</div>
              <select value={form.font} onChange={(e) => patch({ font: e.target.value })} style={S.input}>
                {FONTS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
              </select>
              <div style={{ fontSize: 12, marginTop: 6, fontFamily: fontCss(form.font), color: 'var(--ink)' }}>
                The quick brown fox jumps over the lazy dog — 0123456789
              </div>
            </div>

            {/* Logo */}
            <div>
              <div style={S.section}>Logo</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  onChange={(e) => setLogoFile(e.target.files?.[0] || null)}
                  style={{ fontSize: 12 }}
                />
                <button
                  onClick={handleUploadLogo}
                  disabled={!logoFile || uploadingLogo}
                  style={{ padding: '8px 14px', background: 'var(--navy)', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 600, cursor: logoFile ? 'pointer' : 'not-allowed', opacity: logoFile ? 1 : 0.5 }}
                >
                  {uploadingLogo ? 'Uploading…' : 'Upload logo'}
                </button>
                {form.logoUrl && (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={form.logoUrl} alt="logo preview" style={{ height: 34, borderRadius: 4, background: '#fff', padding: 2 }} />
                    <button onClick={clearLogo} style={{ fontSize: 12, color: '#b00020', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                      {form.logoUrl === agencyDefaults?.logoUrl ? 'Use custom (override)' : 'Remove'}
                    </button>
                  </>
                )}
              </div>
              {form.logoUrl === agencyDefaults?.logoUrl && agencyDefaults?.logoUrl && (
                <div style={{ fontSize: 11, color: 'var(--muted-2)', marginTop: 4 }}>Showing agency logo — upload one to override.</div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <button onClick={save} disabled={busy} style={{ padding: '11px 22px', background: 'var(--navy)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, opacity: busy ? 0.6 : 1 }}>
                {busy ? 'Saving…' : 'Save branding'}
              </button>
              {saved && <span style={{ color: '#1e7e34', fontSize: 13, fontWeight: 600 }}>✓ Saved</span>}
            </div>
          </div>

          {/* Right: live preview */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center', marginTop: 4 }}>
            <div style={S.section}>Live Preview</div>
            <BusinessCardPreview brand={form} owner={owner} front />
            <BusinessCardPreview brand={form} owner={owner} front={false} />
          </div>
        </div>
      </div>
    </ToastProvider>
  )
}

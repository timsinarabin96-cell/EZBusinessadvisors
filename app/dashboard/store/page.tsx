/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useEffect, useMemo, useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import { ToastProvider, useToast } from '@/components/ui/Toast'
import {
  STORE_CATEGORIES,
  fetchStoreProducts,
  checkoutStoreOrder,
  generateStoreArtworkForProduct,
  uploadStoreTemplate,
  type StoreProduct,
  type StoreCategory,
} from '@/lib/store'
import { fmt$ } from '@/lib/recast'

export default function StorePage() {
  return (
    <AppShell active="Marketing Store">
      <ToastProvider>
        <div style={{ maxWidth: 1080, margin: '0 auto', padding: '24px 20px 60px' }}>
          <Storefront />
        </div>
      </ToastProvider>
    </AppShell>
  )
}

function Storefront() {
  const toast = useToast()
  const [products, setProducts] = useState<StoreProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [cat, setCat] = useState<StoreCategory | ''>('')
  const [ordering, setOrdering] = useState<StoreProduct | null>(null)
  const [qty, setQty] = useState(1)
  const [ship, setShip] = useState({ name: '', line1: '', line2: '', city: '', state: '', zip: '' })
  const [busy, setBusy] = useState(false)
  // Design step: AI-generated or uploaded artwork attached to the order.
  const [designMode, setDesignMode] = useState<'ai' | 'upload' | ''>('')
  const [artworkUrl, setArtworkUrl] = useState('')
  const [artworkProvider, setArtworkProvider] = useState('')
  const [designing, setDesigning] = useState(false)
  const [designErr, setDesignErr] = useState('')

  useEffect(() => {
    ;(async () => {
      const rows = await fetchStoreProducts(cat || undefined)
      setProducts(rows)
      setLoading(false)
    })()
  }, [cat])

  const visible = useMemo(
    () => (cat ? products.filter((p) => p.category === cat) : products),
    [products, cat],
  )

  const placeOrder = async () => {
    if (!ordering) return
    if (!ship.name.trim() || !ship.line1.trim() || !ship.city.trim() || !ship.state.trim() || !ship.zip.trim()) {
      toast('Complete the shipping address first', 'error')
      return
    }
    setBusy(true)
    const res = await checkoutStoreOrder({ productId: ordering.id, quantity: qty, shippingAddress: ship, artworkUrl: artworkUrl || undefined, designMode: designMode || 'auto' })
    setBusy(false)
    if (res.ok && res.url) {
      window.location.href = res.url
    } else {
      toast(res.error || 'Checkout failed', 'error')
    }
  }

  const generateDesign = async (
    product: StoreProduct,
    setUrl: (v: string) => void,
    setProvider: (v: string) => void,
    setErr: (v: string) => void,
    setDesigning: (v: boolean) => void,
  ) => {
    setDesigning(true); setErr('')
    const res = await generateStoreArtworkForProduct({ productId: product.id })
    if (res.ok && res.url) {
      setUrl(res.url); setProvider(res.provider || '')
    } else {
      setErr(res.error || 'AI design failed — try again or upload a template')
      setDesignMode('')
    }
    setDesigning(false)
  }

  const catTabs = STORE_CATEGORIES.filter((c) => c.id === cat || products.some((p) => p.category === c.id))

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: '#1a1a2e', margin: 0, fontFamily: 'Georgia, serif' }}>
            🛍️ Marketing Materials Store
          </h1>
          <p style={{ color: '#888', margin: '6px 0 0', fontSize: 14 }}>
            Order branded materials for listings, open houses, and outreach. Payment is instant; print + ship is handled for you.
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '18px 0' }}>
        <button
          onClick={() => setCat('')}
          style={{ ...tabStyle, ...(cat === '' ? activeTab : {}) }}
        >
          All
        </button>
        {catTabs.map((c) => (
          <button key={c.id} onClick={() => setCat(c.id)} style={{ ...tabStyle, ...(cat === c.id ? activeTab : {}) }}>
            {c.icon} {c.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ padding: 60, textAlign: 'center', color: '#999' }}>Loading catalog…</div>
      ) : visible.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center', color: '#999' }}>No products in this category yet.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 16 }}>
          {visible.map((p) => (
            <div key={p.id} style={{ background: '#fff', border: '1px solid #ece8dc', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 30 }}>{catIcon(p.category)}</div>
                {p.supplier && (
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: '#1d4ed8', background: '#eef2f9', padding: '3px 8px', borderRadius: 999 }}>
                    {p.supplier === 'Printify' ? '🖨️ Printify' : p.supplier === '4over' ? '⚡ 4over' : p.supplier}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 14.5, fontWeight: 700, color: '#1a1a2e', lineHeight: 1.3 }}>{p.name}</div>
              <div style={{ fontSize: 12, color: '#999', lineHeight: 1.45, flex: 1 }}>{p.description}</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#c9a84c', fontFamily: 'Georgia, serif' }}>{fmt$(p.sell_price || 0)}</div>
                <button
                  onClick={() => { setOrdering(p); setQty(1); setShip({ name: '', line1: '', line2: '', city: '', state: '', zip: '' }); setDesignMode(''); setArtworkUrl(''); setArtworkProvider(''); setDesignErr('') }}
                  style={{ background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
                >
                  Order
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {ordering && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(26,26,46,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 14, maxWidth: 480, width: '100%', padding: 24, maxHeight: '90vh', overflow: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#1a1a2e', fontFamily: 'Georgia, serif' }}>{ordering.name}</div>
                <div style={{ fontSize: 13, color: '#999', marginTop: 4 }}>{ordering.description}</div>
              </div>
              <button onClick={() => setOrdering(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#999' }}>✕</button>
            </div>

            {/* DESIGN STEP — see the result (AI) or upload a template */}
            <div style={{ margin: '16px 0 8px', fontSize: 12, color: '#999', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              1 · Design <span style={{ color: '#c9a84c' }}>✨</span>
            </div>
            {designMode === 'ai' ? (
              <div style={{ border: '1px solid #e5dfcc', borderRadius: 12, padding: 12, background: '#faf9f4' }}>
                {designing ? (
                  <div style={{ padding: '26px 10px', textAlign: 'center', color: '#888', fontSize: 13 }}>
                    🎨 Designing with AI… (10–30s)
                  </div>
                ) : artworkUrl ? (
                  <>
                    <img src={artworkUrl} alt="AI design preview" style={{ width: '100%', maxHeight: 200, objectFit: 'contain', borderRadius: 8, background: '#fff' }} />
                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                      <button
                        onClick={() => { setArtworkUrl(''); setArtworkProvider(''); setDesigning(true); generateDesign(ordering, setArtworkUrl, setArtworkProvider, setDesignErr, setDesigning) }}
                        style={{ flex: 1, background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: 8, padding: '9px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
                      >
                        🔄 Regenerate
                      </button>
                      <button
                        onClick={() => { setDesignMode(''); setArtworkUrl(''); setArtworkProvider('') }}
                        style={{ flex: 1, background: '#fff', border: '1px solid #ddd', borderRadius: 8, padding: '9px', fontSize: 13, cursor: 'pointer' }}
                      >
                        ✕ Remove
                      </button>
                    </div>
                    <div style={{ fontSize: 11, color: '#999', marginTop: 8 }}>
                      {artworkProvider ? `AI design by ${artworkProvider === 'free' ? 'flux (free tier)' : artworkProvider} — attached to your order and sent to the printer.` : ''}
                    </div>
                  </>
                ) : null}
              </div>
            ) : designMode === 'upload' ? (
              <div style={{ border: '1px solid #e5dfcc', borderRadius: 12, padding: 12, background: '#faf9f4' }}>
                <label style={{ display: 'block', textAlign: 'center', padding: '18px 10px', border: '2px dashed #d8d2c2', borderRadius: 10, cursor: 'pointer', fontSize: 13, color: '#777' }}>
                  📎 {artworkUrl ? 'Template attached — pick a different file?' : 'Click to upload your template (PDF, PNG, JPG, WebP, ≤15MB)'}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,application/pdf"
                    style={{ display: 'none' }}
                    onChange={async (e) => {
                      const f = e.target.files?.[0]
                      if (!f || !ordering) return
                      setDesigning(true); setDesignErr('')
                      const res = await uploadStoreTemplate({ productId: ordering.id, file: f })
                      setDesigning(false)
                      if (res.ok && res.url) setArtworkUrl(res.url)
                      else setDesignErr(res.error || 'Upload failed')
                    }}
                  />
                </label>
                {artworkUrl && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <a href={artworkUrl} target="_blank" rel="noreferrer" style={{ flex: 1, textAlign: 'center', background: '#1a1a2e', color: '#fff', borderRadius: 8, padding: '9px', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
                      👁️ View template
                    </a>
                    <button
                      onClick={() => { setDesignMode(''); setArtworkUrl('') }}
                      style={{ flex: 1, background: '#fff', border: '1px solid #ddd', borderRadius: 8, padding: '9px', fontSize: 13, cursor: 'pointer' }}
                    >
                      ✕ Remove
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <button
                  onClick={async () => {
                    if (!ordering) return
                    setDesignMode('ai'); setDesigning(true); setDesignErr('')
                    await generateDesign(ordering, setArtworkUrl, setArtworkProvider, setDesignErr, setDesigning)
                  }}
                  style={{ background: 'linear-gradient(135deg,#1a1a2e,#0f3460)', color: '#fff', border: 'none', borderRadius: 10, padding: '14px 10px', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}
                >
                  ✨ AI Design
                  <div style={{ fontSize: 11, fontWeight: 500, color: 'rgba(255,255,255,0.7)', marginTop: 4 }}>Auto-branded, see result now</div>
                </button>
                <button
                  onClick={() => { setDesignMode('upload'); setDesignErr('') }}
                  style={{ background: '#fff', border: '1px solid #ddd', borderRadius: 10, padding: '14px 10px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
                >
                  📎 Upload Template
                  <div style={{ fontSize: 11, fontWeight: 500, color: '#999', marginTop: 4 }}>Your own print-ready file</div>
                </button>
              </div>
            )}
            {designErr && <div style={{ marginTop: 8, fontSize: 12.5, color: '#dc2626' }}>{designErr}</div>}

            <div style={{ margin: '18px 0 8px', fontSize: 12, color: '#999', textTransform: 'uppercase', letterSpacing: 0.5 }}>Quantity</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button onClick={() => setQty(Math.max(1, qty - 1))} style={qtyBtn}>−</button>
              <input
                type="number" min={1} max={1000} value={qty}
                onChange={(e) => setQty(Math.max(1, parseInt(e.target.value || '1', 10) || 1))}
                style={{ width: 70, textAlign: 'center', padding: '8px', border: '1px solid #ddd', borderRadius: 8, fontSize: 15, fontWeight: 700 }}
              />
              <button onClick={() => setQty(Math.min(1000, qty + 1))} style={qtyBtn}>+</button>
              <div style={{ marginLeft: 'auto', fontSize: 16, fontWeight: 800, color: '#c9a84c' }}>{fmt$((ordering.sell_price || 0) * qty)}</div>
            </div>

            <div style={{ margin: '18px 0 8px', fontSize: 12, color: '#999', textTransform: 'uppercase', letterSpacing: 0.5 }}>Ship To</div>
            {(['name', 'line1', 'line2', 'city', 'state', 'zip'] as const).map((f) => (
              <input
                key={f}
                placeholder={f === 'name' ? 'Recipient name' : f === 'line1' ? 'Street address' : f === 'line2' ? 'Apt / suite (optional)' : f === 'city' ? 'City' : f === 'state' ? 'State' : 'ZIP'}
                value={ship[f]}
                onChange={(e) => setShip({ ...ship, [f]: e.target.value })}
                style={{ width: '100%', marginBottom: 8, padding: '10px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14 }}
              />
            ))}

            <button
              onClick={placeOrder}
              disabled={busy}
              style={{ width: '100%', marginTop: 10, background: busy ? '#999' : '#1a1a2e', color: '#fff', border: 'none', borderRadius: 10, padding: '13px', fontSize: 15, fontWeight: 800, cursor: busy ? 'wait' : 'pointer' }}
            >
              {busy ? 'Opening checkout…' : `Pay ${fmt$((ordering.sell_price || 0) * qty)} — Secure Checkout`}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

const tabStyle: React.CSSProperties = { background: '#fff', border: '1px solid #ece8dc', borderRadius: 999, padding: '7px 14px', fontSize: 13, cursor: 'pointer', color: '#555' }
const activeTab: React.CSSProperties = { background: '#1a1a2e', color: '#fff', borderColor: '#1a1a2e' }
const qtyBtn: React.CSSProperties = { width: 34, height: 34, borderRadius: 8, border: '1px solid #ddd', background: '#faf9f4', fontSize: 16, cursor: 'pointer' }

function catIcon(cat: string): string {
  const found = STORE_CATEGORIES.find((c) => c.id === cat)
  return found?.icon || '🛍️'
}

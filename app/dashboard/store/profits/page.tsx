/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useEffect, useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import { ToastProvider } from '@/components/ui/Toast'
import { fetchStoreStats, ORDER_STATUS_META, STORE_CATEGORIES, type StoreStats, type StoreOrder } from '@/lib/store'
import { fmt$ } from '@/lib/recast'

export default function StoreProfitsPage() {
  return (
    <AppShell active="Store Profits">
      <ToastProvider>
        <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 20px 60px' }}>
          <Profits />
        </div>
      </ToastProvider>
    </AppShell>
  )
}

function Profits() {
  const [stats, setStats] = useState<StoreStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [supplierEmail, setSupplierEmail] = useState('')
  const [savingSupplier, setSavingSupplier] = useState(false)

  useEffect(() => {
    ;(async () => {
      setStats(await fetchStoreStats())
      const s = await fetch('/api/store/settings', { cache: 'no-store' }).then((r) => r.json()).catch(() => ({}))
      if (s?.supplier_email) setSupplierEmail(s.supplier_email)
      setLoading(false)
    })()
  }, [])

  if (loading) {
    return <div style={{ padding: 60, textAlign: 'center', color: '#999' }}>Loading profit dashboard…</div>
  }
  if (!stats) {
    return (
      <div style={{ padding: 60, textAlign: 'center', color: '#999' }}>
        Profit dashboard requires owner access — available in your owner account.
      </div>
    )
  }

  const marginPct = stats.revenue > 0 ? Math.round((stats.profit / stats.revenue) * 1000) / 10 : 0

  return (
    <div>
      <h1 style={{ fontSize: 26, fontWeight: 800, color: '#1a1a2e', margin: 0, fontFamily: 'Georgia, serif' }}>📈 Store Profits</h1>
      <p style={{ color: '#888', margin: '6px 0 22px', fontSize: 14 }}>
        Every paid order's profit lands here automatically. Revenue is what brokers paid; cost is what your supplier charges.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 14 }}>
        <StatCard label="Total Revenue" value={fmt$(stats.revenue)} sub={`${stats.orderCount} paid orders`} color="#1a1a2e" />
        <StatCard label="Supplier Cost" value={fmt$(stats.cost)} sub="what you pay the printer" color="#1d4ed8" />
        <StatCard label="Your Profit" value={fmt$(stats.profit)} sub={`${marginPct}% margin`} color="#16a34a" highlight />
      </div>

      <div style={{ marginTop: 18, background: '#fff', border: '1px solid #ece8dc', borderRadius: 12, padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 20 }}>🖨️</div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#1a1a2e' }}>Auto-routed suppliers (picked for you)</div>
            <div style={{ fontSize: 11.5, color: '#999', marginTop: 2 }}>Work orders send to the right print shop automatically per product.</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#1a1a2e', background: '#f4f1e8', border: '1px solid #ece8dc', borderRadius: 8, padding: '6px 12px' }}>📄 Paper → <b style={{ color: '#1d4ed8' }}>4over</b> (trade wholesale)</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#1a1a2e', background: '#eef7f1', border: '1px solid #d5eade', borderRadius: 8, padding: '6px 12px' }}>👕 Apparel/Promo → <b style={{ color: '#1e7e34' }}>Printify</b> (POD + API)</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#1a1a2e', background: '#fdf6ec', border: '1px solid #f0dfc2', borderRadius: 8, padding: '6px 12px' }}>⚡ Backup → <b style={{ color: '#8a6d1a' }}>GotPrint</b></span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 12, borderTop: '1px solid #f2efe6', paddingTop: 12 }}>
          <div style={{ fontSize: 12, color: '#999', flex: 1, minWidth: 180 }}>Optional override — send all work orders to one inbox instead:</div>
          <input
            type="email"
            placeholder="supplier@printshop.com"
            value={supplierEmail}
            onChange={(e) => setSupplierEmail(e.target.value)}
            style={{ padding: '9px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 13, width: 220 }}
          />
          <button
            onClick={async () => {
              setSavingSupplier(true)
              const res = await fetch('/api/store/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ supplier_email: supplierEmail }),
              }).then((r) => r.json()).catch(() => ({ ok: false, error: 'Network error' }))
              setSavingSupplier(false)
              if (!res.ok) alert(res.error || 'Failed to save supplier')
              else alert('✅ Override saved — work orders will auto-send to ' + res.supplier_email)
            }}
            disabled={savingSupplier}
            style={{ background: savingSupplier ? '#999' : '#1a1a2e', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
          >
            {savingSupplier ? 'Saving…' : 'Save Override'}
          </button>
        </div>
      </div>

      {stats.byCategory.length > 0 && (
        <div style={{ marginTop: 26 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, color: '#1a1a2e', margin: '0 0 12px' }}>By Category</h2>
          <div style={{ background: '#fff', border: '1px solid #ece8dc', borderRadius: 12, overflow: 'hidden' }}>
            {stats.byCategory.map((c, i) => {
              const catMeta = STORE_CATEGORIES.find((x) => x.id === c.category)
              const pct = stats.revenue > 0 ? Math.round((c.profit / stats.revenue) * 1000) / 10 : 0
              return (
                <div key={c.category} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', borderTop: i ? '1px solid #f2efe6' : 'none' }}>
                  <div style={{ fontSize: 20 }}>{catMeta?.icon || '🛍️'}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: '#1a1a2e' }}>{catMeta?.label || c.category} <span style={{ color: '#aaa', fontWeight: 400 }}>({c.orders} orders)</span></div>
                    <div style={{ fontSize: 12, color: '#999' }}>Rev {fmt$(c.revenue)} · Cost {fmt$(c.cost)}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: '#16a34a' }}>{fmt$(c.profit)}</div>
                    <div style={{ fontSize: 11.5, color: '#aaa' }}>{pct}% of profit</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {stats.recent.length > 0 && (
        <div style={{ marginTop: 26 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, color: '#1a1a2e', margin: '0 0 12px' }}>All Orders</h2>
            <span style={{ fontSize: 12, color: '#999' }}>{stats.recent.length} most recent</span>
          </div>
          <div style={{ background: '#fff', border: '1px solid #ece8dc', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr 0.9fr 0.9fr 0.9fr auto', gap: 10, padding: '10px 16px', background: '#faf9f4', borderBottom: '1px solid #ece8dc', fontSize: 11, fontWeight: 800, color: '#8a8678', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              <div>Buyer / Product</div><div>Qty</div><div>Amount</div><div>Profit</div><div>Status</div><div>Artwork</div><div />
            </div>
            {stats.recent.map((o: StoreOrder, i) => {
              const meta = ORDER_STATUS_META[o.status] || ORDER_STATUS_META.paid
              const buyerName = (o.shipping_address as any)?.name || ''
              return (
                <div key={o.id} style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr 0.9fr 0.9fr 0.9fr auto', gap: 10, alignItems: 'center', padding: '11px 16px', borderTop: i ? '1px solid #f2efe6' : 'none', fontSize: 13 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, color: '#1a1a2e', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.product_name} × {o.quantity}</div>
                    <div style={{ fontSize: 11.5, color: '#888' }}>
                      {buyerName}{o.buyer_email ? ` · ${o.buyer_email}` : ''}
                    </div>
                    <div style={{ fontSize: 11, color: '#aaa' }}>
                      {o.created_at ? new Date(o.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''}
                      {o.work_order_ref ? ` · ${o.work_order_ref}` : ''}
                    </div>
                  </div>
                  <div style={{ color: '#555' }}>{o.quantity}</div>
                  <div style={{ fontWeight: 800, color: '#1a1a2e' }}>{fmt$(o.subtotal)}</div>
                  <div style={{ fontWeight: 700, color: '#16a34a' }}>+{fmt$(o.profit)}</div>
                  <div>
                    <span style={{ fontSize: 11, fontWeight: 800, color: meta.color, background: `${meta.color}18`, padding: '4px 10px', borderRadius: 999, whiteSpace: 'nowrap' }}>{meta.label}</span>
                    {o.refunded_at && (
                      <div style={{ fontSize: 10.5, color: '#dc2626', marginTop: 4 }}>↩️ Refunded {fmt$(o.refund_amount || 0)}</div>
                    )}
                  </div>
                  <div>
                    {o.print_file_url ? (
                      <a href={o.print_file_url} target="_blank" rel="noreferrer" style={{ fontSize: 11.5, color: '#1d4ed8', fontWeight: 600, textDecoration: 'none' }}>🖨️ File</a>
                    ) : (
                      <span style={{ fontSize: 11.5, color: '#ccc' }}>—</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {!o.refunded_at && o.status !== 'cancelled' && (
                      <button
                        onClick={async () => {
                          const reason = window.prompt('Refund reason (sent to buyer + vendor):', 'Customer did not receive the product')
                          if (reason === null) return
                          if (!window.confirm(`Refund ${fmt$(o.subtotal)} to the buyer and request vendor credit for ${o.product_name}?`)) return
                          const res = await fetch('/api/store/refund', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ orderId: o.id, reason: reason || 'Customer did not receive the product' }),
                          }).then((r) => r.json()).catch(() => ({ ok: false, error: 'Network error' }))
                          if (res.ok) { alert('✅ Refund issued — buyer notified, vendor refund request sent.'); window.location.reload() }
                          else alert('Refund failed: ' + (res.error || 'unknown'))
                        }}
                        style={{ background: '#fff', border: '1px solid #fca5a5', color: '#dc2626', borderRadius: 8, padding: '6px 10px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}
                      >
                        ↩️ Refund
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {stats.recent.length === 0 && stats.orderCount === 0 && (
        <div style={{ marginTop: 30, padding: 40, textAlign: 'center', color: '#999', border: '1px dashed #ddd', borderRadius: 12 }}>
          No orders yet. When brokers order from the Marketing Store, profits appear here automatically.
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, sub, color, highlight }: { label: string; value: string; sub: string; color: string; highlight?: boolean }) {
  return (
    <div style={{
      background: highlight ? '#1a1a2e' : '#fff',
      border: highlight ? '1px solid #1a1a2e' : '1px solid #ece8dc',
      borderRadius: 14,
      padding: '18px 20px',
    }}>
      <div style={{ fontSize: 11.5, color: highlight ? '#8a8a9a' : '#999', textTransform: 'uppercase', letterSpacing: 0.6 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: highlight ? '#c9a84c' : color, fontFamily: 'Georgia, serif', margin: '6px 0 2px' }}>{value}</div>
      <div style={{ fontSize: 12, color: highlight ? '#8a8a9a' : '#aaa' }}>{sub}</div>
    </div>
  )
}

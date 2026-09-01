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
import { fetchMyStoreOrders, ORDER_STATUS_META, type StoreOrder } from '@/lib/store'
import { fmt$ } from '@/lib/recast'
import { PageHero, Chip, SkeletonRows, EmptyState, type ChipTone } from '@/components/ui/premium'

const ORDER_TONES: Record<string, ChipTone> = {
  paid: 'gold',
  work_order_sent: 'blue',
  processing: 'purple',
  shipped: 'green',
  delivered: 'green',
  cancelled: 'red',
}

export default function StoreOrdersPage() {
  return (
    <AppShell active="Store Orders">
      <ToastProvider>
        <div style={{ maxWidth: 980, margin: '0 auto', padding: '24px 20px 60px' }}>
          <OrdersList />
        </div>
      </ToastProvider>
    </AppShell>
  )
}

function OrdersList() {
  const [orders, setOrders] = useState<StoreOrder[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      setOrders(await fetchMyStoreOrders())
      setLoading(false)
    })()
  }, [])

  return (
    <div>
      <PageHero
        icon="📦"
        eyebrow="Store Orders"
        title="My Store Orders"
        sub="Track every marketing materials order you've placed."
      />

      {loading ? (
        <SkeletonRows rows={5} h={64} />
      ) : orders.length === 0 ? (
        <EmptyState
          icon="📦"
          title="No orders yet"
          sub="Grab materials from the Marketing Store."
          action={<a href="/dashboard/store" style={{ color: '#c9a84c', fontWeight: 700, fontSize: 13.5 }}>Browse the Marketing Store →</a>}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {orders.map((o) => {
            const meta = ORDER_STATUS_META[o.status] || ORDER_STATUS_META.paid
            return (
              <div key={o.id} className="p-card" style={{ padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#1a1a2e' }}>{o.product_name}</div>
                    <div style={{ fontSize: 12.5, color: '#999', marginTop: 3 }}>
                      Qty {o.quantity} · {fmt$(o.unit_sell)} each · <b>{fmt$(o.subtotal)}</b>
                      {o.work_order_ref ? ` · Ref ${o.work_order_ref}` : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {o.tracking_number && (
                      <span style={{ fontSize: 12, color: '#1d4ed8', background: '#eef2f9', padding: '5px 10px', borderRadius: 6 }}>
                        📬 {o.tracking_number}
                      </span>
                    )}
                    <Chip tone={ORDER_TONES[o.status] || 'gray'}>{meta.label}</Chip>
                  </div>
                </div>
                {o.shipping_address && (
                  <div style={{ fontSize: 12.5, color: '#777', marginTop: 10, borderTop: '1px solid #f2efe6', paddingTop: 10 }}>
                    📍 {[o.shipping_address.name, o.shipping_address.line1, o.shipping_address.line2, `${o.shipping_address.city}, ${o.shipping_address.state} ${o.shipping_address.zip}`].filter(Boolean).join(' · ')}
                  </div>
                )}
                <div style={{ fontSize: 11.5, color: '#aaa', marginTop: 8 }}>
                  Ordered {o.created_at ? new Date(o.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

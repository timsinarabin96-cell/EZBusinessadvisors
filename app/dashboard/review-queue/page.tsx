/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

// =============================================================================
// Listing Review Queue — broker approval workflow
// -----------------------------------------------------------------------------
// Draft listings (including seller self-service orders) wait here for broker
// review: approve, reject, or request changes. Approving auto-fires buyer
// matching via the database trigger.
// =============================================================================

import { useCallback, useEffect, useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import { LoadingState } from '@/components/ui'
import { ToastProvider, useToast } from '@/components/ui/Toast'
import { supabase } from '@/lib/supabase/client'
import { PageHero, EmptyState, Chip } from '@/components/ui/premium'

interface ReviewListing {
  id: string
  business_name: string
  industry: string | null
  location_general: string | null
  asking_price: number | null
  annual_revenue: number | null
  status: string
  review_stage: string
  intake_source: string | null
  created_at: string | null
  ai_metadata: { pending_price_change?: { asking_price: number; previous_asking_price?: number | null; reason?: string | null } } | null
}

export default function ReviewQueuePage() {
  return (
    <AppShell active="Review Queue">
      <ToastProvider>
        <div style={{ maxWidth: 1080, margin: '0 auto', padding: '24px 20px 60px' }}>
          <ReviewQueue />
        </div>
      </ToastProvider>
    </AppShell>
  )
}

function ReviewQueue() {
  const toast = useToast()
  const [listings, setListings] = useState<ReviewListing[]>([])
  const [priceRequests, setPriceRequests] = useState<ReviewListing[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data, error }, priceRes] = await Promise.all([
      supabase
        .from('listings')
        .select('*')
        .in('status', ['draft', 'changes_requested'])
        .order('created_at', { ascending: true }),
      supabase
        .from('listings')
        .select('*')
        .not('ai_metadata->pending_price_change', 'is', null)
        .order('created_at', { ascending: true }),
    ])
    if (!error) setListings((data as ReviewListing[]) || [])
    if (!priceRes.error) setPriceRequests((priceRes.data as ReviewListing[]) || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const act = async (id: string, action: 'approve' | 'reject' | 'request_changes', notes?: string) => {
    setBusyId(id)
    const res = await fetch('/api/listings/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listingId: id, action, notes }),
    })
    const data = await res.json().catch(() => ({}))
    setBusyId(null)
    if (!res.ok) return toast(data.error || 'Action failed', 'error')
    toast(action === 'approve' ? 'Listing approved — buyer matching running.' : action === 'reject' ? 'Listing rejected.' : 'Changes requested.', 'success')
    load()
  }

  const actPrice = async (id: string, action: 'approve' | 'reject') => {
    setBusyId(id)
    const res = await fetch(`/api/listings/${id}/price`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
    const data = await res.json().catch(() => ({}))
    setBusyId(null)
    if (!res.ok) return toast(data.error || 'Action failed', 'error')
    toast(action === 'approve' ? 'Price change approved.' : 'Price change rejected.', 'success')
    load()
  }

  if (loading) return <LoadingState label="Loading review queue..." />

  return (
    <div>
      <PageHero
        icon="🗂️"
        eyebrow="Review Queue"
        title="Listing Review Queue"
        sub="Draft listings from seller self-service and intake wait here. Approve to publish + auto-match buyers; reject or request changes to send back."
      />

      {priceRequests.length > 0 && (
        <div style={{ marginBottom: 22 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
            💲 Pending price changes
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {priceRequests.map((l) => {
              const p = l.ai_metadata?.pending_price_change
              if (!p) return null
              return (
                <article key={`price-${l.id}`} className="p-card" style={{ padding: 18 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontSize: 17, fontWeight: 700 }}>{l.business_name}</div>
                      <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4 }}>
                        Current: ${Number(l.asking_price || p.previous_asking_price || 0).toLocaleString()} → Requested: ${Number(p.asking_price).toLocaleString()}
                      </div>
                      {p.reason && <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 4 }}>Seller note: {p.reason}</div>}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-primary" style={{ padding: '8px 16px' }} disabled={busyId === l.id} onClick={() => actPrice(l.id, 'approve')}>Approve</button>
                      <button className="btn" style={{ padding: '8px 16px', color: '#b91c1c', borderColor: '#fecaca' }} disabled={busyId === l.id} onClick={() => actPrice(l.id, 'reject')}>Reject</button>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        </div>
      )}

      {listings.length === 0 ? (
        <EmptyState
          icon="🎉"
          title="Queue is clear"
          sub="No listings awaiting review."
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {listings.map((l) => (
            <article key={l.id} className="p-card" style={{ padding: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 700 }}>{l.business_name}</div>
                  <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4 }}>
                    {[l.industry, l.location_general].filter(Boolean).join(' · ') || '—'}
                    {l.asking_price ? ` · $${Number(l.asking_price).toLocaleString()}` : ''}
                    {l.annual_revenue ? ` · Revenue $${Number(l.annual_revenue).toLocaleString()}` : ''}
                  </div>
                  <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <Chip tone="gray">source: {l.intake_source || 'manual'}</Chip>
                    <Chip tone="gold">{l.review_stage}</Chip>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-primary" style={{ padding: '8px 16px' }} disabled={busyId === l.id} onClick={() => act(l.id, 'approve')}>Approve</button>
                  <button className="btn" style={{ padding: '8px 16px' }} disabled={busyId === l.id} onClick={() => act(l.id, 'request_changes')}>Request changes</button>
                  <button className="btn" style={{ padding: '8px 16px', color: '#b91c1c', borderColor: '#fecaca' }} disabled={busyId === l.id} onClick={() => act(l.id, 'reject')}>Reject</button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}

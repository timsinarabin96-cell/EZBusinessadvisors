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
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('listings')
      .select('*')
      .in('status', ['draft', 'changes_requested'])
      .order('created_at', { ascending: true })
    if (!error) setListings((data as ReviewListing[]) || [])
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

  if (loading) return <LoadingState label="Loading review queue..." />

  return (
    <div>
      <h1 style={{ fontSize: 26, margin: '0 0 6px' }}>Listing Review Queue</h1>
      <p style={{ color: 'var(--muted)', margin: '0 0 24px' }}>
        Draft listings from seller self-service and intake wait here. Approve to publish + auto-match buyers; reject or request changes to send back.
      </p>

      {listings.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', background: '#fff', border: '1px solid var(--line)', borderRadius: 12, color: 'var(--muted)' }}>
          🎉 Queue is clear — no listings awaiting review.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {listings.map((l) => (
            <article key={l.id} style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 700 }}>{l.business_name}</div>
                  <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4 }}>
                    {[l.industry, l.location_general].filter(Boolean).join(' · ') || '—'}
                    {l.asking_price ? ` · $${Number(l.asking_price).toLocaleString()}` : ''}
                    {l.annual_revenue ? ` · Revenue $${Number(l.annual_revenue).toLocaleString()}` : ''}
                  </div>
                  <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, background: '#f1f5f9', padding: '3px 10px', borderRadius: 20, color: '#475569' }}>source: {l.intake_source || 'manual'}</span>
                    <span style={{ fontSize: 11, background: '#fef3c7', padding: '3px 10px', borderRadius: 20, color: '#92400e' }}>{l.review_stage}</span>
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

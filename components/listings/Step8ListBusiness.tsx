'use client'

import { useEffect, useState } from 'react'
import { StepShell, stepField, stepLabel, stepBtn } from '@/components/listings/StepShell'
import { publishListing, completeStep } from '@/lib/workflow'
import { fetchListing } from '@/lib/listings'
import StatusBadge from '@/components/listings/StatusBadge'

// ---------------------------------------------------------------------------
// Step 8 — List Business: publish the listing to the marketplace (live on website).
// ---------------------------------------------------------------------------

export default function Step8ListBusiness({ listingId, onNext }: { listingId: string; onNext: () => void }) {
  const [listing, setListing] = useState<any>(null)
  const [pushResult, setPushResult] = useState<string>('')
  const [busy, setBusy] = useState(false)

  const load = async () => setListing(await fetchListing(listingId))
  useEffect(() => { load() }, [listingId])

  const publish = async () => {
    setBusy(true)
    const ok = await publishListing(listingId)
    setPushResult(ok ? 'Listing is live on the website ✓' : 'Publish failed')
    await load()
    setBusy(false)
  }

  const isActive = listing?.status === 'active'

  return (
    <StepShell step={8} title="List Business" description="Publish the listing to the marketplace so it goes live on the website."
      status="draft" onNext={async () => { await completeStep(listingId, 8); onNext() }} nextLabel="Step 8 complete →">
      {/* Preview card */}
      <div style={{ padding: '18px 20px', border: '1px solid var(--line)', borderRadius: 10, background: 'var(--paper)', marginBottom: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 18, fontWeight: 700, fontFamily: 'Georgia, serif', color: 'var(--navy)' }}>{listing?.business_name}</span>
          <StatusBadge status={listing?.status} />
        </div>
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>{listing?.industry} · {listing?.location_general}</div>
        <div style={{ marginTop: 8, fontSize: 20, fontWeight: 700, color: 'var(--navy)' }}>{listing?.asking_price ? '$' + Math.round(listing.asking_price).toLocaleString() : '—'}</div>
      </div>

      {!isActive ? (
        <button onClick={publish} disabled={busy} style={stepBtn(true)}>{busy ? 'Publishing…' : '🌐 Publish to marketplace'}</button>
      ) : (
        <div style={{ fontSize: 14, color: '#16a34a', fontWeight: 600 }}>✓ Listing is live on the website.</div>
      )}

      {pushResult && <div style={{ marginTop: 10, fontSize: 13, color: pushResult.includes('failed') ? '#dc2626' : '#16a34a' }}>{pushResult}</div>}

      <div style={{ marginTop: 16, fontSize: 12.5, color: 'var(--muted)' }}>
        Publishing sets the listing status to <strong>Active</strong> and makes it live on the website. Once a buyer signs a letter of intent, the status will automatically advance to Pending Sale. Syndication to other sources (BizBuySell, LoopNet, etc.) is manual — enter them yourself from your own accounts.
      </div>
    </StepShell>
  )
}

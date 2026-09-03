/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useEffect, useState } from 'react'
import { StepShell,  stepBtn } from '@/components/listings/StepShell'
import { publishListing, completeStep } from '@/lib/workflow'
import { fetchListing } from '@/lib/listings'
import { fetchListingReadiness } from '@/lib/listingReadiness'
import StatusBadge from '@/components/listings/StatusBadge'
import SyndicationPanel from '@/components/listings/SyndicationPanel'
import { evaluateListingCompliance } from '@/lib/compliance'

// ---------------------------------------------------------------------------
// Step 8 — List Business: publish the listing to the marketplace (live on website).
// Publish is GATED on readiness — the listing cannot go live with blockers.
// ---------------------------------------------------------------------------

export default function Step8ListBusiness({ listingId, onNext }: { listingId: string; onNext: () => void }) {
  const [listing, setListing] = useState<any>(null)
  const [pushResult, setPushResult] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [readiness, setReadiness] = useState<{ canPublish: boolean; blockers: string[]; score: number } | null>(null)
  const [compliance, setCompliance] = useState<{ license_required: boolean; reason: string; checklist: { key: string; label: string; required: boolean }[] } | null>(null)

  const load = async () => {
    setListing(await fetchListing(listingId))
    const r = await fetchListingReadiness(listingId)
    setReadiness({ canPublish: r.canPublish, blockers: r.blockers, score: r.score })
    // Compliance evaluation — advisory jurisdiction + disclosure checklist.
    try {
      const l = await fetchListing(listingId)
      const c = await evaluateListingCompliance({
        id: listingId,
        agency_id: '',
        country_code: (l as any)?.country_code || 'US',
        location_general: (l as any)?.location_general || null,
        real_estate_included: !!(l as any)?.real_estate_included,
      })
      setCompliance({ license_required: c.license_required, reason: c.reason, checklist: c.checklist })
    } catch {
      setCompliance(null)
    }
  }
  useEffect(() => { load() }, [listingId])

  const publish = async () => {
    if (readiness && !readiness.canPublish) {
      setPushResult('Not publish-ready — resolve blockers first')
      return
    }
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
        <>
          {readiness && !readiness.canPublish && readiness.blockers.length > 0 && (
            <div style={{ marginBottom: 14, padding: '12px 14px', background: '#fdf3e3', border: '1px solid #f0dfc0', borderRadius: 10, fontSize: 12.5, color: '#92400e' }}>
              <strong>🚧 Readiness {readiness.score}/100 — resolve before publishing:</strong>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                {readiness.blockers.slice(0, 4).map((b) => <li key={b} style={{ marginTop: 2 }}>{b}</li>)}
              </ul>
            </div>
          )}
          {readiness && readiness.canPublish && (
            <div style={{ marginBottom: 14, padding: '12px 14px', background: '#e8f7ee', border: '1px solid #c6e9d3', borderRadius: 10, fontSize: 12.5, color: '#166534' }}>
              ✅ Readiness {readiness.score}/100 — everything required is complete.
            </div>
          )}
          {compliance && compliance.license_required && (
            <div style={{ marginBottom: 14, padding: '12px 14px', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 10, fontSize: 12.5, color: '#9a3412' }}>
              <strong>⚖️ Compliance check:</strong> {compliance.reason}
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                {compliance.checklist.filter((c) => c.required).map((c) => (
                  <li key={c.key} style={{ marginTop: 2 }}>{c.label}</li>
                ))}
              </ul>
            </div>
          )}
          <button onClick={publish} disabled={busy || (readiness ? !readiness.canPublish : false)} style={{ ...stepBtn(true), opacity: readiness && !readiness.canPublish ? 0.5 : 1 }}>
            {busy ? 'Publishing…' : readiness && !readiness.canPublish ? '🔒 Not ready to publish' : '🌐 Publish to marketplace'}
          </button>
        </>
      ) : (
        <div style={{ fontSize: 14, color: '#16a34a', fontWeight: 600 }}>✓ Listing is live on the website.</div>
      )}

      {pushResult && <div style={{ marginTop: 10, fontSize: 13, color: pushResult.includes('failed') ? '#dc2626' : '#16a34a' }}>{pushResult}</div>}

      <div style={{ marginTop: 16, fontSize: 12.5, color: 'var(--muted)' }}>
        Publishing sets the listing status to <strong>Active</strong> and makes it live on the website. Once a buyer signs a letter of intent, the status will automatically advance to Pending Sale.
      </div>

      {/* One-click marketplace syndication with per-source status */}
      <SyndicationPanel listingId={listingId} />
    </StepShell>
  )
}

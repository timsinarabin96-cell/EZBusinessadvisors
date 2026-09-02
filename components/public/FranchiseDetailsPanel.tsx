/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

// ---------------------------------------------------------------------------
// FranchiseDetailsPanel — public-facing franchise opportunity details.
// Fetches the public-safe franchise fields for a live listing (brand,
// investment range, fees, territories, units, training, ideal candidate
// profile) and gates the optional Item 19 (Financial Performance
// Representation) PDF behind the same NDA flow the financials use: the buyer
// signs the platform NDA for this listing, receives an unlock token (cached
// in localStorage), and the token swaps for a short-lived signed URL.
// ---------------------------------------------------------------------------

import { useEffect, useState } from 'react'
import { fmt$ } from '@/lib/recast'
import { useToast } from '@/components/ui/Toast'

interface PublicFranchise {
  brand_name: string | null
  industry_category: string | null
  total_investment_min: number | null
  total_investment_max: number | null
  franchise_fee: number | null
  royalty_fee_pct: number | null
  territories_available: string | null
  existing_units: number | null
  training_support: string | null
  ideal_candidate_liquid_capital: number | null
  ideal_candidate_net_worth: number | null
  has_item19: boolean
}

const tokenKey = (listingId: string) => `nda_token_${listingId}`

export default function FranchiseDetailsPanel({ listingId }: { listingId: string }) {
  const toast = useToast()
  const [franchise, setFranchise] = useState<PublicFranchise | null>(null)
  const [loading, setLoading] = useState(true)
  const [unlocking, setUnlocking] = useState(false)
  const [showNda, setShowNda] = useState(false)
  const [ndaForm, setNdaForm] = useState({ name: '', email: '', guideAcknowledged: false })
  const [item19Unlocked, setItem19Unlocked] = useState(false)

  useEffect(() => {
    let alive = true
    fetch(`/api/public/franchise?listingId=${encodeURIComponent(listingId)}`)
      .then((r) => r.json())
      .then((d) => { if (alive && d.ok) setFranchise(d.franchise || null) })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [listingId])

  const unlockItem19 = async () => {
    setUnlocking(true)
    try {
      const cached = typeof window !== 'undefined' ? window.localStorage.getItem(tokenKey(listingId)) : null
      const res = await fetch(`/api/public/nda/item19?listingId=${encodeURIComponent(listingId)}&token=${encodeURIComponent(cached || '')}`)
      const data = await res.json()
      if (data.ok && data.url) {
        setItem19Unlocked(true)
        window.open(data.url, '_blank', 'noopener')
        toast('Item 19 unlocked — opening document', 'success')
      } else if (res.status === 403 || !cached) {
        setShowNda(true)
      } else {
        toast(data.error || 'Could not open the document', 'error')
      }
    } catch {
      toast('Something went wrong. Please try again.', 'error')
    } finally {
      setUnlocking(false)
    }
  }

  const submitNda = async () => {
    if (!ndaForm.name.trim() || !ndaForm.email.trim()) { toast('Name and email are required', 'error'); return }
    if (!ndaForm.guideAcknowledged) { toast('Please confirm you have read the Buyer Forms Overview & Confidentiality Guide.', 'error'); return }
    setUnlocking(true)
    try {
      const res = await fetch('/api/public/nda/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listingId, name: ndaForm.name.trim(), email: ndaForm.email.trim(),
          guideAcknowledged: true, ndaFormData: {}, buyerProfile: {},
        }),
      })
      const data = await res.json()
      if (!data.ok) { toast(data.error || 'Could not process NDA', 'error'); return }
      window.localStorage.setItem(tokenKey(listingId), data.token)
      setShowNda(false)
      const itemRes = await fetch(`/api/public/nda/item19?listingId=${encodeURIComponent(listingId)}&token=${encodeURIComponent(data.token)}`)
      const itemData = await itemRes.json()
      if (itemData.ok && itemData.url) {
        setItem19Unlocked(true)
        window.open(itemData.url, '_blank', 'noopener')
        toast('NDA signed — Item 19 unlocked', 'success')
      } else {
        toast(itemData.error || 'NDA signed, but the document could not be opened', 'error')
      }
    } catch {
      toast('Something went wrong. Please try again.', 'error')
    } finally {
      setUnlocking(false)
    }
  }

  if (loading) return null
  if (!franchise) return null

  const rows: Array<[string, string]> = []
  if (franchise.total_investment_min != null || franchise.total_investment_max != null) {
    const min = franchise.total_investment_min
    const max = franchise.total_investment_max
    rows.push(['💰 Total investment', min != null && max != null ? `${fmt$(min)} – ${fmt$(max)}` : min != null ? `From ${fmt$(min)}` : `Up to ${fmt$(max)}`])
  }
  if (franchise.franchise_fee != null) rows.push(['📋 Franchise fee', fmt$(franchise.franchise_fee)])
  if (franchise.royalty_fee_pct != null) rows.push(['🔁 Royalty', `${franchise.royalty_fee_pct}% of gross revenue`])
  if (franchise.existing_units != null) rows.push(['🏢 Existing units', `${franchise.existing_units} open unit${franchise.existing_units === 1 ? '' : 's'}`])
  if (franchise.territories_available) rows.push(['🗺️ Territories available', franchise.territories_available])
  if (franchise.ideal_candidate_liquid_capital != null) rows.push(['💵 Ideal candidate — liquid capital', fmt$(franchise.ideal_candidate_liquid_capital)])
  if (franchise.ideal_candidate_net_worth != null) rows.push(['🏦 Ideal candidate — net worth', fmt$(franchise.ideal_candidate_net_worth)])

  return (
    <section style={{ border: '1px solid #e5e0d2', borderRadius: 14, padding: 24, margin: '0 0 24px', background: '#fffdf7' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 26 }}>🏷️</span>
        <h2 className="display-title" style={{ fontSize: 20, color: '#1a1a2e', margin: 0 }}>Franchise Opportunity</h2>
        {franchise.industry_category && <span style={{ background: '#f1e8d0', border: '1px solid #e0d3a8', color: '#6b5316', padding: '3px 10px', borderRadius: 99, fontSize: 12, fontWeight: 700 }}>{franchise.industry_category}</span>}
      </div>
      {franchise.brand_name && <p style={{ fontSize: 16, fontWeight: 700, color: '#1a1a2e', margin: '0 0 16px' }}>{franchise.brand_name}</p>}

      {rows.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, marginBottom: 16 }}>
          {rows.map(([label, value]) => (
            <div key={label} style={{ background: '#fff', border: '1px solid #eee7d8', borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: '#8a7a4f', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 14.5, fontWeight: 600, color: '#1a1a2e' }}>{value}</div>
            </div>
          ))}
        </div>
      )}

      {franchise.training_support && (
        <div style={{ fontSize: 14, lineHeight: 1.6, color: '#4b5563', marginBottom: 14 }}>
          <strong style={{ color: '#1a1a2e' }}>Training & support:</strong> {franchise.training_support}
        </div>
      )}

      {franchise.has_item19 && (
        <div style={{ borderTop: '1px dashed #e0d8c2', paddingTop: 16, marginTop: 4 }}>
          <div style={{ fontSize: 13.5, color: '#4b5563', marginBottom: 10 }}>
            <strong>Item 19 — Financial Performance Representation</strong> (optional disclosure). Available to qualified buyers who have signed the
            Confidentiality &amp; Registration Agreement (NDA) for this listing.
          </div>
          {!showNda ? (
            <button type="button" className="btn" onClick={unlockItem19} disabled={unlocking} style={{ background: '#1a1a2e', color: '#fff' }}>
              {unlocking ? 'Working…' : item19Unlocked ? '🔓 Item 19 unlocked — view again' : '🔒 Unlock Item 19 (NDA)'}
            </button>
          ) : (
            <div style={{ background: '#fff', border: '1px solid #e5e0d2', borderRadius: 12, padding: 18 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#1a1a2e', marginBottom: 6 }}>Confidentiality &amp; Registration Agreement</div>
              <p style={{ fontSize: 13, color: '#4b5563', margin: '0 0 12px', lineHeight: 1.55 }}>
                Complete the NDA to unlock this listing&apos;s Item 19 disclosure. Your details stay confidential and are shared only with the listing&apos;s broker.
              </p>
              <input className="input" placeholder="Full legal name" aria-label="Full legal name" value={ndaForm.name} onChange={(e) => setNdaForm({ ...ndaForm, name: e.target.value })} style={{ marginBottom: 8 }} />
              <input className="input" placeholder="Email address" aria-label="Email address" type="email" value={ndaForm.email} onChange={(e) => setNdaForm({ ...ndaForm, email: e.target.value })} style={{ marginBottom: 10 }} />
              <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12.5, color: '#4b5563', lineHeight: 1.5, marginBottom: 12 }}>
                <input type="checkbox" checked={ndaForm.guideAcknowledged} onChange={(e) => setNdaForm({ ...ndaForm, guideAcknowledged: e.target.checked })} style={{ marginTop: 2 }} />
                <span>I have read the Buyer Forms Overview &amp; Confidentiality Guide and agree to the NDA terms.</span>
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn" onClick={submitNda} disabled={unlocking} style={{ background: '#1a1a2e', color: '#fff' }}>{unlocking ? 'Signing…' : 'Sign NDA & unlock'}</button>
                <button type="button" className="btn btn-ghost" onClick={() => setShowNda(false)}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

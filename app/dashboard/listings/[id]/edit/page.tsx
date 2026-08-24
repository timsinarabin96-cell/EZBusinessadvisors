'use client'

// ---------------------------------------------------------------------------
// /dashboard/listings/[id]/edit — Edit a listing's core details.
// For the guided workflow, agents add financials/docs in the workflow; this
// page handles the marketing/details fields.
// ---------------------------------------------------------------------------

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import AppShell from '@/components/layout/AppShell'
import { ToastProvider, useToast } from '@/components/ui/Toast'
import { fetchListing, updateListing } from '@/lib/listings'
import StatusBadge from '@/components/listings/StatusBadge'
import FeaturedSlotCard from '@/components/listing/FeaturedSlotCard'
import PublishPanel from '@/components/listing/PublishPanel'
import ListingViewStats from '@/components/listing/ListingViewStats'
import ListingVideo from '@/components/listings/ListingVideo'

const numOrNull = (s: string): number | null => (s === '' ? null : Number(s))

export default function EditListingPage() {
  return (
    <AppShell active="Listings">
      <ToastProvider>
        <div style={{ maxWidth: 680, margin: '0 auto' }}>
          <EditForm />
        </div>
      </ToastProvider>
    </AppShell>
  )
}

function EditForm() {
  const params = useParams()
  const router = useRouter()
  const toast = useToast()
  const listingId = String(params.id || '')
  const [form, setForm] = useState<any>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetchListing(listingId).then((l) => {
      if (l) setForm({
        business_name: l.business_name || '', headline: l.headline || '', industry: l.industry || '',
        location_general: l.location_general || '', description: l.description || '',
        asking_price: l.asking_price ?? '', annual_revenue: l.annual_revenue ?? '', sde: l.sde ?? '',
        ebitda: l.ebitda ?? '', reason_for_sale: l.reason_for_sale || '', real_estate_included: !!l.real_estate_included,
        sba_qualified: !!l.sba_qualified, is_off_market: !!l.is_off_market,
        video_url: (l.ai_metadata as any)?.video_url || '',
      })
    })
  }, [listingId])

  if (!form) return <div style={{ padding: 60, textAlign: 'center', color: 'var(--muted)' }}>Loading…</div>

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      await updateListing(listingId, {
        business_name: form.business_name, headline: form.headline || null, industry: form.industry || null,
        location_general: form.location_general || null, description: form.description || null,
        asking_price: numOrNull(form.asking_price), annual_revenue: numOrNull(form.annual_revenue),
        sde: numOrNull(form.sde), ebitda: numOrNull(form.ebitda),
        reason_for_sale: form.reason_for_sale || null, real_estate_included: form.real_estate_included,
        sba_qualified: form.sba_qualified, is_off_market: form.is_off_market,
        ai_metadata: { ...((await fetchListing(listingId))?.ai_metadata || {}), video_url: form.video_url?.trim() || null },
      })
      // Save = go live. Fire the publish pipeline (flags premature/unwanted listings automatically).
      const res = await fetch('/api/listings/publish', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingId, force: true }),
      })
      const j = await res.json()
      if (j.ok && j.published) {
        toast(j.flagged ? 'Saved + live on the website (flagged for review) 🚩' : 'Saved + live on the website 🚀', 'success')
      } else if (j.ok && j.scheduled) {
        toast('Saved — scheduled to go live', 'success')
      } else {
        toast(j.error || 'Listing saved, but publish needs attention', 'error')
      }
      router.push(`/dashboard/listings/${listingId}/workflow`)
    } catch (err: any) { toast(err.message || 'Save failed', 'error'); setBusy(false) }
  }

  const inp = (k: string, label: string, ph: string, type = 'text') => (
    <label style={lbl}>{label}<input type={type} value={form[k] ?? ''} onChange={(e) => set(k, type === 'number' ? e.target.value : e.target.value)} placeholder={ph} style={fld} /></label>
  )

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
        <button onClick={() => router.push(`/dashboard/listings/${listingId}/workflow`)} style={{ border: 'none', background: 'transparent', fontSize: 20, cursor: 'pointer', color: 'var(--navy)' }}>←</button>
        <h1 style={{ margin: 0, fontSize: 24, fontFamily: 'Georgia, serif', color: 'var(--navy)' }}>Edit Listing</h1>
      </div>
      <p style={{ color: 'var(--muted)', marginBottom: 20 }}>Update the marketing and deal details. Financial recasting lives in the workflow.</p>

      <div style={{ padding: '24px 28px', background: '#fff', border: '1px solid var(--line)', borderRadius: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }} className="wf-grid-2">
          <div style={{ gridColumn: '1 / -1' }}>{inp('business_name', 'Business name *', 'Business name')}</div>
          {inp('headline', 'Headline', 'Short marketing line')}
          {inp('industry', 'Industry', 'e.g. Landscaping')}
          {inp('location_general', 'Location', 'e.g. Charlotte, NC')}
          {inp('asking_price', 'Asking price ($)', '0', 'number')}
          {inp('annual_revenue', 'Annual revenue ($)', '0', 'number')}
          {inp('sde', 'SDE ($)', '0', 'number')}
          {inp('ebitda', 'EBITDA ($)', '0', 'number')}
          {inp('reason_for_sale', 'Reason for sale', 'Reason')}
        </div>
        <div style={{ gridColumn: '1 / -1', marginBottom: 14 }}>
          <label style={lbl}>Description
            <textarea value={form.description || ''} onChange={(e) => set('description', e.target.value)} rows={3} placeholder="Describe the business…" style={{ ...fld, resize: 'vertical' }} />
          </label>
        </div>
        <div style={{ gridColumn: '1 / -1', marginBottom: 14 }}>
          <label style={lbl}>Walkthrough / promo video URL (YouTube, Vimeo, or .mp4)
            <input value={form.video_url || ''} onChange={(e) => set('video_url', e.target.value)} placeholder="https://youtube.com/watch?v=… or https://…/walkthrough.mp4" style={fld} />
          </label>
          {form.video_url?.trim() ? <ListingVideo url={form.video_url} title={form.business_name} style={{ maxWidth: 560 }} /> : null}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
          <input type="checkbox" checked={form.real_estate_included} onChange={(e) => set('real_estate_included', e.target.checked)} style={{ width: 16, height: 16 }} />
          <label style={{ fontSize: 13.5, color: 'var(--ink)', cursor: 'pointer' }}>Real estate included in sale</label>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
          <input type="checkbox" checked={form.sba_qualified} onChange={(e) => set('sba_qualified', e.target.checked)} style={{ width: 16, height: 16 }} />
          <label style={{ fontSize: 13.5, color: 'var(--ink)', cursor: 'pointer' }}>🏦 SBA qualified — shows the SBA badge on the website</label>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
          <input type="checkbox" checked={form.is_off_market} onChange={(e) => set('is_off_market', e.target.checked)} style={{ width: 16, height: 16 }} />
          <label style={{ fontSize: 13.5, color: 'var(--ink)', cursor: 'pointer' }}>🤫 Off-market / pocket listing — hidden from public browse, shown only in the pocket listings section</label>
        </div>

        {/* Listing traction — views analytics for the seller/broker */}
        {listingId && (
          <div style={{ marginTop: 26, background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 22 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 18 }}>📊</span>
              <span style={{ fontWeight: 800, color: 'var(--navy)', fontSize: 15 }}>Listing traction</span>
              <span style={{ fontSize: 11.5, color: 'var(--muted)', marginLeft: 4 }}>— how many people are viewing this listing</span>
            </div>
            <ListingViewStats listingId={listingId} />
          </div>
        )}

        {/* Featured placement purchase */}
        {listingId && (
          <div style={{ marginTop: 26 }}>
            <FeaturedSlotCard listingId={listingId} businessName={form?.business_name} />
          </div>
        )}

        {/* Publish to marketplace (quality gate + blast) */}
        {listingId && (
          <div style={{ marginTop: 26 }}>
            <PublishPanel listingId={listingId} businessName={form?.business_name} />
          </div>
        )}

        {/* Save = go live — button is always the last element */}
        <div style={{ marginTop: 28, paddingTop: 20, borderTop: '1px solid var(--line)' }}>
          <button onClick={save} disabled={busy} style={{ width: '100%', padding: '14px 26px', background: 'var(--navy)', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 800, fontSize: 15, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>
            {busy ? 'Saving + going live…' : '💾 Save & Go Live'}
          </button>
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--muted)', textAlign: 'center' }}>
            Save pushes your edits live on the website instantly. Premature or incomplete listings are auto-flagged for review.
          </div>
        </div>
      </div>
    </div>
  )
}

const lbl: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12.5, fontWeight: 600, color: 'var(--muted)', marginBottom: 14 }
const fld: React.CSSProperties = { padding: '11px 12px', borderRadius: 8, border: '1px solid var(--line)', fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box', width: '100%' }

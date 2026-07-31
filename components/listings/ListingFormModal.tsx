'use client'

import { useState } from 'react'
import { Listing, LISTING_STATUSES } from '@/lib/listings'

interface ListingFormModalProps {
  listing: Listing | null
  onClose: () => void
  onSubmit: (input: Partial<Listing>) => Promise<void>
}

interface FormState {
  business_name: string
  headline: string
  industry: string
  location_general: string
  description: string
  asking_price: string
  annual_revenue: string
  sde: string
  ebitda: string
  reason_for_sale: string
  status: string
  real_estate_included: boolean
}

const numOrNull = (s: string): number | null => (s === '' ? null : Number(s))

export default function ListingFormModal({ listing, onClose, onSubmit }: ListingFormModalProps) {
  const [form, setForm] = useState<FormState>({
    business_name: listing?.business_name || '',
    headline: listing?.headline || '',
    industry: listing?.industry || '',
    location_general: listing?.location_general || '',
    description: listing?.description || '',
    asking_price: listing?.asking_price ? String(listing.asking_price) : '',
    annual_revenue: listing?.annual_revenue ? String(listing.annual_revenue) : '',
    sde: listing?.sde ? String(listing.sde) : '',
    ebitda: listing?.ebitda ? String(listing.ebitda) : '',
    reason_for_sale: listing?.reason_for_sale || '',
    status: listing?.status || 'active',
    real_estate_included: listing?.real_estate_included || false,
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.business_name.trim()) { setError('Business name is required'); return }
    setSubmitting(true)
    setError('')
    try {
      await onSubmit({
        business_name: form.business_name,
        headline: form.headline || null,
        industry: form.industry || null,
        location_general: form.location_general || null,
        description: form.description || null,
        asking_price: numOrNull(form.asking_price),
        annual_revenue: numOrNull(form.annual_revenue),
        sde: numOrNull(form.sde),
        ebitda: numOrNull(form.ebitda),
        reason_for_sale: form.reason_for_sale || null,
        status: form.status,
        real_estate_included: form.real_estate_included,
      })
    } catch (err: any) {
      setError(err.message || 'Failed to save listing')
      setSubmitting(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(26,26,46,0.55)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '30px 16px', overflowY: 'auto' }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 12, maxWidth: 640, width: '100%', padding: 26, maxHeight: '92vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 20, color: 'var(--navy)' }}>{listing ? 'Edit Listing' : 'New Listing'}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--muted)' }}>✕</button>
        </div>

        {error && <div style={{ background: '#fee2e2', color: '#b91c1c', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 14 }}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <label className="label">Business Name *</label>
              <input className="input" value={form.business_name} onChange={(e) => set('business_name', e.target.value)} />
            </div>
            <div>
              <label className="label">Industry</label>
              <input className="input" value={form.industry} onChange={(e) => set('industry', e.target.value)} placeholder="e.g. Business Services" />
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label className="label">Headline</label>
            <input className="input" value={form.headline} onChange={(e) => set('headline', e.target.value)} placeholder="Short confidential headline" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <label className="label">Location</label>
              <input className="input" value={form.location_general} onChange={(e) => set('location_general', e.target.value)} placeholder="e.g. Charlotte, NC" />
            </div>
            <div>
              <label className="label">Status</label>
              <select className="select" value={form.status} onChange={(e) => set('status', e.target.value)}>
                {LISTING_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label className="label">Description</label>
            <textarea className="textarea" rows={4} value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Business overview for the CIM executive summary..." />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <label className="label">Asking Price</label>
              <input className="input" type="number" value={form.asking_price} onChange={(e) => set('asking_price', e.target.value)} />
            </div>
            <div>
              <label className="label">Revenue</label>
              <input className="input" type="number" value={form.annual_revenue} onChange={(e) => set('annual_revenue', e.target.value)} />
            </div>
            <div>
              <label className="label">SDE</label>
              <input className="input" type="number" value={form.sde} onChange={(e) => set('sde', e.target.value)} />
            </div>
            <div>
              <label className="label">EBITDA</label>
              <input className="input" type="number" value={form.ebitda} onChange={(e) => set('ebitda', e.target.value)} />
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label className="label">Reason for Sale</label>
            <input className="input" value={form.reason_for_sale} onChange={(e) => set('reason_for_sale', e.target.value)} placeholder="e.g. Owner retirement" />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <input type="checkbox" checked={form.real_estate_included} onChange={(e) => set('real_estate_included', e.target.checked)} />
            <label style={{ fontSize: 14, color: 'var(--text)' }}>Real estate included in sale</label>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Saving...' : listing ? 'Save Changes' : 'Create Listing'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

'use client'

import { useState } from 'react'
import { capturePublicLead, type PublicMarketplaceListing } from '@/lib/marketplace'
import { ToastProvider, useToast } from '@/components/ui/Toast'
import { fmt$ } from '@/lib/recast'
import NdaFinancialsGate from '@/components/public/NdaFinancialsGate'
import SbaCalculator from '@/components/public/SbaCalculator'

export default function ListingDetailInteractive({ listing }: { listing: PublicMarketplaceListing }) {
  const toast = useToast()
  const [activeImage, setActiveImage] = useState(0)
  const [showContact, setShowContact] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', phone: '', message: '' })
  const [submitting, setSubmitting] = useState(false)
  const sdeMultiple = listing.sde && listing.asking_price ? listing.asking_price / listing.sde : null

  const submitLead = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!form.name.trim() || !form.email.trim()) {
      toast('Name and email are required', 'error')
      return
    }

    setSubmitting(true)
    const result = await capturePublicLead({
      kind: 'buyer',
      name: form.name,
      email: form.email,
      phone: form.phone || undefined,
      source: 'listing_detail',
      message: form.message || `Interested in: ${listing.public_title}`,
      listing_id: listing.id,
    })
    setSubmitting(false)

    if (result.ok) {
      toast(`Request sent — a broker will contact you about ${listing.public_title}.`, 'success')
      setShowContact(false)
      setForm({ name: '', email: '', phone: '', message: '' })
    } else {
      toast(result.error || 'Submission failed', 'error')
    }
  }

  return (
    <ToastProvider>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(280px, 1fr)', gap: 24, alignItems: 'start' }}>
        <div>
          {listing.gallery_urls.length > 0 ? (
            <div style={{ background: '#fff', border: '1px solid #ece8dc', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ height: 420, background: '#1a1a2e', position: 'relative' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={listing.gallery_urls[activeImage]} alt={listing.public_title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
              {listing.gallery_urls.length > 1 && (
                <div style={{ display: 'flex', gap: 8, padding: 12 }}>
                  {listing.gallery_urls.map((image, index) => (
                    <button key={image} onClick={() => setActiveImage(index)} aria-label={`View image ${index + 1}`} style={{ width: 60, height: 45, padding: 0, cursor: 'pointer', border: activeImage === index ? '2px solid #c9a84c' : '2px solid transparent', borderRadius: 6, overflow: 'hidden', background: '#1a1a2e' }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div style={{ height: 420, background: 'linear-gradient(135deg,#1a1a2e,#26264a)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(201,168,76,0.5)', fontSize: 60 }}>🏢</div>
          )}

          <div style={{ background: '#fff', border: '1px solid #ece8dc', borderRadius: 12, padding: 28, marginTop: 20 }}>
            <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 22, color: '#1a1a2e', margin: '0 0 14px' }}>Opportunity Overview</h2>
            <p style={{ color: '#555', fontSize: 15, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
              {listing.public_summary || 'A confidential, established business opportunity. Additional information is available to qualified buyers after broker review and required confidentiality steps.'}
            </p>
            {listing.public_highlights.length > 0 && (
              <div style={{ marginTop: 22 }}>
                <h3 style={{ fontFamily: 'Georgia, serif', fontSize: 17, color: '#1a1a2e', marginBottom: 10 }}>Highlights</h3>
                <ul style={{ margin: 0, paddingLeft: 20, color: '#555', lineHeight: 1.8 }}>
                  {listing.public_highlights.map((highlight) => <li key={highlight}>{highlight}</li>)}
                </ul>
              </div>
            )}
            <div style={{ marginTop: 20, background: '#faf9f4', padding: 16, borderRadius: 8, color: '#666', fontSize: 13, lineHeight: 1.6 }}>
              Confidential information, exact location, identifying details, and supporting documents are released only through the approved buyer qualification and NDA process.
            </div>
          </div>
        </div>

        <aside style={{ position: 'sticky', top: 24 }}>
          <div style={{ background: '#fff', border: '1px solid #ece8dc', borderRadius: 12, padding: 22 }}>
            <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 20, color: '#1a1a2e', margin: '0 0 16px' }}>Financial Snapshot</h2>
            {listing.show_financials ? (
              <>
                <Metric label="Asking Price" value={listing.asking_price !== null ? fmt$(listing.asking_price) : 'Upon Request'} />
                {listing.annual_revenue !== null && <Metric label="Annual Revenue" value={fmt$(listing.annual_revenue)} />}
                {listing.sde !== null && <Metric label="Seller's Discretionary Earnings" value={fmt$(listing.sde)} />}
                {listing.ebitda !== null && <Metric label="EBITDA" value={fmt$(listing.ebitda)} />}
                {sdeMultiple !== null && <Metric label="Asking / SDE" value={`${sdeMultiple.toFixed(2)}×`} />}
                <div style={{ marginTop: 14 }}>
                  <SbaCalculator askingPrice={listing.asking_price} />
                </div>
              </>
            ) : (
              <NdaFinancialsGate listing={listing} askingPrice={listing.asking_price} />
            )}

            <button onClick={() => setShowContact((current) => !current)} style={{ width: '100%', marginTop: 16, background: '#c9a84c', color: '#1a1a2e', border: 'none', borderRadius: 7, padding: '13px 16px', fontWeight: 800, cursor: 'pointer', fontFamily: 'Georgia, serif' }}>
              Request Confidential Details
            </button>

            {showContact && (
              <form onSubmit={submitLead} style={{ marginTop: 18, display: 'grid', gap: 10 }}>
                <input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Full name" style={inputStyle} />
                <input required type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="Email" style={inputStyle} />
                <input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="Phone" style={inputStyle} />
                <textarea value={form.message} onChange={(event) => setForm({ ...form, message: event.target.value })} placeholder="Tell us about your acquisition goals" rows={4} style={{ ...inputStyle, resize: 'vertical' }} />
                <button disabled={submitting} type="submit" style={{ background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: 7, padding: 12, fontWeight: 700, cursor: submitting ? 'wait' : 'pointer' }}>
                  {submitting ? 'Sending…' : 'Submit Request'}
                </button>
              </form>
            )}
          </div>
        </aside>
      </div>
    </ToastProvider>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '11px 0', borderBottom: '1px solid #eee9dc' }}>
      <span style={{ color: '#777', fontSize: 13 }}>{label}</span>
      <span style={{ color: '#1a1a2e', fontSize: 14, fontWeight: 800, textAlign: 'right' }}>{value}</span>
    </div>
  )
}

const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '11px 12px', border: '1px solid #d8d2c2', borderRadius: 6, fontSize: 14, fontFamily: 'Georgia, serif', outline: 'none', background: '#fff' }

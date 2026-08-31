/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useEffect, useState } from 'react'
import { capturePublicLead, type PublicMarketplaceListing } from '@/lib/marketplace'
import { ToastProvider, useToast } from '@/components/ui/Toast'
import { fmt$ } from '@/lib/recast'
import { priceTeaser, PRICING_CTA, PRICING_HINT } from '@/lib/pricingPolicy'
import { listingImageFor, placeholderImageFor } from '@/lib/stockImages'
import { trackListingView } from '@/lib/visitorIntent'
import { formatWithCommas } from '@/components/ui/MoneyInput'
import NdaFinancialsGate from '@/components/public/NdaFinancialsGate'
import SbaCalculator from '@/components/public/SbaCalculator'
import RequestPricingForm from '@/components/public/RequestPricingForm'

export default function ListingDetailInteractive({ listing, agencyLegalName }: { listing: PublicMarketplaceListing; agencyLegalName?: string }) {
  const toast = useToast()
  const [activeImage, setActiveImage] = useState(0)
  const [showContact, setShowContact] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', phone: '', message: '' })
  const [submitting, setSubmitting] = useState(false)
  const [showOffer, setShowOffer] = useState(false)
  const [offerForm, setOfferForm] = useState({ name: '', email: '', phone: '', amount: '', financing: 'cash', timeline: '' })
  const [offerBusy, setOfferBusy] = useState(false)
  const [offerDone, setOfferDone] = useState(false)
  const [watching, setWatching] = useState(false)
  const [watchEmail, setWatchEmail] = useState('')
  const [watchDone, setWatchDone] = useState(false)
  const [watchBusy, setWatchBusy] = useState(false)
  const [heroFailed, setHeroFailed] = useState(false)
  const sdeMultiple = listing.sde && listing.asking_price ? listing.asking_price / listing.sde : null

  // Anonymous view tracking — fire-and-forget; never blocks the page.
  useEffect(() => {
    trackListingView(listing.id, document.referrer)
    // Recently-viewed history (localStorage, max 8) for the marketplace strip.
    try {
      const prev = JSON.parse(localStorage.getItem('concord-recent') || '[]')
      const entry = {
        id: listing.id,
        title: listing.public_title,
        price: listing.asking_price,
        industry: listing.industry,
        // Store the best available image (gallery photo, else industry stock
        // photo, else null) so the recently-viewed strip always has a picture.
        image: listingImageFor(listing.gallery_urls, listing.industry, { title: listing.public_title, price: listing.asking_price ?? undefined, subIndustry: listing.sub_industry }),
        slug: listing.slug || listing.id,
        at: Date.now(),
      }
      const next = [entry, ...prev.filter((p: any) => p.id !== listing.id)].slice(0, 8)
      localStorage.setItem('concord-recent', JSON.stringify(next))
    } catch { /* ignore */ }
  }, [listing.id, listing.public_title, listing.asking_price, listing.industry, listing.gallery_urls, listing.slug])

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

    // Notify the listing's owner/broker the moment interest lands.
    if (result.ok) {
      fetch('/api/notify/buyer-interest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listing_id: listing.id, name: form.name, email: form.email, message: form.message || '' }),
      }).catch(() => {})
    }

    setSubmitting(false)

    if (result.ok) {
      if (result.duplicate) {
        toast(`You\'re already in our system — a broker will contact you about ${listing.public_title}.`, 'success')
      } else {
        toast(`Request sent — a broker will contact you about ${listing.public_title}.`, 'success')
      }
      setShowContact(false)
      setForm({ name: '', email: '', phone: '', message: '' })
    } else {
      toast(result.error || 'Submission failed', 'error')
    }
  }

  const submitOffer = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!offerForm.name.trim() || !offerForm.email.trim() || !offerForm.amount) {
      toast('Name, email, and offer amount are required', 'error')
      return
    }
    setOfferBusy(true)
    try {
      const res = await fetch('/api/public/offer', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listingId: listing.id,
          name: offerForm.name,
          email: offerForm.email,
          phone: offerForm.phone,
          offerAmount: Number(String(offerForm.amount).replace(/[$,]/g, '')),
          financing: offerForm.financing,
          timeline: offerForm.timeline,
        }),
      })
      const j = await res.json()
      if (!j.ok) throw new Error(j.error || 'Offer failed')
      setOfferDone(true)
      toast('Offer submitted — the broker will contact you! 🎉', 'success')
    } catch (err: any) {
      toast(err.message || 'Offer failed', 'error')
    } finally {
      setOfferBusy(false)
    }
  }

  const watchListing = async () => {
    if (!watchEmail.trim() || !watchEmail.includes('@')) {
      toast('Enter a valid email to watch this listing', 'error')
      return
    }
    setWatchBusy(true)
    try {
      const res = await fetch('/api/public/offer', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ watch: true, listingId: listing.id, email: watchEmail }),
      })
      const j = await res.json()
      if (!j.ok) throw new Error(j.error || 'Failed')
      setWatchDone(true)
      toast('Watching! You\'ll get an email if the price drops 🔔', 'success')
    } catch (err: any) {
      toast(err.message || 'Failed to watch', 'error')
    } finally {
      setWatchBusy(false)
    }
  }

  // Click-to-call tracking (rate-limited server-side) + tel: link.
  const trackCall = async () => {
    try {
      await fetch('/api/listings/call-click', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingId: listing.id }),
      })
    } catch { /* tracking is best-effort */ }
  }

  const contactPhone = (listing as { contact_phone?: string | null }).contact_phone || null
  const placeholderSrc = listingImageFor(listing.gallery_urls, listing.industry, { title: listing.public_title, price: listing.asking_price ?? undefined, subIndustry: listing.sub_industry }) ?? placeholderImageFor({ title: listing.public_title, industry: listing.industry, price: listing.asking_price ?? undefined })
  // Branded fallback lives on our own domain, so it always loads even when an
  // external stock-photo CDN (e.g. Unsplash) is slow or blocked on the buyer's
  // network — the hero never shows a black void.
  const heroFallback = placeholderImageFor({ title: listing.public_title, industry: listing.industry, price: listing.asking_price ?? undefined })
  const heroSrc = heroFailed ? heroFallback : placeholderSrc

  return (
    <ToastProvider>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        {/* Status banner + key facts strip */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
          {listing.status === 'active' && <span style={{ background: '#1e7e34', color: '#fff', padding: '6px 14px', borderRadius: 99, fontSize: 12.5, fontWeight: 800 }}>● Active — taking offers</span>}
          {listing.status === 'under_contract' && <span style={{ background: '#b45309', color: '#fff', padding: '6px 14px', borderRadius: 99, fontSize: 12.5, fontWeight: 800 }}>Under Contract</span>}
          {listing.status === 'sold' && <span style={{ background: '#7b8794', color: '#fff', padding: '6px 14px', borderRadius: 99, fontSize: 12.5, fontWeight: 800 }}>✅ Sold</span>}
          {listing.vetted && <span style={{ background: '#0e7490', color: '#fff', padding: '6px 14px', borderRadius: 99, fontSize: 12.5, fontWeight: 800 }}>🏅 Vetted</span>}
          {listing.sba_qualified === true && <span style={{ background: '#0e7490', color: '#fff', padding: '6px 14px', borderRadius: 99, fontSize: 12.5, fontWeight: 800 }}>🏦 SBA Qualified</span>}
          {listing.sba_qualified === false && <span style={{ background: '#64748b', color: '#fff', padding: '6px 14px', borderRadius: 99, fontSize: 12.5, fontWeight: 800 }}>Not SBA Qualified</span>}
          {listing.seller_verified && <span style={{ background: '#0e7490', color: '#fff', padding: '6px 14px', borderRadius: 99, fontSize: 12.5, fontWeight: 800 }}>🛡️ Identity Verified Seller</span>}
          {listing.bov_on_file && <span style={{ background: '#7c3aed', color: '#fff', padding: '6px 14px', borderRadius: 99, fontSize: 12.5, fontWeight: 800 }}>📊 BOV on file</span>}
          {listing.revenue_verified && <span style={{ background: '#1e7e34', color: '#fff', padding: '6px 14px', borderRadius: 99, fontSize: 12.5, fontWeight: 800 }}>✅ Verified Revenue</span>}
          {listing.trust_label === 'AI-Verified Financials' && <span style={{ background: '#1e7e34', color: '#fff', padding: '6px 14px', borderRadius: 99, fontSize: 12.5, fontWeight: 800 }}>🤖 AI-Verified Financials</span>}
          {listing.trust_label === 'Self-Reported' && <span style={{ background: '#b45309', color: '#fff', padding: '6px 14px', borderRadius: 99, fontSize: 12.5, fontWeight: 800 }}>📝 Self-Reported — unaudited</span>}
        </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(min(280px, 100%), 1fr)', gap: 24, alignItems: 'start' }}>
        <div>
          {listing.gallery_urls.length > 0 ? (
            <div className="glass-light lift" style={{ overflow: 'hidden' }}>
              <div style={{ height: 420, background: '#1a1a2e', position: 'relative' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={listing.gallery_urls[activeImage]} alt={listing.public_title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />                {listing.gallery_urls.length > 1 && (
                  <>
                    <button
                      onClick={() => setActiveImage((activeImage - 1 + listing.gallery_urls.length) % listing.gallery_urls.length)}
                      aria-label="Previous image"
                      style={{
                        position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
                        background: 'rgba(26,26,46,0.65)', color: '#fff', border: 'none', borderRadius: '50%',
                        width: 42, height: 42, fontSize: 20, cursor: 'pointer', lineHeight: 1,
                      }}
                    >
                      ‹
                    </button>
                    <button
                      onClick={() => setActiveImage((activeImage + 1) % listing.gallery_urls.length)}
                      aria-label="Next image"
                      style={{
                        position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                        background: 'rgba(26,26,46,0.65)', color: '#fff', border: 'none', borderRadius: '50%',
                        width: 42, height: 42, fontSize: 20, cursor: 'pointer', lineHeight: 1,
                      }}
                    >
                      ›
                    </button>
                    <span style={{ position: 'absolute', bottom: 12, right: 12, background: 'rgba(26,26,46,0.7)', color: '#fff', borderRadius: 99, padding: '4px 10px', fontSize: 12, fontWeight: 700 }}>
                      {activeImage + 1} / {listing.gallery_urls.length}
                    </span>
                  </>
                )}
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
            // Real industry stock photo (or branded placeholder) when the listing has no photos.
            <div style={{ height: 420, borderRadius: 12, overflow: 'hidden', position: 'relative', background: 'linear-gradient(135deg,#1a1a2e,#0f3460)' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={heroSrc} alt={listing.public_title} onError={() => setHeroFailed(true)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
          )}

          <div className="glass-light lift" style={{ padding: 28, marginTop: 20 }}>
            <h2 className="display-title" style={{ fontSize: 22, color: '#1a1a2e', margin: '0 0 14px' }}>Opportunity Overview</h2>
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

          {/* EVERYTHING A BUYER NEEDS — operations & deal facts (no confidential data) */}
          <div className="glass-light lift" style={{ padding: 28, marginTop: 20 }}>
            <h2 className="display-title" style={{ fontSize: 22, color: '#1a1a2e', margin: '0 0 16px' }}>Everything You Need to Know</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(220px, 100%), 1fr))', gap: 12 }}>
              {listing.established_year != null && <Fact icon="📅" label="Established" value={String(listing.established_year)} />}
              {listing.employees_full_time != null && <Fact icon="👥" label="Full-time employees" value={String(listing.employees_full_time)} />}
              {listing.is_absentee_owner != null && <Fact icon="🏖️" label="Owner involvement" value={listing.is_absentee_owner ? 'Absentee — owner not required' : 'Owner-operated'} />}
              {listing.is_franchise != null && <Fact icon="🏷️" label="Franchise" value={listing.is_franchise ? 'Yes — franchise' : 'Independent business'} />}
              {listing.is_relocatable != null && <Fact icon="📦" label="Relocatable" value={listing.is_relocatable ? 'Yes — can relocate' : 'Stays in place'} />}
              {listing.seller_financing_available != null && <Fact icon="💰" label="Seller financing" value={listing.seller_financing_available ? 'Available' : 'Not offered'} />}
              {listing.sba_qualified != null && <Fact icon="🏦" label="SBA financing" value={listing.sba_qualified ? 'Qualified' : 'Not qualified'} />}
              {listing.location_general && <Fact icon="📍" label="Region" value={listing.location_general} />}
              {listing.industry && <Fact icon="🏭" label="Industry" value={listing.industry} />}
              {listing.sub_industry && <Fact icon="🗂️" label="Sub-industry" value={listing.sub_industry} />}
            </div>
            <div style={{ marginTop: 18, padding: 14, background: '#f0f7fa', border: '1px solid #cfe6ef', borderRadius: 8, fontSize: 13, color: '#0e7490', lineHeight: 1.6 }}>
              🔒 <strong>Exact name, address, and financial statements are released after you qualify</strong> — click “Request Confidential Details” and the listing broker will reach out directly. No spam, no obligation.
            </div>
          </div>
        </div>

        <aside style={{ position: 'sticky', top: 24 }}>
          <div className="glass-light lift" style={{ padding: 22 }}>
            <h2 className="display-title" style={{ fontSize: 20, color: '#1a1a2e', margin: '0 0 16px' }}>Financial Snapshot</h2>
            {listing.show_financials ? (
              <>
                {/* BUSINESS MATERIALS — exact price only after qualification */}
                <Metric label="Asking Price" value={listing.asking_price !== null ? fmt$(listing.asking_price) : '—'} />
                {listing.annual_revenue !== null && <Metric label="Annual Revenue" value={fmt$(listing.annual_revenue)} />}
                {listing.sde !== null && <Metric label="Seller's Discretionary Earnings" value={fmt$(listing.sde)} />}
                {listing.ebitda !== null && <Metric label="EBITDA" value={fmt$(listing.ebitda)} />}
                {sdeMultiple !== null && <Metric label="Asking / SDE" value={`${sdeMultiple.toFixed(2)}×`} />}
                <div style={{ marginTop: 14 }}>
                  <SbaCalculator askingPrice={listing.asking_price} />
                </div>
              </>
            ) : (
              <>
                {/* PUBLIC — price hidden per brokerage policy; gate it instead */}
                <div style={{ textAlign: 'center', padding: '18px 8px' }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#c9a84c', fontFamily: 'Georgia, serif', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    {PRICING_CTA}
                  </div>
                  {priceTeaser(listing) && (
                    <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>{priceTeaser(listing)}</div>
                  )}
                  <div style={{ fontSize: 12.5, color: '#64748b', marginTop: 10, lineHeight: 1.5 }}>{PRICING_HINT}</div>
                </div>
                <NdaFinancialsGate listing={listing} askingPrice={null} agencyLegalName={agencyLegalName} />
              </>
            )}

            <div style={{ marginTop: 14 }}>
              <RequestPricingForm listingId={listing.id} listingTitle={listing.public_title} />
            </div>

            <button onClick={() => setShowContact((current) => !current)} className="cta-glow" style={{ width: '100%', justifyContent: 'center', marginTop: 16, borderRadius: 12 }}>
              Request Confidential Details
            </button>
            {contactPhone && (
              <a
                href={`tel:${contactPhone.replace(/[^+\d]/g, '')}`}
                onClick={trackCall}
                style={{ display: 'block', textAlign: 'center', marginTop: 10, background: 'linear-gradient(135deg,#16203f,#0b1020)', color: '#fff', border: '1px solid rgba(201,168,76,0.35)', borderRadius: 12, padding: '13px 16px', fontWeight: 800, cursor: 'pointer', fontFamily: 'var(--font-sans)', textDecoration: 'none', fontSize: 14 }}
              >
                📞 Call the listing line — {contactPhone}
              </a>
            )}

            {/* Make an Offer */}
            {listing.status === 'active' && (
              <>
                <button onClick={() => setShowOffer((o) => !o)} style={{ width: '100%', marginTop: 10, background: 'linear-gradient(135deg,#16203f,#0b1020)', color: '#f0d98c', border: '1px solid rgba(201,168,76,0.4)', borderRadius: 12, padding: '13px 16px', fontWeight: 800, cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 14 }}>
                  💵 Make an Offer
                </button>
                {showOffer && !offerDone && (
                  <form onSubmit={submitOffer} style={{ marginTop: 14, display: 'grid', gap: 10, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 14 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 800, color: '#1a1a2e' }}>Non-binding offer — no obligation</div>
                    <input required value={offerForm.name} onChange={(e) => setOfferForm({ ...offerForm, name: e.target.value })} placeholder="Full name" style={inputStyle} />
                    <input required type="email" value={offerForm.email} onChange={(e) => setOfferForm({ ...offerForm, email: e.target.value })} placeholder="Email" style={inputStyle} />
                    <input value={offerForm.phone} onChange={(e) => setOfferForm({ ...offerForm, phone: e.target.value })} placeholder="Phone" style={inputStyle} />
                    <input required inputMode="decimal" value={offerForm.amount} onChange={(e) => setOfferForm({ ...offerForm, amount: formatWithCommas(e.target.value) })} placeholder="Your offer ($)" style={inputStyle} />
                    <select value={offerForm.financing} onChange={(e) => setOfferForm({ ...offerForm, financing: e.target.value })} style={inputStyle}>
                      <option value="cash">💵 Cash</option>
                      <option value="sba">🏦 SBA loan</option>
                      <option value="seller_financing">🤝 Seller financing</option>
                      <option value="mix">🔀 Combination</option>
                    </select>
                    <input value={offerForm.timeline} onChange={(e) => setOfferForm({ ...offerForm, timeline: e.target.value })} placeholder="Target closing timeline (e.g. 90 days)" style={inputStyle} />
                    <button disabled={offerBusy} type="submit" style={{ background: '#0e7490', color: '#fff', border: 'none', borderRadius: 7, padding: 12, fontWeight: 800, cursor: offerBusy ? 'wait' : 'pointer' }}>
                      {offerBusy ? 'Sending…' : 'Submit Offer'}
                    </button>
                  </form>
                )}
                {offerDone && (
                  <div style={{ marginTop: 12, padding: 12, background: '#eafaf1', border: '1px solid #25d366', borderRadius: 8, fontSize: 13, color: '#128c4b', fontWeight: 700, textAlign: 'center' }}>
                    🎉 Offer submitted! The broker will contact you within one business day.
                  </div>
                )}
              </>
            )}

            {/* Watch for price drop */}
            {listing.status === 'active' && (
              <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                <input
                  value={watchEmail}
                  onChange={(e) => setWatchEmail(e.target.value)}
                  placeholder="Email for price-drop alerts"
                  style={{ ...inputStyle, flex: 1 }}
                />
                <button onClick={watchListing} disabled={watchBusy || watchDone} style={{ padding: '11px 14px', borderRadius: 7, background: watchDone ? '#1e7e34' : '#fff', color: watchDone ? '#fff' : '#1a1a2e', border: '1px solid #d8d2c2', fontWeight: 800, cursor: watchBusy ? 'wait' : 'pointer', fontSize: 13, whiteSpace: 'nowrap' }}>
                  {watchDone ? '✓ Watching' : '🔔 Watch'}
                </button>
              </div>
            )}

            {/* Share this listing */}
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 11.5, color: '#999', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: 8 }}>Share this listing</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <a
                  href={`/flyer/${listing.slug || listing.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Printable one-page flyer"
                  style={{ flex: 1, textAlign: 'center', padding: '9px 0', borderRadius: 8, border: '1px solid #c9a84c', background: '#fdf9ef', color: '#8a6d1a', fontWeight: 800, textDecoration: 'none', fontSize: 13 }}
                >
                  📄 Flyer
                </a>
                <button
                  onClick={() => {
                    const url = window.location.href
                    window.open(`https://wa.me/?text=${encodeURIComponent(listing.public_title + ' — ' + url)}`, '_blank')
                  }}
                  title="Share on WhatsApp"
                  style={{ flex: 1, padding: '9px 0', borderRadius: 8, border: '1px solid #25d366', background: '#eafaf1', color: '#128c4b', fontWeight: 800, cursor: 'pointer', fontSize: 13 }}
                >
                  WhatsApp
                </button>
                <button
                  onClick={() => {
                    const url = window.location.href
                    // Open mailto in a new tab — navigating the current page to
                    // mailto: white-screens browsers with no mail client.
                    window.open(`mailto:?subject=${encodeURIComponent(listing.public_title)}&body=${encodeURIComponent('Check out this business: ' + url)}`, '_blank')
                  }}
                  title="Share by email"
                  style={{ flex: 1, padding: '9px 0', borderRadius: 8, border: '1px solid #d8d2c2', background: '#faf9f4', color: '#1a1a2e', fontWeight: 800, cursor: 'pointer', fontSize: 13 }}
                >
                  ✉️ Email
                </button>
                <button
                  onClick={() => {
                    navigator.clipboard?.writeText(window.location.href)
                    toast('Link copied 📋', 'success')
                  }}
                  title="Copy link"
                  style={{ flex: 1, padding: '9px 0', borderRadius: 8, border: '1px solid #0e7490', background: '#f0f7fa', color: '#0e7490', fontWeight: 800, cursor: 'pointer', fontSize: 13 }}
                >
                  🔗 Copy
                </button>
              </div>
            </div>

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
      </div>
    </ToastProvider>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '11px 0', borderBottom: '1px solid rgba(201,168,76,0.22)' }}>
      <span style={{ color: '#64748b', fontSize: 13 }}>{label}</span>
      <span style={{ color: '#1a1a2e', fontSize: 14, fontWeight: 800, textAlign: 'right' }}>{value}</span>
    </div>
  )
}

function Fact({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="lift" style={{ background: '#faf9f4', border: '1px solid rgba(201,168,76,0.25)', borderRadius: 14, padding: '14px 16px' }}>
      <div style={{ fontSize: 11.5, color: '#b08d35', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 800, marginBottom: 4 }}>{icon}</div>
      <div style={{ fontSize: 11.5, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 14.5, color: '#1a1a2e', fontWeight: 800, marginTop: 3 }}>{value}</div>
    </div>
  )
}

const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '11px 12px', border: '1px solid rgba(201,168,76,0.3)', borderRadius: 10, fontSize: 14, fontFamily: 'var(--font-sans)', outline: 'none', background: '#fff' }

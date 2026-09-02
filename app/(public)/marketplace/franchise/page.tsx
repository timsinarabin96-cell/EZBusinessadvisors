/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

// ---------------------------------------------------------------------------
// FranchiseSellPage — public self-serve checkout for Franchise Opportunities.
// Franchisors submit their brand details + optional Item 19 PDF; the listing
// is created as a draft, then the $299/mo Stripe subscription opens. On
// payment (webhook kind='franchise_listing') the listing AUTO-PUBLISHES
// immediately — no human in the loop. Monthly-only, no setup fee.
// ---------------------------------------------------------------------------

import { useState } from 'react'
import Link from 'next/link'
import { ToastProvider, useToast } from '@/components/ui/Toast'
import { FRANCHISE_MONTHLY } from '@/lib/pricing'
import { formatWithCommas } from '@/components/ui/MoneyInput'

export default function FranchiseSellPage() {
  return (
    <ToastProvider>
      <FranchiseSellContent />
    </ToastProvider>
  )
}

function FranchiseSellContent() {
  const toast = useToast()
  const [form, setForm] = useState({
    email: '',
    brand_name: '',
    industry_category: '',
    total_investment_min: '',
    total_investment_max: '',
    franchise_fee: '',
    royalty_fee_pct: '',
    territories_available: '',
    existing_units: '',
    training_support: '',
    ideal_candidate_liquid_capital: '',
    ideal_candidate_net_worth: '',
  })
  const [item19, setItem19] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [listingUrl, setListingUrl] = useState('')

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm({ ...form, [k]: e.target.value })

  const numOrNull = (v: string) => {
    const n = Number(v.replace(/[$,%]/g, ''))
    return v.trim() && Number.isFinite(n) ? n : null
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) { toast('A valid email is required', 'error'); return }
    if (!form.brand_name.trim()) { toast('Brand name is required', 'error'); return }
    setSubmitting(true)
    try {
      const fd = new FormData()
      fd.set('email', form.email.trim())
      fd.set('brand_name', form.brand_name.trim())
      fd.set('industry_category', form.industry_category.trim())
      if (form.total_investment_min.trim()) fd.set('total_investment_min', String(numOrNull(form.total_investment_min)))
      if (form.total_investment_max.trim()) fd.set('total_investment_max', String(numOrNull(form.total_investment_max)))
      if (form.franchise_fee.trim()) fd.set('franchise_fee', String(numOrNull(form.franchise_fee)))
      if (form.royalty_fee_pct.trim()) fd.set('royalty_fee_pct', String(numOrNull(form.royalty_fee_pct)))
      fd.set('territories_available', form.territories_available.trim())
      if (form.existing_units.trim()) fd.set('existing_units', String(numOrNull(form.existing_units)))
      fd.set('training_support', form.training_support.trim())
      if (form.ideal_candidate_liquid_capital.trim()) fd.set('ideal_candidate_liquid_capital', String(numOrNull(form.ideal_candidate_liquid_capital)))
      if (form.ideal_candidate_net_worth.trim()) fd.set('ideal_candidate_net_worth', String(numOrNull(form.ideal_candidate_net_worth)))
      if (item19) fd.set('item19', item19)

      const res = await fetch('/api/franchise', { method: 'POST', body: fd })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) {
        toast(data.error || 'Submission failed — please try again.', 'error')
        setSubmitting(false)
        return
      }

      const listingId = String(data.listingId || '')
      // Open the $299/mo Stripe subscription — payment auto-publishes.
      const pay = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product: 'franchise_listing',
          listingId,
          email: form.email.trim(),
          successUrl: `${window.location.origin}/marketplace/listings/${listingId}?franchise=success`,
          cancelUrl: `${window.location.origin}/marketplace/franchise`,
        }),
      }).then((r) => r.json().catch(() => ({})))
      if (pay.ok && pay.url) {
        window.location.href = pay.url
        return
      }
      // Demo mode or checkout failure — the draft still exists.
      setListingUrl(`/marketplace/listings/${listingId}`)
      setDone(true)
      toast(data.message || 'Franchise draft created — complete payment to publish.', 'success')
    } catch {
      toast('Network error — please try again.', 'error')
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <div style={{ maxWidth: 720, margin: '60px auto', padding: '0 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 44, marginBottom: 12 }}>🎉</div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, color: '#1a1a2e', margin: '0 0 10px' }}>Franchise draft created</h1>
        <p style={{ color: '#4b5563', fontSize: 15, lineHeight: 1.6, margin: '0 0 20px' }}>
          {listingUrl ? 'Your listing is saved. Complete the $299/month payment to publish it instantly.' : 'Payment is being processed — your listing will auto-publish the moment it clears.'}
        </p>
        {listingUrl && <Link href={listingUrl} style={{ color: '#b8860b', fontWeight: 700, fontSize: 15 }}>View your listing →</Link>}
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 880, margin: '0 auto', padding: '0 24px 72px' }}>
      {/* Hero */}
      <section style={{ background: 'linear-gradient(160deg,#0b1020 0%,#101a38 42%,#0f2a52 100%)', color: '#fff', padding: '40px 28px 44px', margin: '0 -24px 28px', borderRadius: '0 0 18px 18px', position: 'relative', overflow: 'hidden' }}>
        <div className="hero-aurora" />
        <div style={{ position: 'relative' }}>
          <div style={{ fontSize: 12, color: '#c9a84c', fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', marginBottom: 10 }}>Franchise Opportunities</div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(26px, 4vw, 40px)', lineHeight: 1.1, letterSpacing: '-0.03em', margin: '0 0 12px' }}>
            <span className="grad-gold">Advertise your franchise — $299/month</span>
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.78)', fontSize: 15, lineHeight: 1.65, margin: 0, maxWidth: 640 }}>
            Flat monthly rate, no setup fee. Your opportunity goes live in the public marketplace the moment payment clears — zero paperwork, zero waiting.
          </p>
        </div>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 24, alignItems: 'start' }} className="franchise-sell-grid">
        {/* Form */}
        <form onSubmit={submit} className="card" style={{ padding: 28 }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, color: '#1a1a2e', margin: '0 0 6px' }}>Your franchise details</h2>
          <p style={{ fontSize: 13.5, color: '#6b7280', margin: '0 0 20px' }}>Franchises don&apos;t need revenue history — just your brand story and opportunity terms.</p>

          <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#1a1a2e', marginBottom: 6 }}>Brand name *</label>
          <input className="input" value={form.brand_name} onChange={set('brand_name')} placeholder="e.g. FreshBites Kitchen" style={{ marginBottom: 14 }} />

          <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#1a1a2e', marginBottom: 6 }}>Industry / category</label>
          <input className="input" value={form.industry_category} onChange={set('industry_category')} placeholder="e.g. Quick Service Restaurant" style={{ marginBottom: 14 }} />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#1a1a2e', marginBottom: 6 }}>Total investment — min ($)</label>
              <input className="input" value={form.total_investment_min} onChange={set('total_investment_min')} placeholder="150000" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#1a1a2e', marginBottom: 6 }}>Total investment — max ($)</label>
              <input className="input" value={form.total_investment_max} onChange={set('total_investment_max')} placeholder="350000" />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#1a1a2e', marginBottom: 6 }}>Franchise fee ($)</label>
              <input className="input" value={form.franchise_fee} onChange={set('franchise_fee')} placeholder="40000" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#1a1a2e', marginBottom: 6 }}>Royalty fee (% of revenue)</label>
              <input className="input" value={form.royalty_fee_pct} onChange={set('royalty_fee_pct')} placeholder="6" />
            </div>
          </div>

          <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#1a1a2e', marginBottom: 6 }}>Territories available</label>
          <input className="input" value={form.territories_available} onChange={set('territories_available')} placeholder="e.g. Eastern PA, NJ, DE — exclusive territories" style={{ marginBottom: 14 }} />

          <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#1a1a2e', marginBottom: 6 }}>Number of existing units (proof of concept)</label>
          <input className="input" value={form.existing_units} onChange={set('existing_units')} placeholder="e.g. 12" style={{ marginBottom: 14 }} />

          <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#1a1a2e', marginBottom: 6 }}>Training &amp; support provided</label>
          <textarea className="textarea" rows={3} value={form.training_support} onChange={set('training_support')} placeholder="e.g. 4-week onboarding, ongoing field support, marketing toolkit" style={{ marginBottom: 14 }} />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#1a1a2e', marginBottom: 6 }}>Ideal candidate — liquid capital ($)</label>
              <input className="input" value={form.ideal_candidate_liquid_capital} onChange={set('ideal_candidate_liquid_capital')} placeholder="100000" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#1a1a2e', marginBottom: 6 }}>Ideal candidate — net worth ($)</label>
              <input className="input" value={form.ideal_candidate_net_worth} onChange={set('ideal_candidate_net_worth')} placeholder="300000" />
            </div>
          </div>

          <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#1a1a2e', marginBottom: 6 }}>Item 19 — Financial Performance Representation (optional PDF)</label>
          <input type="file" accept="application/pdf" onChange={(e) => setItem19(e.target.files?.[0] || null)} style={{ marginBottom: 6 }} />
          <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 18px' }}>Optional, shown only to buyers who sign the NDA. You remain responsible for its accuracy and for your FDD / FTC and state franchise-disclosure compliance.</p>

          <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#1a1a2e', marginBottom: 6 }}>Your email *</label>
          <input className="input" type="email" value={form.email} onChange={set('email')} placeholder="you@yourbrand.com" style={{ marginBottom: 18 }} />

          <button type="submit" className="btn" disabled={submitting} style={{ width: '100%', padding: '13px 20px', fontSize: 15, background: '#1a1a2e', color: '#fff' }}>
            {submitting ? 'Creating your listing…' : `List my franchise — $${formatWithCommas(String(FRANCHISE_MONTHLY))}/month`}
          </button>
          <p style={{ fontSize: 12, color: '#6b7280', margin: '12px 0 0', lineHeight: 1.55, textAlign: 'center' }}>
            No setup fee. Cancel anytime — the listing unpublishes at the end of the paid period. Platform is the advertising surface only; you own your FDD and franchise-disclosure compliance.
          </p>
        </form>

        {/* Sidebar */}
        <aside className="card" style={{ padding: 22 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#8a7a4f', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>What&apos;s included</div>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 10, fontSize: 13.5, color: '#374151', lineHeight: 1.5 }}>
            <li>✅ Live marketplace listing — visible to every buyer</li>
            <li>✅ Investment range, fees &amp; territory display</li>
            <li>✅ Training &amp; ideal-candidate profile</li>
            <li>✅ Optional Item 19 behind NDA</li>
            <li>✅ Buyer inquiry notifications</li>
            <li>✅ Auto-publish on payment — no review wait</li>
          </ul>
          <div style={{ borderTop: '1px solid #eee7d8', margin: '16px 0 12px', paddingTop: 14 }}>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Flat monthly rate</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#1a1a2e' }}>${formatWithCommas(String(FRANCHISE_MONTHLY))}<span style={{ fontSize: 13, fontWeight: 600, color: '#6b7280' }}>/month</span></div>
          </div>
          <div style={{ fontSize: 11.5, color: '#9ca3af', lineHeight: 1.55 }}>
            The platform is the advertising surface only. Franchisors are responsible for their own Franchise Disclosure Document (FDD) and compliance with FTC and state franchise-disclosure laws.
          </div>
        </aside>
      </div>
    </div>
  )
}

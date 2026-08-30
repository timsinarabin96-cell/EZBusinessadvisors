/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useState } from 'react'
import Link from 'next/link'
import { submitSellerListingOrder } from '@/lib/sellerOrderClient'
import { ToastProvider, useToast } from '@/components/ui/Toast'
import InstantValuation from '@/components/public/InstantValuation'
import SponsoredSlotInline from '@/components/public/SponsoredSlotInline'
import BuyerDemandPanel from '@/components/public/BuyerDemandPanel'
import { OWNER_LISTING_PLANS } from '@/lib/listingIntelligence'
import { VALUATION_PRICE, LAUNCH_KIT_PRICE, LAUNCH_KIT } from '@/lib/pricing'
import { formatWithCommas } from '@/components/ui/MoneyInput'
import AutocompleteInput from '@/components/public/AutocompleteInput'

export default function SellPage() {
  return (
    <ToastProvider>
      <SellContent />
    </ToastProvider>
  )
}

function SellContent() {
  const toast = useToast()
  const [form, setForm] = useState({ name: '', email: '', phone: '', businessName: '', industry: '', location: '', timeframe: '', employees: '', annualRevenue: '', askingPrice: '', message: '' })
  const [planId, setPlanId] = useState<string | null>('free') // listing-first: Owner free plan is preselected
  const [attestation, setAttestation] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [valuationBuying, setValuationBuying] = useState(false)
  const [launchBuying, setLaunchBuying] = useState(false)
  const [done, setDone] = useState(false)
  const [portalUrl, setPortalUrl] = useState('')

  const buyValuation = async () => {
    setValuationBuying(true)
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product: 'valuation',
          email: form.email || undefined,
          successUrl: `${window.location.origin}/marketplace/sell?valuation=success`,
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (j.ok && j.url) {
        window.location.href = j.url
      } else {
        toast(j.error || 'Checkout failed', 'error')
        setValuationBuying(false)
      }
    } catch {
      toast('Network error — please try again.', 'error')
      setValuationBuying(false)
    }
  }

  const buyLaunchKit = async () => {
    setLaunchBuying(true)
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product: 'launch_kit',
          email: form.email || undefined,
          successUrl: `${window.location.origin}/marketplace/sell?launch=success`,
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (j.ok && j.url) {
        window.location.href = j.url
      } else {
        toast(j.error || 'Checkout failed', 'error')
        setLaunchBuying(false)
      }
    } catch {
      toast('Network error — please try again.', 'error')
      setLaunchBuying(false)
    }
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim() || !form.email.trim()) { toast('Name and email are required', 'error'); return }
    setSubmitting(true)
    // Seller picked a paid listing plan → create a real listing order
    // (draft in broker review queue). Otherwise fall back to a lead.
    if (planId) {
      if (!attestation) { toast('You must accept the listing terms & risk disclosure to continue.', 'error'); setSubmitting(false); return }
      const res = await submitSellerListingOrder({
        planId: planId as 'free' | 'professional' | 'enterprise',
        business_name: form.businessName || 'Untitled business',
        industry: form.industry || null,
        location_general: form.location || null,
        annual_revenue: form.annualRevenue ? Number(form.annualRevenue.replace(/[$,]/g, '')) : null,
        asking_price: form.askingPrice ? Number(form.askingPrice.replace(/[$,]/g, '')) : null,
        seller_email: form.email,
        seller_name: form.name,
        seller_phone: form.phone || null,
        description: form.message || null,
        attestation: true,
      })
      setSubmitting(false)
      if (res.ok) {
        setDone(true)
        toast('Listing order created — a broker will confirm details before it goes live.', 'success')
      } else {
        toast(res.error || 'Submission failed', 'error')
      }
      return
    }
    const res = await fetch('/api/public/seller-intake', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name, email: form.email, phone: form.phone || undefined,
        business_name: form.businessName, industry: form.industry || undefined,
        location_general: form.location || undefined, timeframe: form.timeframe || undefined,
        employees: form.employees || undefined,
        revenue_range: form.annualRevenue,
        asking_price: form.askingPrice,
        message: form.message || undefined,
      }),
    }).then((r) => r.json().catch(() => ({})))
    setSubmitting(false)
    if (res.ok) {
      setDone(true)
      if (typeof res.portalUrl === 'string' && res.portalUrl) setPortalUrl(res.portalUrl)
      toast('Valuation request received — a broker will contact you confidentially.', 'success')
    } else {
      toast(res.error || 'Submission failed', 'error')
    }
  }

  if (done) {
    return (
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '100px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 60, marginBottom: 20 }}>🎉</div>
        <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 34, color: '#1a1a2e', margin: '0 0 12px' }}>Thank You</h1>
        <p style={{ color: '#666', fontSize: 16, lineHeight: 1.6, maxWidth: 520, margin: '0 auto' }}>
          Your request has been received. A Concord broker will reach out within one business day to arrange a confidential valuation consultation.
        </p>
        {portalUrl && (
          <div style={{ marginTop: 24, background: '#f4f8fc', border: '1px solid #dbe7f3', borderRadius: 12, padding: '18px 22px', textAlign: 'left' }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#1e3a5f', marginBottom: 6 }}>🔐 Your private seller portal</div>
            <div style={{ fontSize: 13, color: '#334155', lineHeight: 1.6 }}>
              Track your listing progress — status, buyer views, and next steps — anytime:
            </div>
            <a href={portalUrl} style={{ display: 'inline-block', marginTop: 10, color: '#2563eb', fontWeight: 700, fontSize: 13.5, wordBreak: 'break-all' }}>
              {portalUrl}
            </a>
            <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 8 }}>Save this link — it is your private access (also emailed to you).</div>
          </div>
        )}

        {/* 🎁 Launch Kit upsell — the money magnet, right at peak excitement */}
        <div style={{ marginTop: 24, background: 'linear-gradient(135deg,#1a1a2e,#0f3460)', borderRadius: 14, padding: 26, color: '#fff', textAlign: 'left' }}>
          <div style={{ fontSize: 12, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#c9a84c', fontWeight: 800 }}>While you're here</div>
          <div style={{ fontFamily: 'Georgia, serif', fontSize: 22, fontWeight: 800, margin: '6px 0 4px' }}>🎁 Launch Kit — ${LAUNCH_KIT_PRICE} <span style={{ fontSize: 13, fontWeight: 400, color: '#9fb3c8', textDecoration: 'line-through' }}>${LAUNCH_KIT.value} value</span></div>
          <div style={{ fontSize: 13, color: '#cbdbe7', lineHeight: 1.6, marginBottom: 12 }}>
            {LAUNCH_KIT.blurb}
          </div>
          <div style={{ display: 'grid', gap: 6, marginBottom: 16 }}>
            {LAUNCH_KIT.includes.map((inc) => (
              <div key={inc} style={{ fontSize: 13, color: '#e2edf5' }}>✓ {inc}</div>
            ))}
          </div>
          <button
            onClick={buyLaunchKit}
            disabled={launchBuying}
            style={{ width: '100%', background: '#c9a84c', color: '#1a1a2e', border: 'none', borderRadius: 8, padding: '13px', fontWeight: 800, fontFamily: 'Georgia, serif', cursor: 'pointer', fontSize: 15 }}
          >
            {launchBuying ? 'Opening checkout…' : `Launch my listing — $${LAUNCH_KIT_PRICE}`}
          </button>
          <div style={{ fontSize: 11.5, color: '#8ba3b8', textAlign: 'center', marginTop: 10 }}>30-day money-back guarantee · One-time payment · Instant activation</div>
        </div>

        <Link href="/" style={{ display: 'inline-block', marginTop: 24, color: '#c9a84c', fontWeight: 700, fontFamily: 'Georgia, serif' }}>← Back to home</Link>
      </div>
    )
  }

  return (
    <main>
      <SponsoredSlotInline slotKey="sell_page_promo" />
      {/* ══ SELL HERO — dark premium band ══ */}
      <section style={{ background: 'linear-gradient(135deg,#0f1023 0%,#1a1a2e 50%,#0f3460 100%)', color: '#fff', padding: '72px 24px 64px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 55% 60% at 80% 15%, rgba(201,168,76,0.16), transparent 60%), radial-gradient(ellipse 45% 45% at 12% 85%, rgba(15,52,96,0.6), transparent 65%)' }} />
        <div style={{ position: 'relative', maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: '1.05fr 0.95fr', gap: 44, alignItems: 'center' }} className="hero-grid">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 18 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/brand/concord-3d-logo.png"
                alt="CONCORD — Deal Platform"
                width={72}
                height={72}
                style={{ borderRadius: 16, boxShadow: '0 14px 40px rgba(0,0,0,0.45), 0 0 0 1px rgba(201,168,76,0.35)', objectFit: 'cover' }}
              />
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, background: 'rgba(201,168,76,0.12)', border: '1px solid rgba(201,168,76,0.35)', borderRadius: 999, padding: '7px 16px', fontSize: 12.5, fontWeight: 700, letterSpacing: '0.04em', color: '#f0d98c' }}>📣 Sell Your Business</div>
            </div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(34px, 4.6vw, 52px)', margin: '14px 0 16px', lineHeight: 1.08, color: '#fff', letterSpacing: '-0.03em', textShadow: '0 4px 24px rgba(0,0,0,0.45)' }}>
              List Your Business <span className="grad-gold">— Free</span>
            </h1>
            <p style={{ color: 'rgba(255,255,255,0.78)', fontSize: 16, lineHeight: 1.7, maxWidth: 540 }}>
              Post one confidential listing at no cost. A broker reviews it before anything goes live — then qualified buyers can reach you. Prefer a broker-grade valuation first? Get one for ${VALUATION_PRICE} below.
            </p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 26 }}>
              {[['🤫', '100% confidential'], ['📊', 'Broker-grade valuation'], ['🤝', 'Qualified buyers only']].map(([e, t]) => (
                <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 999, padding: '8px 16px', fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.88)', backdropFilter: 'blur(10px)' }}>
                  <span style={{ fontSize: 16 }}>{e}</span> {t}
                </span>
              ))}
            </div>
            <button
              onClick={() => document.getElementById('sell-form')?.scrollIntoView({ behavior: 'smooth' })}
              className="home-glow"
              style={{ marginTop: 28, background: 'linear-gradient(135deg,#f0d98c,#c9a84c 55%,#b08d35)', color: '#141a2e', border: 'none', borderRadius: 14, padding: '15px 30px', fontWeight: 800, fontFamily: 'var(--font-sans)', fontSize: 15.5, cursor: 'pointer', boxShadow: '0 10px 30px rgba(201,168,76,0.45)', transition: 'all .15s ease' }}
            >
              Start Free Listing 🚀
            </button>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/og-3d.png" alt="CONCORD — Sell Your Business" width={760} height={399} style={{ maxWidth: '100%', height: 'auto', borderRadius: 18, boxShadow: '0 30px 80px rgba(0,0,0,0.5)', border: '1px solid rgba(201,168,76,0.35)' }} />
          </div>
        </div>
      </section>

      {/* Main two-column: copy + form */}
    <div id="sell-form" style={{ maxWidth: 1100, margin: '0 auto', padding: '56px 24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48, alignItems: 'start' }}>
      {/* LEFT — demand + valuation + trust features (headline moved to hero) */}
      <div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <BuyerDemandPanel industry={form.industry || undefined} location={form.location || undefined} />
          <InstantValuation
            onLead={(v) => {
              // Pre-fill the free valuation form below with the estimate context.
              if (v.industry && !form.businessName) setForm((f) => ({ ...f, businessName: v.industry }))
              if (v.sde && !form.annualRevenue) setForm((f) => ({ ...f, annualRevenue: String(v.sde) }))
            }}
          />
          {[
            ['📊', 'Professional Valuation', 'A broker-grade opinion of value using SDE/EBITDA multiples and market comparables.'],
            ['🤫', 'Absolute Confidentiality', 'Your business is never publicly exposed without your consent.'],
            ['🤝', 'Qualified Buyers Only', 'We match you with serious, pre-qualified buyers who match your criteria.'],
            ['⚖️', 'Maximize Value', 'We prepare a comprehensive CIM and negotiate on your behalf to maximize proceeds.'],
          ].map(([icon, t, b]) => (
            <div key={t} style={{ display: 'flex', gap: 16, alignItems: 'flex-start', padding: 18, background: '#fff', border: '1px solid #ece8dc', borderRadius: 12 }}>
              <span style={{ fontSize: 26 }}>{icon}</span>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#1a1a2e', fontFamily: 'Georgia, serif' }}>{t}</div>
                <div style={{ fontSize: 13.5, color: '#666', marginTop: 4, lineHeight: 1.5 }}>{b}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* RIGHT form */}
      <div style={{ background: '#fff', border: '1px solid #ece8dc', borderRadius: 16, padding: 32, boxShadow: '0 12px 48px rgba(26,26,46,0.12)', position: 'sticky', top: 88, borderTop: '4px solid #c9a84c' }}>
        <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 22, color: '#1a1a2e', margin: '0 0 4px' }}>List Your Business</h2>
        <p style={{ fontSize: 13, color: '#888', margin: '0 0 20px' }}>{planId ? `Selected plan: ${OWNER_LISTING_PLANS.find((p) => p.id === planId)?.name} — ${OWNER_LISTING_PLANS.find((p) => p.id === planId)?.price === 0 ? 'free' : '$' + OWNER_LISTING_PLANS.find((p) => p.id === planId)?.price + ' ' + OWNER_LISTING_PLANS.find((p) => p.id === planId)?.billing}. A broker reviews before anything goes live.` : '100% confidential. No obligation.'}</p>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Field label="Full Name *"><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
          <Field label="Email *"><input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></Field>
          <Field label="Phone"><input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Business Name"><input className="input" value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} /></Field>
            <Field label="Industry"><select className="select" value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })}><option value="">Select industry…</option>{['Home Care', 'Restaurant', 'Retail', 'Auto Repair', 'Cleaning', 'Landscaping', 'Construction', 'Manufacturing', 'Distribution', 'Healthcare', 'Salon / Barbershop', 'Laundromat', 'Car Wash', 'Self Storage', 'Trucking / Logistics', 'Pet Services', 'Childcare', 'Gas Station / C-Store', 'Fitness / Gym', 'E-commerce', 'Software / IT', 'Staffing', 'Insurance', 'Other'].map((i) => <option key={i} value={i}>{i}</option>)}</select></Field>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Location (city / region)"><AutocompleteInput type="location" value={form.location} onChange={(v) => setForm({ ...form, location: v })} placeholder="Type a city — e.g. Harrisburg" /></Field>
            <Field label="Timeline to sell"><select className="select" value={form.timeframe} onChange={(e) => setForm({ ...form, timeframe: e.target.value })}><option value="">Select…</option><option value="ASAP">ASAP</option><option value="3-6 months">3–6 months</option><option value="6-12 months">6–12 months</option><option value="1-2 years">1–2 years</option><option value="Not sure yet">Not sure yet</option></select></Field>
          </div>
          <Field label="Employees"><input className="input" inputMode="numeric" value={form.employees} onChange={(e) => setForm({ ...form, employees: e.target.value })} placeholder="Full-time count, e.g. 12" /></Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Annual Revenue"><input className="input" inputMode="decimal" value={form.annualRevenue} onChange={(e) => setForm({ ...form, annualRevenue: formatWithCommas(e.target.value) })} placeholder="e.g. 500,000" /></Field>
            <Field label="Thinking of Asking"><input className="input" inputMode="decimal" value={form.askingPrice} onChange={(e) => setForm({ ...form, askingPrice: formatWithCommas(e.target.value) })} placeholder="e.g. 1,200,000" /></Field>
          </div>
          <Field label="Anything else?"><textarea className="textarea" rows={3} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} /></Field>
          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12, color: '#666', lineHeight: 1.5, background: '#faf9f4', border: attestation ? '1px solid #c9a84c' : '1px solid #ece8dc', borderRadius: 8, padding: '10px 12px', cursor: 'pointer' }}>
            <input type="checkbox" checked={attestation} onChange={(e) => setAttestation(e.target.checked)} style={{ marginTop: 2 }} required />
            <span>
              I confirm I own or am authorized to sell this business. I understand listings publish at <strong>my own risk</strong>, Concord recommends engaging a <strong>licensed broker</strong>, and I accept the <a href="/terms" target="_blank" style={{ color: '#c9a84c' }}>Terms &amp; risk disclosure</a>.
            </span>
          </label>
          <button type="submit" className="btn btn-primary" disabled={submitting} style={{ marginTop: 6 }}>
            {submitting ? 'Sending...' : planId === 'free' ? 'Submit My Free Listing' : 'Submit Listing Order'}
          </button>
          <div style={{ fontSize: 11, color: '#aaa', textAlign: 'center' }}>
            By submitting, you agree to our privacy policy. Your information is kept strictly confidential.
          </div>
        </form>

        {/* 💎 $99 Valuation upsell — optional add-on, never a gate */}
        <div style={{ marginTop: 20, background: 'linear-gradient(135deg,#fff8e6,#fdf3d0)', border: '2px solid #c9a84c', borderRadius: 14, padding: 22, textAlign: 'center' }}>
          <div style={{ fontSize: 26 }}>💎</div>
          <div style={{ fontWeight: 800, fontFamily: 'Georgia, serif', color: '#1a1a2e', margin: '6px 0 2px' }}>Professional Valuation Report</div>
          <div style={{ fontSize: 13, color: '#1a1a2e', marginBottom: 4 }}>Broker-grade value opinion — <strong>${VALUATION_PRICE} one-time</strong></div>
          <div style={{ fontSize: 12.5, color: '#666', lineHeight: 1.5, marginBottom: 12 }}>
            SDE/EBITDA multiples, market comparables, and a realistic price range — before you commit to selling.
          </div>
          <button type="button" className="btn btn-primary" onClick={buyValuation} disabled={valuationBuying} style={{ width: '100%', justifyContent: 'center' }}>
            {valuationBuying ? 'Opening checkout…' : `Get My Valuation — $${VALUATION_PRICE}`}
          </button>
        </div>
      </div>
    </div>

    <section style={{ background: '#071827', color: '#fff', padding: '70px 24px' }}>
      <div style={{ maxWidth: 1120, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', maxWidth: 720, margin: '0 auto 34px' }}>
          <div style={{ color: '#76d7ea', fontSize: 12, fontWeight: 800, letterSpacing: '.18em', textTransform: 'uppercase' }}>Owner Marketplace Plans</div>
          <h2 style={{ color: '#fff', fontSize: 36, margin: '12px 0' }}>List once. Stay confidential. Upgrade only when it helps.</h2>
          <p style={{ color: '#cbdbe7', lineHeight: 1.65 }}>Owners can create a one-time listing package, but every public listing remains subject to identity checks, broker review, seller approval, and applicable compliance rules.</p>
        </div>

        {/* Data room as a selling point — Part D #10 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 14, marginBottom: 34 }} className="owner-plan-grid">
          {[
            ['🛡️', 'NDA-first access', 'Every buyer signs your confidentiality agreement before seeing financials — identity and exact details stay private.'],
            ['📁', 'Your data room', 'Financials, lease, and FFE docs organized in one private room per listing — no more chasing files.'],
            ['🤖', 'AI answers buyers', 'Qualified buyers ask questions about your business; the AI answers only from approved documents.'],
            ['🔍', 'Buyer intent signals', 'See who views, re-reads, and signs — know which buyers are serious before the first call.'],
          ].map(([icon, title, body]) => (
            <div key={title} style={{ background: '#102b40', border: '1px solid rgba(255,255,255,.13)', borderRadius: 14, padding: 20 }}>
              <div style={{ fontSize: 26 }}>{icon}</div>
              <div style={{ fontSize: 14.5, fontWeight: 800, color: '#fff', marginTop: 10 }}>{title}</div>
              <div style={{ fontSize: 12.5, color: '#cbdbe7', lineHeight: 1.6, marginTop: 6 }}>{body}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 18 }} className="owner-plan-grid">
          {OWNER_LISTING_PLANS.map((plan) => (
            <article key={plan.id} style={{ padding: 26, borderRadius: 16, background: plan.featured ? '#fff' : '#102b40', color: plan.featured ? '#102a43' : '#fff', border: plan.featured ? '2px solid #38bdf8' : '1px solid rgba(255,255,255,.13)' }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: plan.featured ? '#0e7490' : '#76d7ea' }}>{plan.name}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, margin: '12px 0' }}><strong style={{ fontSize: 38 }}>${plan.price}</strong><span style={{ opacity: .65 }}>{plan.billing}</span></div>
              <p style={{ minHeight: 64, lineHeight: 1.55, opacity: .8 }}>{plan.description}</p>
              {plan.features.map((feature) => <div key={feature} style={{ padding: '8px 0', borderTop: `1px solid ${plan.featured ? '#e5edf3' : 'rgba(255,255,255,.1)'}`, fontSize: 13 }}>✓ {feature}</div>)}
              <button type="button" className={plan.featured ? 'btn btn-primary' : 'btn btn-ghost'} style={{ marginTop: 18, width: '100%', justifyContent: 'center', color: plan.featured ? undefined : '#fff', borderColor: plan.featured ? undefined : 'rgba(255,255,255,.35)' }} onClick={() => { setPlanId(plan.id); document.querySelector('form')?.scrollIntoView({ behavior: 'smooth' }); }}>{planId === plan.id ? '✓ Selected — fill the form' : 'Choose this plan'}</button>
            </article>
          ))}
        </div>
        <p style={{ color: '#91a8b8', fontSize: 12, textAlign: 'center', marginTop: 24 }}>Prices are initial launch positioning and can be changed by each brokerage. Payment activation requires the approved billing provider and final terms/refund policy.</p>
      </div>
    </section>
    </main>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  // Label wraps the control so it's properly associated (a11y: screen readers
  // AND getByLabel both need the label linked to the input, not a sibling).
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'stretch' }}>
      <span className="label">{label}</span>
      {children}
    </label>
  )
}

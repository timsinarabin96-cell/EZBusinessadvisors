'use client'

import { useState } from 'react'
import Link from 'next/link'
import { submitSellerListingOrder } from '@/lib/sellerOrderClient'
import { ToastProvider, useToast } from '@/components/ui/Toast'
import InstantValuation from '@/components/public/InstantValuation'
import { OWNER_LISTING_PLANS } from '@/lib/listingIntelligence'
import { formatWithCommas } from '@/components/ui/MoneyInput'

export default function SellPage() {
  return (
    <ToastProvider>
      <SellContent />
    </ToastProvider>
  )
}

function SellContent() {
  const toast = useToast()
  const [form, setForm] = useState({ name: '', email: '', phone: '', businessName: '', annualRevenue: '', askingPrice: '', message: '' })
  const [planId, setPlanId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim() || !form.email.trim()) { toast('Name and email are required', 'error'); return }
    setSubmitting(true)
    // Seller picked a paid listing plan → create a real listing order
    // (draft in broker review queue). Otherwise fall back to a lead.
    if (planId) {
      const res = await submitSellerListingOrder({
        planId: planId as 'free' | 'professional' | 'enterprise',
        business_name: form.businessName || 'Untitled business',
        annual_revenue: form.annualRevenue ? Number(form.annualRevenue.replace(/[$,]/g, '')) : null,
        asking_price: form.askingPrice ? Number(form.askingPrice.replace(/[$,]/g, '')) : null,
        seller_email: form.email,
        seller_name: form.name,
        seller_phone: form.phone || null,
        description: form.message || null,
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
        business_name: form.businessName, revenue_range: form.annualRevenue,
        asking_price: form.askingPrice,
        message: form.message || undefined,
      }),
    }).then((r) => r.json().catch(() => ({})))
    setSubmitting(false)
    if (res.ok) {
      setDone(true)
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
        <Link href="/" style={{ display: 'inline-block', marginTop: 24, color: '#c9a84c', fontWeight: 700, fontFamily: 'Georgia, serif' }}>← Back to home</Link>
      </div>
    )
  }

  return (
    <main>
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '60px 24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48, alignItems: 'start' }}>
      {/* LEFT copy */}
      <div>
        <div style={{ color: '#c9a84c', fontSize: 13, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 700 }}>Sell Your Business</div>
        <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 40, color: '#1a1a2e', margin: '12px 0 16px', lineHeight: 1.15 }}>
          Get a Confidential <span style={{ color: '#c9a84c' }}>Business Valuation</span> — Free
        </h1>
        <p style={{ color: '#666', fontSize: 16, lineHeight: 1.7, marginBottom: 28 }}>
          Discover what your business is truly worth. Our brokers prepare a professional valuation and, when you're ready,
          market your business confidentially to qualified buyers.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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
      <div style={{ background: '#fff', border: '1px solid #ece8dc', borderRadius: 14, padding: 32, boxShadow: '0 8px 40px rgba(26,26,46,0.1)', position: 'sticky', top: 88 }}>
        <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 22, color: '#1a1a2e', margin: '0 0 4px' }}>{planId ? 'List Your Business' : 'Request a Free Valuation'}</h2>
        <p style={{ fontSize: 13, color: '#888', margin: '0 0 20px' }}>{planId ? `Selected plan: ${OWNER_LISTING_PLANS.find((p) => p.id === planId)?.name} — ${OWNER_LISTING_PLANS.find((p) => p.id === planId)?.price === 0 ? 'free' : '$' + OWNER_LISTING_PLANS.find((p) => p.id === planId)?.price + ' ' + OWNER_LISTING_PLANS.find((p) => p.id === planId)?.billing}. A broker reviews before anything goes live.` : '100% confidential. No obligation.'}</p>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Field label="Full Name *"><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
          <Field label="Email *"><input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></Field>
          <Field label="Phone"><input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Business Name"><input className="input" value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} /></Field>
            <Field label="Annual Revenue"><input className="input" inputMode="decimal" value={form.annualRevenue} onChange={(e) => setForm({ ...form, annualRevenue: formatWithCommas(e.target.value) })} placeholder="e.g. 500,000" /></Field>
          </div>
          <Field label="Thinking of Asking"><input className="input" inputMode="decimal" value={form.askingPrice} onChange={(e) => setForm({ ...form, askingPrice: formatWithCommas(e.target.value) })} placeholder="e.g. 1,200,000" /></Field>
          <Field label="Anything else?"><textarea className="textarea" rows={3} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} /></Field>
          <button type="submit" className="btn btn-primary" disabled={submitting} style={{ marginTop: 6 }}>
            {submitting ? 'Sending...' : 'Request Confidential Valuation'}
          </button>
          <div style={{ fontSize: 11, color: '#aaa', textAlign: 'center' }}>
            By submitting, you agree to our privacy policy. Your information is kept strictly confidential.
          </div>
        </form>
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
  return (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  )
}

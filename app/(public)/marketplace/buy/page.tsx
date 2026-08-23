'use client'

import { useState } from 'react'
import Link from 'next/link'
import { capturePublicLead } from '@/lib/marketplace'
import { ToastProvider, useToast } from '@/components/ui/Toast'

const INITIAL = {
  name: '', email: '', phone: '', minBudget: '', maxBudget: '', availableCash: '', industries: '',
  locations: '', financing: '', ownerInvolvement: '', timeline: '', message: '', emailAlerts: true,
}

export default function BuyPage() {
  return <ToastProvider><BuyContent /></ToastProvider>
}

function BuyContent() {
  const toast = useToast()
  const [form, setForm] = useState(INITIAL)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!form.name.trim() || !form.email.trim()) return toast('Name and email are required', 'error')
    setSubmitting(true)
    const result = await capturePublicLead({
      kind: 'buyer', name: form.name, email: form.email, phone: form.phone || undefined, source: 'buyer_match_profile',
      budget_range: [form.minBudget, form.maxBudget].filter(Boolean).join(' - '),
      industries_interest: form.industries,
      preferred_location: form.locations,
      timeframe: form.timeline,
      funds_available: form.availableCash ? Number(form.availableCash) : null,
      financing_method: form.financing,
      message: `Owner involvement: ${form.ownerInvolvement || 'Not specified'} | Alerts consent: ${form.emailAlerts ? 'yes' : 'no'} | ${form.message}`,
    })
    setSubmitting(false)
    if (!result.ok) return toast(result.error || 'Submission failed', 'error')
    setDone(true)
    toast('Buyer profile saved — matching can begin.', 'success')
  }

  if (done) return <Success />

  return (
    <main style={{ background: '#f4f7fb', minHeight: '100vh' }}>
      <section style={{ background: 'linear-gradient(135deg,#071827,#12395a 58%,#176b87)', color: '#fff', padding: '72px 24px 110px' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto' }}>
          <div style={{ color: '#76d7ea', fontSize: 12, fontWeight: 800, letterSpacing: '.18em', textTransform: 'uppercase' }}>Acquisition Intelligence</div>
          <h1 style={{ color: '#fff', fontSize: 'clamp(38px,6vw,68px)', lineHeight: 1.02, maxWidth: 820, margin: '14px 0 20px' }}>Describe the business you want. Let the system watch the market.</h1>
          <p style={{ color: '#d7e7f2', maxWidth: 720, fontSize: 18, lineHeight: 1.65, margin: 0 }}>Create a confidential Buyer DNA profile. New seller-approved listings can be scored against your capital, industry, geography, financing, and operating goals.</p>
        </div>
      </section>

      <section style={{ maxWidth: 1180, margin: '-62px auto 0', padding: '0 24px 80px', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 360px', gap: 24 }} className="buyer-profile-grid">
        <form onSubmit={submit} className="card" style={{ padding: 32, background: '#fff' }}>
          <div className="section-title">Buyer DNA Profile</div>
          <h2 style={{ fontSize: 28, margin: '8px 0 6px' }}>Your acquisition criteria</h2>
          <p style={{ color: 'var(--muted)', lineHeight: 1.55, margin: '0 0 26px' }}>More detail produces better match explanations and fewer irrelevant alerts.</p>
          <div className="wf-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
            <Field label="Full name *"><input className="input" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></Field>
            <Field label="Email *"><input className="input" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required /></Field>
            <Field label="Phone"><input className="input" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></Field>
            <Field label="Available cash"><input className="input" type="number" value={form.availableCash} onChange={(event) => setForm({ ...form, availableCash: event.target.value })} /></Field>
            <Field label="Minimum purchase price"><input className="input" type="number" value={form.minBudget} onChange={(event) => setForm({ ...form, minBudget: event.target.value })} /></Field>
            <Field label="Maximum purchase price"><input className="input" type="number" value={form.maxBudget} onChange={(event) => setForm({ ...form, maxBudget: event.target.value })} /></Field>
            <Field label="Target industries" span><input className="input" value={form.industries} onChange={(event) => setForm({ ...form, industries: event.target.value })} placeholder="HVAC, manufacturing, home care, B2B services" /></Field>
            <Field label="Target geography" span><input className="input" value={form.locations} onChange={(event) => setForm({ ...form, locations: event.target.value })} placeholder="Philadelphia metro, Eastern PA, relocatable" /></Field>
            <Field label="Financing plan"><select className="select" value={form.financing} onChange={(event) => setForm({ ...form, financing: event.target.value })}><option value="">Select…</option><option>SBA loan</option><option>Cash</option><option>Conventional loan</option><option>Seller financing</option><option>Investor / partner capital</option></select></Field>
            <Field label="Preferred owner involvement"><select className="select" value={form.ownerInvolvement} onChange={(event) => setForm({ ...form, ownerInvolvement: event.target.value })}><option value="">Select…</option><option>Owner-operated</option><option>Manager-run</option><option>Semi-absentee</option><option>Passive / strategic</option></select></Field>
            <Field label="Acquisition timeline"><select className="select" value={form.timeline} onChange={(event) => setForm({ ...form, timeline: event.target.value })}><option value="">Select…</option><option>0-3 months</option><option>3-6 months</option><option>6-12 months</option><option>12+ months</option></select></Field>
            <Field label="Experience, goals, or special requirements" span><textarea className="textarea" rows={5} value={form.message} onChange={(event) => setForm({ ...form, message: event.target.value })} /></Field>
          </div>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, margin: '20px 0', fontSize: 13, color: '#52606d', lineHeight: 1.5 }}><input type="checkbox" checked={form.emailAlerts} onChange={(event) => setForm({ ...form, emailAlerts: event.target.checked })} style={{ marginTop: 3 }} />Notify me when a seller-approved listing materially matches this profile. I can unsubscribe at any time.</label>
          <button type="submit" className="btn btn-primary" disabled={submitting}>{submitting ? 'Creating profile…' : 'Create Buyer Match Profile'}</button>
        </form>

        <aside style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {[
            ['01', 'Explainable fit score', 'See why a listing matches your budget, experience, financing, geography, and operating preference.'],
            ['02', 'Qualification pathway', 'Complete NDA, proof of funds, financing readiness, and broker review before sensitive information is released.'],
            ['03', 'Acquisition workspace', 'Compare opportunities, save questions, schedule advisors, and move into due diligence from one secure place.'],
          ].map(([number, title, body]) => <div key={number} className="card" style={{ padding: 22, background: '#fff' }}><div style={{ color: '#0e7490', fontWeight: 900, fontSize: 13 }}>{number}</div><h3 style={{ fontSize: 18, margin: '8px 0' }}>{title}</h3><p style={{ color: 'var(--muted)', fontSize: 13, lineHeight: 1.55, margin: 0 }}>{body}</p></div>)}
        </aside>
      </section>
    </main>
  )
}

function Field({ label, span, children }: { label: string; span?: boolean; children: React.ReactNode }) {
  return <label style={{ gridColumn: span ? '1 / -1' : undefined }}><span className="label">{label}</span>{children}</label>
}

function Success() {
  return <div style={{ maxWidth: 760, margin: '0 auto', padding: '100px 24px', textAlign: 'center' }}><div style={{ fontSize: 60, marginBottom: 20 }}>◎</div><h1 style={{ fontSize: 36, margin: '0 0 12px' }}>Your acquisition profile is ready</h1><p style={{ color: '#52606d', fontSize: 16, lineHeight: 1.6 }}>A broker can review your criteria and qualified seller-approved opportunities can be matched as they enter the marketplace.</p><Link href="/marketplace/listings" style={{ display: 'inline-block', marginTop: 24, color: '#0e7490', fontWeight: 800 }}>Explore current opportunities →</Link></div>
}

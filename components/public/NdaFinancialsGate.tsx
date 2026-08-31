/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

// ---------------------------------------------------------------------------
// NdaFinancialsGate — shows the financial figures directly if the broker has
// made them publicly visible; otherwise walks a buyer through the 3-step
// accountless gate before unlocking them: (1) acknowledge the Buyer Forms
// Overview & Confidentiality Guide, (2) the Confidentiality & Registration
// Agreement (NDA) — Business Listing ID and Business Category are pre-filled
// from this listing and locked, everything else the buyer fills, (3) the
// Buyer Profile Form. Nothing else on the site is gated by this — only these
// figures, only for this one listing. The unlock token is cached in
// localStorage so a buyer who already signed doesn't have to again.
// ---------------------------------------------------------------------------

import { useEffect, useState } from 'react'
import { fmt$ } from '@/lib/recast'
import { useToast } from '@/components/ui/Toast'
import type { PublicMarketplaceListing } from '@/lib/marketplace'
import DynamicFormFields, { type FormValues } from '@/components/forms/DynamicFormFields'
import { NDA_FORM_SECTIONS, BUYER_PROFILE_SECTIONS, buyerGuideText } from '@/lib/buyerFormSchemas'
import { getVisitorId } from '@/lib/visitorIntent'
import { QUALIFY_QUESTIONS } from '@/lib/buyerQualify'

interface Financials {
  annual_revenue: number | null
  sde: number | null
  ebitda: number | null
  inventory_value: number | null
  ffe_value: number | null
}

const tokenKey = (listingId: string) => `nda_token_${listingId}`
type GateStep = 'locked' | 'qualify' | 'guide' | 'nda' | 'profile'

type QualifyOutcome = { decision: 'qualified' | 'maybe' | 'not_now'; score: number; reasons: string[]; next: string } | null

export default function NdaFinancialsGate({ listing, askingPrice, agencyLegalName }: { listing: PublicMarketplaceListing; askingPrice: number | null; agencyLegalName?: string }) {
  const toast = useToast()
  const isPublic = listing.annual_revenue != null || listing.sde != null || listing.ebitda != null
  const [unlocked, setUnlocked] = useState<Financials | null>(
    isPublic ? { annual_revenue: listing.annual_revenue, sde: listing.sde, ebitda: listing.ebitda, inventory_value: null, ffe_value: null } : null,
  )
  const [step, setStep] = useState<GateStep>('locked')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [ndaValues, setNdaValues] = useState<FormValues>({})
  const [profileValues, setProfileValues] = useState<FormValues>({})
  const [submitting, setSubmitting] = useState(false)
  const [checkingCache, setCheckingCache] = useState(!isPublic)
  const [qualifyAnswers, setQualifyAnswers] = useState<Record<string, string>>({})
  const [qualifyOutcome, setQualifyOutcome] = useState<QualifyOutcome>(null)
  const [qualifying, setQualifying] = useState(false)

  // If a token from a prior signature is cached, try it silently on load.
  useEffect(() => {
    if (isPublic) return
    const cached = typeof window !== 'undefined' ? window.localStorage.getItem(tokenKey(listing.id)) : null
    if (!cached) { setCheckingCache(false); return }
    fetch(`/api/public/nda/financials?listingId=${encodeURIComponent(listing.id)}&token=${encodeURIComponent(cached)}`)
      .then((r) => r.json())
      .then((data) => { if (data.ok) setUnlocked(data.financials) })
      .catch(() => {})
      .finally(() => setCheckingCache(false))
  }, [isPublic, listing.id])

  const submitQualify = async () => {
    const missing = QUALIFY_QUESTIONS.filter((q) => !qualifyAnswers[q.key]?.trim())
    if (missing.length) { toast('Answer the highlighted questions first', 'error'); return }
    setQualifying(true)
    try {
      const res = await fetch('/api/public/qualify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listingId: listing.id,
          name: name.trim(),
          email: email.trim(),
          answers: QUALIFY_QUESTIONS.map((q) => ({ key: q.key, value: qualifyAnswers[q.key] })),
        }),
      })
      const data = await res.json()
      if (!data.ok) { toast(data.error || 'Could not qualify', 'error'); return }
      setQualifyOutcome(data)
    } catch {
      toast('Something went wrong. Please try again.', 'error')
    } finally {
      setQualifying(false)
    }
  }

  const submitAll = async () => {
    if (!name.trim() || !email.trim()) { toast('Name and email are required', 'error'); return }
    setSubmitting(true)
    try {
      const res = await fetch('/api/public/nda/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listingId: listing.id, name, email,
          guideAcknowledged: true, ndaFormData: ndaValues, buyerProfile: profileValues,
          visitorId: getVisitorId(),
          qualificationScore: qualifyOutcome?.score ?? null,
          qualificationDecision: qualifyOutcome?.decision ?? null,
        }),
      })
      const data = await res.json()
      if (!data.ok) { toast(data.error || 'Could not process NDA', 'error'); return }
      window.localStorage.setItem(tokenKey(listing.id), data.token)
      const finRes = await fetch(`/api/public/nda/financials?listingId=${encodeURIComponent(listing.id)}&token=${encodeURIComponent(data.token)}`)
      const finData = await finRes.json()
      if (finData.ok) {
        setUnlocked(finData.financials)
        setStep('locked')
        toast('NDA signed — financials unlocked', 'success')
      }
    } catch {
      toast('Something went wrong. Please try again.', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const sdeMultiple = unlocked?.sde && askingPrice ? askingPrice / unlocked.sde : null
  const rows: [string, string][] = unlocked
    ? [
        ['Revenue', fmt$(unlocked.annual_revenue)],
        ["SDE (Seller's Discretionary Earnings)", fmt$(unlocked.sde)],
        ...(unlocked.ebitda ? [['EBITDA', fmt$(unlocked.ebitda)] as [string, string]] : []),
        ['SDE Multiple', sdeMultiple ? sdeMultiple.toFixed(1) + 'x' : '—'],
      ]
    : []

  if (checkingCache) return null

  if (unlocked) {
    return (
      <>
        {rows.map(([label, value]) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #f0ecdf' }}>
            <span style={{ fontSize: 13, color: '#888' }}>{label}</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#1a1a2e' }}>{value}</span>
          </div>
        ))}
        {(unlocked.inventory_value || 0) > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #f0ecdf' }}>
            <span style={{ fontSize: 13, color: '#888' }}>Inventory</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#1a1a2e' }}>{fmt$(unlocked.inventory_value)}</span>
          </div>
        )}
        {/* Match Pass upsell — the buyer is hottest right after signing */}
        <div style={{ marginTop: 16, padding: '14px 16px', borderRadius: 10, background: 'linear-gradient(135deg,#1a1a2e,#16213e)', color: '#fff' }}>
          <div style={{ fontWeight: 800, fontSize: 14, fontFamily: 'Georgia, serif' }}>🎯 Want first look at matching deals?</div>
          <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.7)', marginTop: 4, lineHeight: 1.5 }}>
            Match Pass sends you priority alerts when a business fits your criteria — including off-market listings other buyers never see.
          </div>
          <a
            href="/pricing#match-pass"
            style={{ display: 'inline-block', marginTop: 10, background: '#c9a84c', color: '#1a1a2e', padding: '9px 18px', borderRadius: 6, fontSize: 13, fontWeight: 800, textDecoration: 'none' }}
          >
            See Match Pass →
          </a>
        </div>
      </>
    )
  }

  if (step === 'locked') {
    return (
      <div style={{ padding: '14px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#888', fontSize: 13.5, marginBottom: 12 }}>
          🔒 Revenue, SDE &amp; EBITDA are confidential — answer a few quick questions to unlock them.
        </div>
        <button
          onClick={() => setStep('qualify')}
          style={{ width: '100%', background: '#1a1a2e', color: '#fff', border: 'none', padding: '11px 18px', borderRadius: 6, fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'Georgia, serif' }}
        >
          Request Confidential Access →
        </button>
      </div>
    )
  }

  // Multi-step modal (qualify -> guide -> NDA -> buyer profile -> submit)
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(26,26,46,0.6)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '30px 16px', overflowY: 'auto' }} onClick={() => setStep('locked')}>
      <div style={{ background: '#fff', borderRadius: 12, maxWidth: 720, width: '100%', padding: 28, maxHeight: '92vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <h2 style={{ margin: 0, fontSize: 19, color: '#1a1a2e', fontFamily: 'Georgia, serif' }}>
            {step === 'qualify' ? 'Quick Qualification' : step === 'guide' ? 'Before You Continue' : step === 'nda' ? 'Confidentiality & Registration Agreement' : 'Buyer Profile Form'}
          </h2>
          <button onClick={() => setStep('locked')} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#888' }}>✕</button>
        </div>
        <div style={{ fontSize: 12, color: '#aaa', marginBottom: 18 }}>Step {step === 'qualify' ? 1 : step === 'guide' ? 2 : step === 'nda' ? 3 : 4} of 4</div>

        {step === 'qualify' && (
          <div>
            <div style={{ fontSize: 13, color: '#444', lineHeight: 1.7, marginBottom: 14 }}>
              <strong>Tell us a little about your purchase plans</strong> — if you qualify, the NDA is sent right away and financials unlock instantly.
              {!name.trim() || !email.trim() ? (
                <span style={{ display: 'block', marginTop: 6, fontSize: 12.5, color: '#b45309' }}>We'll also need your name + email below to send the NDA.</span>
              ) : null}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div>
                <label className="label">Full Name *</label>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div>
                <label className="label">Email *</label>
                <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 18 }}>
              {QUALIFY_QUESTIONS.map((q) => (
                <div key={q.key}>
                  <label className="label" style={{ marginBottom: 6 }}>{q.label} *</label>
                  {q.options ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {q.options.map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => setQualifyAnswers((s) => ({ ...s, [q.key]: opt }))}
                          style={{
                            padding: '8px 14px', borderRadius: 999, border: '1px solid #d8cfb8', cursor: 'pointer', fontSize: 12.5,
                            background: qualifyAnswers[q.key] === opt ? '#1a1a2e' : '#fff',
                            color: qualifyAnswers[q.key] === opt ? '#fff' : '#444',
                            fontWeight: 700,
                          }}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <input
                      className="input"
                      value={qualifyAnswers[q.key] || ''}
                      onChange={(e) => setQualifyAnswers((s) => ({ ...s, [q.key]: e.target.value }))}
                      placeholder={q.placeholder}
                    />
                  )}
                </div>
              ))}
            </div>
            {qualifyOutcome && (
              <div style={{
                marginBottom: 14, padding: '12px 14px', borderRadius: 8, fontSize: 13, lineHeight: 1.55,
                background: qualifyOutcome.decision === 'qualified' ? '#f0fdf4' : qualifyOutcome.decision === 'maybe' ? '#fffbeb' : '#fef2f2',
                border: `1px solid ${qualifyOutcome.decision === 'qualified' ? '#bbf7d0' : qualifyOutcome.decision === 'maybe' ? '#fde68a' : '#fecaca'}`,
                color: qualifyOutcome.decision === 'qualified' ? '#166534' : qualifyOutcome.decision === 'maybe' ? '#92400e' : '#991b1b',
              }}>
                {qualifyOutcome.decision === 'qualified' && <strong>✅ Qualified ({qualifyOutcome.score}/100)</strong>}
                {qualifyOutcome.decision === 'maybe' && <strong>🤔 Almost there ({qualifyOutcome.score}/100) — proof of funds will confirm</strong>}
                {qualifyOutcome.decision === 'not_now' && <strong>💬 On hold ({qualifyOutcome.score}/100)</strong>}
                <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 12.5 }}>
                  {qualifyOutcome.reasons.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              </div>
            )}
            <button
              onClick={submitQualify}
              disabled={qualifying}
              style={{ width: '100%', background: '#1a1a2e', color: '#fff', border: 'none', padding: '11px 18px', borderRadius: 6, fontSize: 13.5, fontWeight: 700, cursor: qualifying ? 'wait' : 'pointer', fontFamily: 'Georgia, serif' }}
            >
              {qualifying ? 'Checking…' : 'Check my eligibility →'}
            </button>
            {qualifyOutcome && qualifyOutcome.decision === 'qualified' && (
              <button
                onClick={() => setStep('guide')}
                style={{ width: '100%', marginTop: 8, background: '#16a34a', color: '#fff', border: 'none', padding: '11px 18px', borderRadius: 6, fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'Georgia, serif' }}
              >
                You're qualified — Continue to the NDA →
              </button>
            )}
            {qualifyOutcome && qualifyOutcome.decision === 'maybe' && (
              <div style={{ marginTop: 10, fontSize: 12.5, color: '#92400e', textAlign: 'center' }}>
                Submit proof of funds to finish qualifying — our team will follow up by email.
              </div>
            )}
            {qualifyOutcome && qualifyOutcome.decision === 'not_now' && (
              <div style={{ marginTop: 10, fontSize: 12.5, color: '#991b1b', textAlign: 'center' }}>
                We'll keep you posted on similar listings — you can still browse the marketplace.
              </div>
            )}
          </div>
        )}

        {step === 'guide' && (
          <div>
            <div style={{ fontSize: 13, color: '#444', lineHeight: 1.7, whiteSpace: 'pre-wrap', maxHeight: 320, overflowY: 'auto', padding: 14, background: '#faf9f4', borderRadius: 8, marginBottom: 16 }}>
              {buyerGuideText(agencyLegalName ?? 'EZ Business Advisors LLC')}
            </div>
            <button
              onClick={() => setStep('nda')}
              style={{ width: '100%', background: '#1a1a2e', color: '#fff', border: 'none', padding: '11px 18px', borderRadius: 6, fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'Georgia, serif' }}
            >
              I have read and understood this guide — Continue
            </button>
          </div>
        )}

        {step === 'nda' && (
          <div>
            <div className="grid-2" style={{ gap: 12, marginBottom: 16 }}>
              <div>
                <label className="label">Business Listing ID No.</label>
                <input className="input" value={listing.listing_ref || listing.id} disabled style={{ background: '#faf9f4', color: '#888', fontSize: 12 }} />
              </div>
              <div>
                <label className="label">Business Category</label>
                <input className="input" value={listing.industry || '—'} disabled style={{ background: '#faf9f4', color: '#888' }} />
              </div>
              <div>
                <label className="label">Full Name *</label>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div>
                <label className="label">Email *</label>
                <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
            </div>
            <DynamicFormFields sections={NDA_FORM_SECTIONS} values={ndaValues} onChange={(k, v) => setNdaValues((s) => ({ ...s, [k]: v }))} />
            <button
              onClick={() => { if (!name.trim() || !email.trim()) { toast('Name and email are required', 'error'); return } setStep('profile') }}
              style={{ width: '100%', background: '#1a1a2e', color: '#fff', border: 'none', padding: '11px 18px', borderRadius: 6, fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'Georgia, serif', marginTop: 18 }}
            >
              Continue to Buyer Profile Form
            </button>
          </div>
        )}

        {step === 'profile' && (
          <div>
            <DynamicFormFields sections={BUYER_PROFILE_SECTIONS} values={profileValues} onChange={(k, v) => setProfileValues((s) => ({ ...s, [k]: v }))} />
            <p style={{ fontSize: 11.5, color: '#999', marginTop: 16 }}>
              By submitting, you confirm the information above is true and correct to the best of your knowledge, and you agree to keep this business's identity and financial information confidential and will not disclose it to any third party.
            </p>
            <button
              onClick={submitAll}
              disabled={submitting}
              className="btn btn-primary"
              style={{ width: '100%', marginTop: 8 }}
            >
              {submitting ? 'Submitting…' : 'Sign & Unlock Financials'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

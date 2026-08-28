/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

// =============================================================================
// /dashboard/owner — the Business Owner portal (free tier: 1 listing, no CRM).
// Login → see my listing(s), upload 3-year financials (Legitimacy Gate), track
// buyer inquiries, and control listing status (sold / pause / withdraw).
// =============================================================================

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { getStoredAccessToken } from '@/lib/authToken'
import { CRM_MONTHLY, CRM_ENTERPRISE_MONTHLY } from '@/lib/pricing'
import { LoadingState } from '@/components/ui'

interface OwnerListing {
  id: string
  business_name: string
  status: string
  created_at: string | null
  plan_code?: string | null
  established_year?: number | null
  financials_status?: string | null
  legitimacy_verdict?: string | null
  legitimacy_score?: number | null
}

const VERDICT_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  auto_approved: { bg: '#22c55e1a', color: '#15803d', label: '✅ AI-approved' },
  broker_review: { bg: '#f59e0b1a', color: '#b45309', label: '👨‍💼 Broker review' },
  pending: { bg: '#94a3b81a', color: '#64748b', label: '⏳ Needs financials' },
  rejected: { bg: '#ef44441a', color: '#b91c1c', label: '❌ Rejected' },
}

export default function OwnerPortalPage() {
  const [email, setEmail] = useState('')
  const [listings, setListings] = useState<OwnerListing[]>([])
  const [inquiries, setInquiries] = useState(0)
  const [loading, setLoading] = useState(true)
  const [openForm, setOpenForm] = useState<string | null>(null)
  const [acting, setActing] = useState<string | null>(null)
  const [profile, setProfile] = useState<{ phone?: string | null; phone_verified_at?: string | null; avatar_url?: string | null } | null>(null)

  const load = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user?.email) return
      setEmail(user.email)
      const [ordersRes, leadsRes, profileRes] = await Promise.all([
        supabase
          .from('seller_listing_orders')
          .select('id, listing_id, plan_code')
          .eq('seller_email', user.email)
          .order('created_at', { ascending: false }),
        supabase
          .from('leads')
          .select('id')
          .eq('email', user.email)
          .eq('kind', 'buyer'),
        supabase
          .from('profiles')
          .select('phone, phone_verified_at, avatar_url')
          .eq('id', user.id)
          .maybeSingle(),
      ])
      const orders = (ordersRes.data || []) as Array<{ id: string; listing_id: string | null; plan_code: string | null }>
      setProfile((profileRes.data as { phone?: string | null; phone_verified_at?: string | null; avatar_url?: string | null } | null) || null)
      const ids = [...new Set(orders.map((o) => o.listing_id).filter(Boolean))] as string[]

      // Listings owned by this email directly (newer self-service rows).
      const ownedRes = await supabase
        .from('listings')
        .select('id, business_name, status, created_at, established_year, financials_status, legitimacy_verdict, legitimacy_score')
        .or(`owner_email.eq.${user.email}` + (ids.length ? `,id.in.(${ids.join(',')})` : ''))
        .order('created_at', { ascending: false })
      const planByListing = new Map(orders.map((o) => [o.listing_id, o.plan_code]))
      const rows: OwnerListing[] = ((ownedRes.data || []) as OwnerListing[]).map((l) => ({
        ...l,
        plan_code: planByListing.get(l.id) || 'free',
      }))
      setListings(rows)
      setInquiries((leadsRes.data || []).length)
    } catch { /* degrade */ } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const setStatus = async (listing: OwnerListing, action: 'sold' | 'pause' | 'withdraw' | 'reactivate') => {
    setActing(listing.id)
    try {
      const res = await fetch(`/api/owner/listings/${listing.id}/status`, {
        method: 'PATCH',
        headers: { authorization: `Bearer ${getStoredAccessToken()}`, 'content-type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const j = await res.json().catch(() => ({}))
      if (j.ok) {
        await load()
      } else {
        alert(j.error || 'Could not update status')
      }
    } catch {
      alert('Network error')
    } finally {
      setActing(null)
    }
  }

  if (loading) return <LoadingState label="Loading your portal..." />

  const canAdd = listings.filter((l) => l.status !== 'canceled' && l.status !== 'expired').length < 1

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#1a1a2e 0%,#16213e 60%,#0f3460 100%)', padding: '48px 20px' }}>
      <div style={{ maxWidth: 820, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 26, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontFamily: 'Georgia, serif', fontSize: 28, fontWeight: 800, color: '#fff', letterSpacing: 0.5 }}>CONCORD</div>
            <div style={{ fontSize: 11, letterSpacing: '0.3em', color: '#c9a84c', textTransform: 'uppercase', marginTop: 2 }}>Owner Portal</div>
          </div>
          <button
            onClick={async () => { await supabase.auth.signOut(); window.location.href = '/' }}
            style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.35)', color: '#fff', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}
          >
            Sign out
          </button>
        </div>

        <div style={{ background: '#fff', borderRadius: 16, padding: '30px 28px', boxShadow: '0 24px 80px rgba(0,0,0,0.4)' }}>
          <h1 style={{ margin: '0 0 6px', fontFamily: 'Georgia, serif', fontSize: 24, color: '#1a1a2e' }}>My Business Listing</h1>
          <p style={{ margin: '0 0 22px', fontSize: 13.5, color: '#888' }}>
            Signed in as <strong>{email}</strong> · Free plan: 1 listing, no CRM. Buyers contact you confidentially through the marketplace.
          </p>

          {profile && (
            <ProfileVerification profile={profile} onVerified={() => load()} />
          )}

          {inquiries > 0 && (
            <div style={{ background: 'rgba(201,168,76,0.12)', border: '1px solid rgba(201,168,76,0.4)', borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: 13.5, color: '#7a5f10' }}>
              🔔 You have {inquiries} buyer inquiry/inquiries on your listing{inquiries === 1 ? '' : 's'}.
            </div>
          )}

          {listings.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '36px 20px', background: '#faf9f4', border: '1px dashed #d8d2c2', borderRadius: 12 }}>
              <div style={{ fontSize: 38, marginBottom: 10 }}>🏪</div>
              <div style={{ fontFamily: 'Georgia, serif', fontSize: 18, color: '#1a1a2e', marginBottom: 6 }}>You haven't listed your business yet</div>
              <p style={{ fontSize: 13.5, color: '#888', margin: '0 0 18px' }}>
                One free listing. The AI checks it for legitimacy (3+ years in business, financials on file) before it goes live — then qualified buyers can reach you.
              </p>
              <Link href="/marketplace/sell" style={{ display: 'inline-block', background: '#1a1a2e', color: '#c9a84c', padding: '12px 26px', borderRadius: 8, textDecoration: 'none', fontWeight: 800, fontFamily: 'Georgia, serif' }}>
                List My Business →
              </Link>
            </div>
          ) : (
            <>
              <div style={{ display: 'grid', gap: 14, marginBottom: 20 }}>
                {listings.map((l) => {
                  const vs = VERDICT_STYLE[l.legitimacy_verdict || 'pending'] || VERDICT_STYLE.pending
                  const needsFinancials = l.financials_status !== 'submitted' && l.financials_status !== 'approved'
                  const isLive = l.status === 'active' || l.status === 'published'
                  const canReactivate = l.status === 'draft' || l.status === 'paused'
                  return (
                    <div key={l.id} style={{ background: '#faf9f4', border: '1px solid #ece8dc', borderRadius: 12, padding: '18px 20px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                        <div>
                          <div style={{ fontWeight: 800, color: '#1a1a2e', fontFamily: 'Georgia, serif', fontSize: 16 }}>{l.business_name}</div>
                          <div style={{ fontSize: 12.5, color: '#888', marginTop: 3 }}>
                            {l.created_at ? `Submitted ${new Date(l.created_at).toLocaleDateString()}` : 'Submitted'} · {l.plan_code || 'free'} plan
                            {l.established_year ? ` · Est. ${l.established_year}` : ''}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ background: isLive ? '#22c55e1a' : '#94a3b81a', color: isLive ? '#15803d' : '#64748b', padding: '5px 14px', borderRadius: 99, fontSize: 11.5, fontWeight: 800, textTransform: 'uppercase' }}>
                            {l.status}
                          </span>
                          <span style={{ background: vs.bg, color: vs.color, padding: '5px 14px', borderRadius: 99, fontSize: 11.5, fontWeight: 800 }}>
                            {vs.label}{l.legitimacy_score != null ? ` (${l.legitimacy_score})` : ''}
                          </span>
                        </div>
                      </div>

                      {needsFinancials && (
                        <div style={{ marginTop: 14, background: '#fff8e6', border: '1px solid #e5d9a8', borderRadius: 10, padding: '14px 16px' }}>
                          <div style={{ fontSize: 13.5, color: '#7a5f10', fontWeight: 700 }}>📊 Upload 3 years of financials to activate</div>
                          <div style={{ fontSize: 12.5, color: '#8a7a3a', marginTop: 4, lineHeight: 1.5 }}>
                            The AI gate needs your business to be 3+ years old with 3 years of revenue on file — no premature businesses, no scams. P&L or tax returns work as proof.
                          </div>
                          {openForm === l.id ? (
                            <FinancialsForm listingId={l.id} onDone={() => { setOpenForm(null); load() }} />
                          ) : (
                            <button
                              onClick={() => setOpenForm(l.id)}
                              style={{ marginTop: 10, background: '#1a1a2e', color: '#c9a84c', border: 'none', padding: '9px 18px', borderRadius: 8, fontWeight: 800, cursor: 'pointer', fontSize: 13 }}
                            >
                              Upload financials →
                            </button>
                          )}
                        </div>
                      )}

                      {(isLive || canReactivate || l.status === 'sold' || l.status === 'withdrawn') && (
                        <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                          {isLive && (
                            <>
                              <button onClick={() => setStatus(l, 'sold')} disabled={acting === l.id} style={{ background: '#fee2e2', color: '#b91c1c', border: '1px solid #fecaca', padding: '7px 14px', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 12.5 }}>
                                Mark as Sold
                              </button>
                              <button onClick={() => setStatus(l, 'pause')} disabled={acting === l.id} style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', padding: '7px 14px', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 12.5 }}>
                                Pause
                              </button>
                              <button onClick={() => setStatus(l, 'withdraw')} disabled={acting === l.id} style={{ background: '#f3f4f6', color: '#4b5563', border: '1px solid #e5e7eb', padding: '7px 14px', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 12.5 }}>
                                Withdraw
                              </button>
                            </>
                          )}
                          {canReactivate && (
                            <button onClick={() => setStatus(l, 'reactivate')} disabled={acting === l.id} style={{ background: '#dcfce7', color: '#15803d', border: '1px solid #bbf7d0', padding: '7px 14px', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 12.5 }}>
                              Reactivate
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
              {!canAdd && (
                <div style={{ fontSize: 13, color: '#888', background: '#faf9f4', border: '1px solid #ece8dc', borderRadius: 10, padding: '12px 16px' }}>
                  ℹ️ Your free plan includes 1 listing. Want more?{' '}
                  <Link href="/pricing" style={{ color: '#1a1a2e', fontWeight: 700 }}>Professional (${CRM_MONTHLY}/mo — 10 listings · 5 seats)</Link> or{' '}
                  <Link href="/pricing" style={{ color: '#1a1a2e', fontWeight: 700 }}>Enterprise (${CRM_ENTERPRISE_MONTHLY}/mo — 25 listings · 15 seats)</Link>.
                </div>
              )}
            </>
          )}
        </div>

        <div style={{ textAlign: 'center', marginTop: 18, fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
          Questions? <a href="mailto:info@ezbusinessadvisors.com" style={{ color: '#c9a84c' }}>info@ezbusinessadvisors.com</a>
        </div>
      </div>
    </div>
  )
}

function ProfileVerification({ profile, onVerified }: { profile: { phone?: string | null; phone_verified_at?: string | null; avatar_url?: string | null }; onVerified: () => void }) {
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'idle' | 'code-sent' | 'done'>('idle')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [photoBusy, setPhotoBusy] = useState(false)
  const [photoDone, setPhotoDone] = useState(false)

  const phoneVerified = Boolean(profile.phone_verified_at)
  const hasPhoto = Boolean(profile.avatar_url)
  const complete = phoneVerified && hasPhoto

  if (complete) {
    return (
      <div style={{ background: '#dcfce7', border: '1px solid #bbf7d0', borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: 13, color: '#15803d', fontWeight: 700 }}>
        🛡️ Identity verified — phone confirmed{profile.phone ? ` (${profile.phone})` : ''} + profile photo on file. Your listings are eligible to go live.
      </div>
    )
  }

  const sendCode = async () => {
    setBusy(true); setError('')
    try {
      const res = await fetch('/api/verify/phone/send', { method: 'POST', headers: { authorization: `Bearer ${getStoredAccessToken()}`, 'content-type': 'application/json' }, body: JSON.stringify({ phone }) })
      const j = await res.json().catch(() => ({}))
      if (j.ok) { setStep('code-sent'); if (j.devCode) setCode(j.devCode) }
      else setError(j.error || 'Could not send code')
    } catch { setError('Network error') } finally { setBusy(false) }
  }

  const confirmCode = async () => {
    setBusy(true); setError('')
    try {
      const res = await fetch('/api/verify/phone/confirm', { method: 'POST', headers: { authorization: `Bearer ${getStoredAccessToken()}`, 'content-type': 'application/json' }, body: JSON.stringify({ phone, code }) })
      const j = await res.json().catch(() => ({}))
      if (j.ok) { setStep('done'); onVerified() }
      else setError(j.error || 'Verification failed')
    } catch { setError('Network error') } finally { setBusy(false) }
  }

  const uploadPhoto = async (file: File) => {
    setPhotoBusy(true); setError('')
    try {
      const fd = new FormData()
      fd.append('photo', file)
      const res = await fetch('/api/profile/photo', { method: 'POST', headers: { authorization: `Bearer ${getStoredAccessToken()}` }, body: fd })
      const j = await res.json().catch(() => ({}))
      if (j.ok) { setPhotoDone(true); onVerified() }
      else setError(j.error || 'Photo upload failed')
    } catch { setError('Network error') } finally { setPhotoBusy(false) }
  }

  return (
    <div style={{ background: '#fff8e6', border: '1px solid #e5d9a8', borderRadius: 10, padding: '16px 18px', marginBottom: 20 }}>
      <div style={{ fontSize: 14, fontWeight: 800, color: '#7a5f10', marginBottom: 4 }}>🛡️ Complete your profile to activate listings</div>
      <div style={{ fontSize: 12.5, color: '#8a7a3a', marginBottom: 12, lineHeight: 1.5 }}>
        Verified identity keeps fake sellers off the marketplace — that's what protects you and buyers. Phone + photo are required before any listing goes live.
      </div>
      <div style={{ display: 'grid', gap: 12 }}>
        {!phoneVerified && (
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: '#555' }}>📱 Verify your phone number</div>
            {step === 'idle' ? (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input className="input" placeholder="e.g. 7175551234" value={phone} onChange={(e) => setPhone(e.target.value)} style={{ flex: 1, minWidth: 160 }} />
                <button onClick={sendCode} disabled={busy || !phone} style={{ background: '#1a1a2e', color: '#c9a84c', border: 'none', padding: '9px 18px', borderRadius: 8, fontWeight: 800, cursor: 'pointer', fontSize: 13 }}>{busy ? 'Sending…' : 'Send code'}</button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input className="input" placeholder="6-digit code" value={code} onChange={(e) => setCode(e.target.value)} style={{ flex: 1, minWidth: 140 }} />
                <button onClick={confirmCode} disabled={busy || !code} style={{ background: '#1a1a2e', color: '#c9a84c', border: 'none', padding: '9px 18px', borderRadius: 8, fontWeight: 800, cursor: 'pointer', fontSize: 13 }}>{busy ? 'Verifying…' : 'Verify'}</button>
              </div>
            )}
          </div>
        )}
        {!hasPhoto && (
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: '#555' }}>📷 Upload a profile photo</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadPhoto(f) }} style={{ fontSize: 12.5 }} />
              {photoBusy && <span style={{ fontSize: 12.5, color: '#888' }}>Uploading…</span>}
              {photoDone && <span style={{ fontSize: 12.5, color: '#15803d', fontWeight: 700 }}>✅ Uploaded</span>}
            </div>
          </div>
        )}
        {error && <div style={{ fontSize: 12.5, color: '#b91c1c', fontWeight: 700 }}>{error}</div>}
      </div>
    </div>
  )
}

function FinancialsForm({ listingId, onDone }: { listingId: string; onDone: () => void }) {
  const [establishedYear, setEstablishedYear] = useState('')
  const [r1, setR1] = useState('')
  const [r2, setR2] = useState('')
  const [r3, setR3] = useState('')
  const [files, setFiles] = useState<FileList | null>(null)
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message?: string; reasons?: string[] } | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!files || files.length === 0) { alert('Please attach at least one financial document (P&L or tax return).'); return }
    setSending(true)
    setResult(null)
    try {
      const fd = new FormData()
      fd.append('established_year', establishedYear)
      fd.append('revenue_year_1', r1)
      fd.append('revenue_year_2', r2)
      fd.append('revenue_year_3', r3)
      Array.from(files).forEach((f) => fd.append('files', f))
      const res = await fetch(`/api/owner/listings/${listingId}/financials`, { method: 'POST', headers: { authorization: `Bearer ${getStoredAccessToken()}` }, body: fd })
      const j = await res.json().catch(() => ({}))
      setResult({ ok: j.ok, message: j.message, reasons: j.reasons })
      if (j.ok) setTimeout(onDone, 2500)
    } catch {
      setResult({ ok: false, message: 'Network error — please try again.' })
    } finally {
      setSending(false)
    }
  }

  return (
    <form onSubmit={submit} style={{ marginTop: 12, display: 'grid', gap: 10 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
        <label style={{ fontSize: 12, color: '#555' }}>
          Est. year *
          <input className="input" type="number" min={1950} max={2026} required value={establishedYear} onChange={(e) => setEstablishedYear(e.target.value)} style={{ marginTop: 4 }} />
        </label>
        <label style={{ fontSize: 12, color: '#555' }}>
          Revenue 3 yrs ago *
          <input className="input" type="number" min={1} required value={r1} onChange={(e) => setR1(e.target.value)} style={{ marginTop: 4 }} />
        </label>
        <label style={{ fontSize: 12, color: '#555' }}>
          Revenue 2 yrs ago *
          <input className="input" type="number" min={1} required value={r2} onChange={(e) => setR2(e.target.value)} style={{ marginTop: 4 }} />
        </label>
        <label style={{ fontSize: 12, color: '#555' }}>
          Revenue last yr *
          <input className="input" type="number" min={1} required value={r3} onChange={(e) => setR3(e.target.value)} style={{ marginTop: 4 }} />
        </label>
      </div>
      <input type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.xlsx,.xls,.csv" onChange={(e) => setFiles(e.target.files)} style={{ fontSize: 12.5 }} />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button type="submit" disabled={sending} style={{ background: '#1a1a2e', color: '#c9a84c', border: 'none', padding: '9px 18px', borderRadius: 8, fontWeight: 800, cursor: 'pointer', fontSize: 13 }}>
          {sending ? 'Submitting…' : 'Submit financials'}
        </button>
        <button type="button" onClick={onDone} style={{ background: 'transparent', border: 'none', color: '#888', cursor: 'pointer', fontSize: 12.5 }}>Cancel</button>
      </div>
      {result && (
        <div style={{ fontSize: 13, fontWeight: 700, color: result.ok ? '#15803d' : '#b91c1c' }}>
          {result.ok ? '✅ ' : '❌ '}{result.message || (result.ok ? 'Financials recorded' : 'Failed')}
          {result.reasons && result.reasons.length > 0 && (
            <div style={{ fontWeight: 400, marginTop: 4 }}>{result.reasons.join(' · ')}</div>
          )}
        </div>
      )}
    </form>
  )
}

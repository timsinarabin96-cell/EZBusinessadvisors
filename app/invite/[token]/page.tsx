/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

// =============================================================================
// /invite/[token] — self-onboarding invite page.
// The broker sends this link (or the person signs up from the website). The
// invitee fills in their own profile — name, firm, photo, phone, specialties —
// and it auto-saves to the CRM directory and appears on the public website.
// They can also unsubscribe/subscribe themselves right here.
// =============================================================================

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { fetchInviteByToken, type InviteToken } from '@/lib/invites'

const PROFESSIONAL_TYPES = [
  { value: 'lawyer', label: '⚖️ Business Attorney' },
  { value: 'accountant', label: '🧮 CPA / Accountant' },
  { value: 'qoe_agent', label: '🔍 Quality-of-Earnings Agent' },
  { value: 'lender', label: '🏦 SBA / Lender' },
  { value: 'consultant', label: '📈 Business Consultant' },
]

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '11px 12px', borderRadius: 8, border: '1px solid #d8d4c6',
  fontSize: 14.5, fontFamily: 'inherit', background: '#fff', boxSizing: 'border-box',
}

const field = (label: string, required = false) => (
  <div style={{ marginBottom: 14 }}>
    <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#555', marginBottom: 5 }}>
      {label}{required && <span style={{ color: '#b00020' }}> *</span>}
    </label>
  </div>
)

export default function InvitePage() {
  const params = useParams()
  const token = String(params.token || '')
  const [invite, setInvite] = useState<InviteToken | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [targetId, setTargetId] = useState('')
  const [active, setActive] = useState(true)
  const [busy, setBusy] = useState(false)
  const [photo, setPhoto] = useState<File | null>(null)
  const [photoUrl, setPhotoUrl] = useState('')
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState<any>({
    name: '', firm: '', title: '', specialty: '', professional_type: 'lawyer',
    industries: '', states_served: 'US', license_number: '', license_state: '',
    years_experience: '', deals_closed: '', bio: '', rates: '', website: '', email: '', phone: '',
    expertise: '', markets: '', credentials: '', linkedin: '', closed_deals_count: '',
    password: '',
  })
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))

  useEffect(() => {
    fetchInviteByToken(token).then((inv) => {
      if (!inv) setError('This invite link is not valid.')
      else if (inv.status === 'revoked') setError('This invite was revoked.')
      else if (inv.expires_at && new Date(inv.expires_at) < new Date()) setError('This invite has expired — ask for a fresh link.')
      else setInvite(inv)
      setLoading(false)
    })
  }, [token])

  const uploadPhoto = async (): Promise<string | null> => {
    if (!photo) return photoUrl || null
    setUploading(true)
    try {
      const ext = photo.name.split('.').pop() || 'jpg'
      const path = `invite/${token}/avatar-${Date.now()}.${ext}`
      const { error } = await supabase.storage.from('profile_images').upload(path, photo, { cacheControl: '3600', upsert: false, contentType: photo.type })
      if (error) throw error
      const { data: { publicUrl } } = supabase.storage.from('profile_images').getPublicUrl(path)
      return publicUrl
    } catch (e: any) {
      setError('Photo upload failed: ' + (e?.message || 'unknown error'))
      return null
    } finally {
      setUploading(false)
    }
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    if (!form.name.trim()) { setError('Name is required.'); setBusy(false); return }
    const avatarUrl = await uploadPhoto()
    if (photo && !avatarUrl) { setBusy(false); return }

    const isBroker = invite?.target_type === 'broker'
    const isAgent = invite?.target_type === 'agent'
    const data = isAgent
      ? { name: form.name, email: form.email || invite?.email || '', password: form.password, avatar_url: avatarUrl }
      : isBroker
      ? {
          name: form.name, title: form.title, bio: form.bio, phone: form.phone, email: form.email,
          linkedin: form.linkedin, avatar_url: avatarUrl,
          expertise: form.expertise.split(',').map((s: string) => s.trim()).filter(Boolean),
          industries: form.industries.split(',').map((s: string) => s.trim()).filter(Boolean),
          markets: form.markets.split(',').map((s: string) => s.trim()).filter(Boolean),
          credentials: form.credentials.split(',').map((s: string) => s.trim()).filter(Boolean),
          years_experience: form.years_experience, closed_deals_count: form.closed_deals_count,
        }
      : {
          name: form.name, firm: form.firm, title: form.title, specialty: form.specialty,
          professional_type: form.professional_type,
          industries: form.industries.split(',').map((s: string) => s.trim()).filter(Boolean),
          states_served: form.states_served.split(',').map((s: string) => s.trim().toUpperCase()).filter(Boolean),
          license_number: form.license_number, license_state: form.license_state,
          years_experience: form.years_experience, deals_closed: form.deals_closed,
          bio: form.bio, rates: form.rates, website: form.website, email: form.email, phone: form.phone,
          avatar_url: avatarUrl,
        }

    try {
      const res = await fetch(`/api/invites/${token}/fill`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data, active }),
      })
      const j = await res.json()
      if (!j.ok) throw new Error(j.error || 'Save failed')
      setTargetId(j.id)
      setSaved(true)
    } catch (err: any) {
      setError(err.message || 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  const toggleActive = async (next: boolean) => {
    setActive(next)
    if (!targetId) return
    await fetch(`/api/invites/${token}/status`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: next }),
    })
  }

  if (loading) return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#f7f5ee', color: '#666' }}>Loading…</div>

  if (error) return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#f7f5ee', padding: 24 }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: '36px 32px', maxWidth: 440, textAlign: 'center', boxShadow: '0 12px 40px rgba(0,0,0,0.08)' }}>
        <div style={{ fontSize: 40, marginBottom: 10 }}>🔗</div>
        <div style={{ fontWeight: 800, fontSize: 18, color: '#1a1a2e' }}>{error}</div>
      </div>
    </div>
  )

  if (saved) {
    const isBroker = invite?.target_type === 'broker'
    const isAgent = invite?.target_type === 'agent'
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'linear-gradient(160deg,#0f3460,#1a1a2e)', padding: 24 }}>
        <div style={{ background: '#fff', borderRadius: 18, padding: '40px 36px', maxWidth: 460, textAlign: 'center', boxShadow: '0 24px 60px rgba(0,0,0,0.3)' }}>
          <div style={{ fontSize: 46, marginBottom: 10 }}>🎉</div>
          <h1 style={{ margin: '0 0 8px', fontFamily: 'Georgia, serif', fontSize: 24, color: '#1a1a2e' }}>You&apos;re in!</h1>
          <p style={{ color: '#666', fontSize: 14.5, lineHeight: 1.6, margin: '0 0 18px' }}>
            {isAgent
              ? 'Your agent account is ready — sign in with the email and password you just created to open your team workspace.'
              : `Your ${isBroker ? 'broker profile' : 'professional profile'} was saved and ${active ? 'is now visible' : 'is currently hidden'} on the website — buyers and brokers can reach you directly.`}
          </p>
          <div style={{ display: 'grid', gap: 10, marginBottom: 14 }}>
            {isAgent ? (
              <a href="/auth" style={{ padding: '12px', borderRadius: 8, background: '#0e7490', color: '#fff', textDecoration: 'none', fontWeight: 700, fontSize: 14 }}>
                Sign in to your workspace →
              </a>
            ) : (
              <button onClick={() => toggleActive(!active)} style={{ padding: '12px', borderRadius: 8, border: '1px solid #d8d4c6', background: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>
                {active ? '🙈 Unsubscribe (hide my profile)' : '✅ Subscribe (show my profile)'}
              </button>
            )}
            {!isAgent && (
              <a href={isBroker ? '/marketplace/brokers' : '/marketplace/professionals'} style={{ padding: '12px', borderRadius: 8, background: '#0e7490', color: '#fff', textDecoration: 'none', fontWeight: 700, fontSize: 14 }}>
                View the directory →
              </a>
            )}
          </div>
          {!isAgent && <div style={{ fontSize: 12, color: '#999' }}>You can subscribe/unsubscribe yourself anytime using this link.</div>}
        </div>
      </div>
    )
  }

  const isBroker = invite?.target_type === 'broker'
  const isAgent = invite?.target_type === 'agent'
  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(160deg,#f7f5ee,#e9e6da)', padding: '40px 16px' }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 26 }}>
          <div style={{ fontFamily: 'Georgia, serif', fontSize: 26, fontWeight: 800, color: '#1a1a2e' }}>You&apos;re invited 🎉</div>
          <div style={{ color: '#666', fontSize: 14, marginTop: 6 }}>
            {isAgent
              ? 'Your broker invited you to the team — create your own login (takes 1 minute).'
              : `${isBroker ? 'Build your public broker profile' : 'Join the professional services network'} — fill this in yourself, it takes 2 minutes.`}
          </div>
        </div>

        <div style={{ background: '#fff', borderRadius: 18, padding: '32px 28px', boxShadow: '0 16px 48px rgba(26,26,46,0.1)' }}>
          {error && <div style={{ background: '#fee', padding: '10px 12px', borderRadius: 8, color: '#b00020', fontSize: 13, marginBottom: 14 }}>{error}</div>}

          <form onSubmit={save}>
            {/* Photo upload */}
            <div style={{ marginBottom: 18, display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: photoUrl || photo ? 'transparent' : '#e9e6da', overflow: 'hidden', display: 'grid', placeItems: 'center', fontSize: 26, border: '2px solid #d8d4c6', flexShrink: 0 }}>
                {photoUrl || photo ? <img src={photoUrl || (photo ? URL.createObjectURL(photo) : '')} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '📷'}
              </div>
              <div>
                <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) { setPhoto(f); setPhotoUrl('') } }} />
                <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid #0e7490', background: 'transparent', color: '#0e7490', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
                  {uploading ? 'Uploading…' : 'Upload photo'}
                </button>
                <div style={{ fontSize: 11.5, color: '#999', marginTop: 4 }}>Shown on your public profile</div>
              </div>
            </div>

            {field('Full name', true)}
            <input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Jane Smith" style={inputStyle} required />

            {isAgent ? (
              <>
                <div style={{ marginTop: 14 }}>
                  {field('Email (your login)', true)}
                  <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder={invite?.email || 'you@firm.com'} style={inputStyle} required />
                </div>
                <div style={{ marginTop: 14 }}>
                  {field('Create a password', true)}
                  <input type="password" value={form.password} onChange={(e) => set('password', e.target.value)} placeholder="At least 8 characters" style={inputStyle} required minLength={8} />
                </div>
                <div style={{ marginTop: 8, fontSize: 12, color: '#999' }}>
                  🔐 You&apos;ll sign in with this email + password. Your access is scoped to your own listings and team tools.
                </div>
              </>
            ) : (
              <>
            {!isBroker && (
              <div style={{ marginTop: 14 }}>
                {field('Professional type', true)}
                <select value={form.professional_type} onChange={(e) => set('professional_type', e.target.value)} style={inputStyle}>
                  {PROFESSIONAL_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 14 }}>
              <div>
                {field(isBroker ? 'Title' : 'Firm / company')}
                <input value={form.firm} onChange={(e) => set('firm', e.target.value)} placeholder={isBroker ? 'Senior Broker' : 'Acme Law LLP'} style={inputStyle} />
              </div>
              <div>
                {field('Email')}
                <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="you@firm.com" style={inputStyle} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                {field('Phone (shown for calls)')}
                <input value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="(555) 123-4567" style={inputStyle} />
              </div>
              <div>
                {field(isBroker ? 'LinkedIn' : 'Website')}
                <input value={isBroker ? form.linkedin : form.website} onChange={(e) => set(isBroker ? 'linkedin' : 'website', e.target.value)} placeholder={isBroker ? 'linkedin.com/in/…' : 'https://…'} style={inputStyle} />
              </div>
            </div>

            <div style={{ marginTop: 14 }}>
              {field(isBroker ? 'Specialties / expertise (comma separated)' : 'Specialty')}
              <input value={isBroker ? form.expertise : form.specialty} onChange={(e) => set(isBroker ? 'expertise' : 'specialty', e.target.value)} placeholder={isBroker ? 'M&A, valuations, SBA financing' : 'M&A, business sales'} style={inputStyle} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 14 }}>
              <div>
                {field('Industries (comma separated)')}
                <input value={form.industries} onChange={(e) => set('industries', e.target.value)} placeholder="Restaurants, Retail, Tech" style={inputStyle} />
              </div>
              <div>
                {field('Years experience')}
                <input value={form.years_experience} onChange={(e) => set('years_experience', e.target.value)} placeholder="10" style={inputStyle} />
              </div>
            </div>

            {!isBroker && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 14 }}>
                <div>
                  {field('States served (comma separated)')}
                  <input value={form.states_served} onChange={(e) => set('states_served', e.target.value)} placeholder="NY, NJ, CT" style={inputStyle} />
                </div>
                <div>
                  {field('License # (optional)')}
                  <input value={form.license_number} onChange={(e) => set('license_number', e.target.value)} placeholder="License #" style={inputStyle} />
                </div>
              </div>
            )}

            <div style={{ marginTop: 14 }}>
              {field('Short bio')}
              <textarea value={form.bio} onChange={(e) => set('bio', e.target.value)} rows={3} placeholder="A sentence or two about your experience…" style={{ ...inputStyle, resize: 'vertical' }} />
            </div>
              </>
            )}

            {!isAgent && (
            <>
            {/* Subscribe toggle */}
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '18px 0', cursor: 'pointer', fontSize: 14, color: '#333' }}>
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} style={{ width: 16, height: 16 }} />
              Subscribe — show my profile on the website so buyers & brokers can contact me
            </label>

            <button type="submit" disabled={busy || uploading} style={{ width: '100%', padding: '14px', borderRadius: 10, background: '#0e7490', color: '#fff', border: 'none', fontWeight: 800, fontSize: 15, cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit' }}>
              {busy ? 'Saving…' : 'Save my profile →'}
            </button>
            <div style={{ marginTop: 10, fontSize: 12, color: '#999', textAlign: 'center' }}>
              You can unsubscribe yourself anytime — no emails, no calls, no pressure.
            </div>
            </>
            )}
            {isAgent && (
              <button type="submit" disabled={busy || uploading} style={{ width: '100%', padding: '14px', borderRadius: 10, background: '#0e7490', color: '#fff', border: 'none', fontWeight: 800, fontSize: 15, cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit' }}>
                {busy ? 'Creating your account…' : 'Create my account →'}
              </button>
            )}
          </form>
        </div>
      </div>
    </div>
  )
}

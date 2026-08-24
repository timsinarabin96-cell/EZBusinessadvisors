'use client'

// =============================================================================
// /join — public self-onboarding: attorneys, CPAs, brokers, lenders, etc.
// sign up from the website with their full details + photo. Auto-saves to the
// CRM directory, shows on the public website, and they manage their own
// subscription via the manage link we hand back.
// =============================================================================

import { Suspense, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'

const TYPES = [
  { value: 'lawyer', label: '⚖️ Business Attorney' },
  { value: 'accountant', label: '🧮 CPA / Accountant' },
  { value: 'qoe_agent', label: '🔍 Quality-of-Earnings Agent' },
  { value: 'lender', label: '🏦 SBA / Lender' },
  { value: 'consultant', label: '📈 Business Consultant' },
  { value: 'broker', label: '💼 Business Broker' },
]

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '11px 12px', borderRadius: 8, border: '1px solid #d8d4c6',
  fontSize: 14.5, fontFamily: 'inherit', background: '#fff', boxSizing: 'border-box',
}

const Field = ({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) => (
  <div style={{ marginBottom: 14 }}>
    <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#555', marginBottom: 5 }}>
      {label}{required && <span style={{ color: '#b00020' }}> *</span>}
    </label>
    {children}
  </div>
)

export default function JoinDirectoryPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#f7f5ee', color: '#666' }}>Loading…</div>}>
      <JoinForm />
    </Suspense>
  )
}

function JoinForm() {
  const params = useSearchParams()
  const preset = params.get('type') || ''
  const [form, setForm] = useState<any>({
    professional_type: TYPES.some((t) => t.value === preset) ? preset : 'lawyer',
    name: '', firm: '', title: '', specialty: '', industries: '', states_served: 'US',
    license_number: '', license_state: '', years_experience: '', deals_closed: '',
    bio: '', rates: '', website: '', email: '', phone: '', linkedin: '',
    expertise: '', markets: '', credentials: '', closed_deals_count: '',
  })
  const [active, setActive] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState<{ manageUrl: string; publicUrl: string; isBroker: boolean } | null>(null)
  const [photo, setPhoto] = useState<File | null>(null)
  const [photoUrl, setPhotoUrl] = useState('')
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))
  const isBroker = form.professional_type === 'broker'

  const uploadPhoto = async (): Promise<string | null> => {
    if (!photo) return photoUrl || null
    setUploading(true)
    try {
      const ext = photo.name.split('.').pop() || 'jpg'
      const path = `join/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
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

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    if (!form.name.trim()) { setError('Name is required.'); setBusy(false); return }
    if (!form.email.trim() || !form.email.includes('@')) { setError('A valid email is required.'); setBusy(false); return }
    const avatarUrl = await uploadPhoto()
    if (photo && !avatarUrl) { setBusy(false); return }

    const data = isBroker
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
      const res = await fetch('/api/directory/join', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetType: isBroker ? 'broker' : 'professional', data, active }),
      })
      const j = await res.json()
      if (!j.ok) throw new Error(j.error || 'Signup failed')
      setDone({ manageUrl: j.manageUrl, publicUrl: j.publicUrl, isBroker })
    } catch (err: any) {
      setError(err.message || 'Signup failed')
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'linear-gradient(160deg,#0f3460,#1a1a2e)', padding: 24 }}>
        <div style={{ background: '#fff', borderRadius: 18, padding: '40px 36px', maxWidth: 480, textAlign: 'center', boxShadow: '0 24px 60px rgba(0,0,0,0.3)' }}>
          <div style={{ fontSize: 46, marginBottom: 10 }}>🎉</div>
          <h1 style={{ margin: '0 0 8px', fontFamily: 'Georgia, serif', fontSize: 24, color: '#1a1a2e' }}>You&apos;re in the directory!</h1>
          <p style={{ color: '#666', fontSize: 14.5, lineHeight: 1.6, margin: '0 0 18px' }}>
            Your profile was saved and is {active ? 'now visible on the website' : 'currently hidden'}. Buyers and brokers can reach you directly.
          </p>
          <div style={{ display: 'grid', gap: 10 }}>
            <a href={done.publicUrl} style={{ padding: '12px', borderRadius: 8, background: '#0e7490', color: '#fff', textDecoration: 'none', fontWeight: 700, fontSize: 14 }}>
              View my public profile →
            </a>
            <a href={done.manageUrl} style={{ padding: '12px', borderRadius: 8, border: '1px solid #d8d4c6', color: '#1a1a2e', textDecoration: 'none', fontWeight: 700, fontSize: 14 }}>
              🔐 My manage link (subscribe / unsubscribe)
            </a>
          </div>
          <div style={{ marginTop: 14, fontSize: 12, color: '#999' }}>
            Save this manage link — it&apos;s how you control your listing anytime. (We also emailed it to you.)
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(160deg,#f7f5ee,#e9e6da)', padding: '40px 16px' }}>
      <div style={{ maxWidth: 660, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 26 }}>
          <div style={{ fontFamily: 'Georgia, serif', fontSize: 30, fontWeight: 800, color: '#1a1a2e' }}>Join our deal network</div>
          <div style={{ color: '#666', fontSize: 14.5, marginTop: 6, maxWidth: 520, margin: '6px auto 0' }}>
            Attorneys, CPAs, brokers, lenders, and consultants — add your profile with your photo and contact info.
            Buyers and brokers find you when they need your expertise. Free, and you control your listing.
          </div>
        </div>

        <div style={{ background: '#fff', borderRadius: 18, padding: '32px 28px', boxShadow: '0 16px 48px rgba(26,26,46,0.1)' }}>
          {error && <div style={{ background: '#fee', padding: '10px 12px', borderRadius: 8, color: '#b00020', fontSize: 13, marginBottom: 14 }}>{error}</div>}
          <form onSubmit={submit}>
            <Field label="I am a…" required>
              <select value={form.professional_type} onChange={(e) => set('professional_type', e.target.value)} style={inputStyle}>
                {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </Field>

            {/* Photo */}
            <div style={{ marginBottom: 18, display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: photoUrl || photo ? 'transparent' : '#e9e6da', overflow: 'hidden', display: 'grid', placeItems: 'center', fontSize: 26, border: '2px solid #d8d4c6', flexShrink: 0 }}>
                {photoUrl || photo ? <img src={photoUrl || (photo ? URL.createObjectURL(photo) : '')} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '📷'}
              </div>
              <div>
                <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) { setPhoto(f); setPhotoUrl('') } }} />
                <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid #0e7490', background: 'transparent', color: '#0e7490', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
                  {uploading ? 'Uploading…' : 'Upload your photo'}
                </button>
                <div style={{ fontSize: 11.5, color: '#999', marginTop: 4 }}>Shown on your public profile</div>
              </div>
            </div>

            <Field label="Full name" required>
              <input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Jane Smith, Esq." style={inputStyle} required />
            </Field>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <Field label={isBroker ? 'Title' : 'Firm / company'}>
                  <input value={form.firm} onChange={(e) => set('firm', e.target.value)} placeholder={isBroker ? 'Senior Broker' : 'Acme Law LLP'} style={inputStyle} />
                </Field>
              </div>
              <div>
                <Field label="Email" required>
                  <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="you@firm.com" style={inputStyle} required />
                </Field>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <Field label="Phone (shown for calls)">
                  <input value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="(555) 123-4567" style={inputStyle} />
                </Field>
              </div>
              <div>
                <Field label={isBroker ? 'LinkedIn' : 'Website'}>
                  <input value={isBroker ? form.linkedin : form.website} onChange={(e) => set(isBroker ? 'linkedin' : 'website', e.target.value)} placeholder={isBroker ? 'linkedin.com/in/…' : 'https://…'} style={inputStyle} />
                </Field>
              </div>
            </div>

            <Field label={isBroker ? 'Specialties / expertise (comma separated)' : 'Specialty'}>
              <input value={isBroker ? form.expertise : form.specialty} onChange={(e) => set(isBroker ? 'expertise' : 'specialty', e.target.value)} placeholder={isBroker ? 'M&A, valuations, SBA financing' : 'M&A, business sales'} style={inputStyle} />
            </Field>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <Field label="Industries (comma separated)">
                  <input value={form.industries} onChange={(e) => set('industries', e.target.value)} placeholder="Restaurants, Retail, Tech" style={inputStyle} />
                </Field>
              </div>
              <div>
                <Field label="Years experience">
                  <input value={form.years_experience} onChange={(e) => set('years_experience', e.target.value)} placeholder="10" style={inputStyle} />
                </Field>
              </div>
            </div>

            {!isBroker && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <Field label="States served (comma separated)">
                    <input value={form.states_served} onChange={(e) => set('states_served', e.target.value)} placeholder="NY, NJ, CT" style={inputStyle} />
                  </Field>
                </div>
                <div>
                  <Field label="License # (optional)">
                    <input value={form.license_number} onChange={(e) => set('license_number', e.target.value)} placeholder="License #" style={inputStyle} />
                  </Field>
                </div>
              </div>
            )}

            <Field label="Short bio">
              <textarea value={form.bio} onChange={(e) => set('bio', e.target.value)} rows={3} placeholder="A sentence or two about your experience…" style={{ ...inputStyle, resize: 'vertical' }} />
            </Field>

            <label style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '18px 0', cursor: 'pointer', fontSize: 14, color: '#333' }}>
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} style={{ width: 16, height: 16 }} />
              Subscribe — show my profile on the website so buyers & brokers can contact me
            </label>

            <button type="submit" disabled={busy || uploading} style={{ width: '100%', padding: '14px', borderRadius: 10, background: '#0e7490', color: '#fff', border: 'none', fontWeight: 800, fontSize: 15, cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit' }}>
              {busy ? 'Saving…' : 'Join the network →'}
            </button>
            <div style={{ marginTop: 10, fontSize: 12, color: '#999', textAlign: 'center' }}>
              You can unsubscribe yourself anytime — no emails, no calls, no pressure.
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

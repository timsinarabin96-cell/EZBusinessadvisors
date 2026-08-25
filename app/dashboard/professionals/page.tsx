'use client'

import { useCallback, useEffect, useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import { LoadingState } from '@/components/ui'
import { ToastProvider, useToast } from '@/components/ui/Toast'
import {
  fetchMyProfessionals, createProfessional, updateProfessional, deleteProfessional,
  PROFESSIONAL_LABELS, PROFESSIONAL_TYPES,
  type DealProfessional, type ProfessionalType,
} from '@/lib/professionals'
import { createInviteToken } from '@/lib/invites'
import { getStoredAccessToken } from '@/lib/authToken'
import ReferralPanel from '@/components/listing/ReferralPanel'

const TYPE_EMOJI: Record<ProfessionalType, string> = {
  lawyer: '⚖️', accountant: '🧮', qoe_agent: '🔍', lender: '🏦', consultant: '📈',
}

const EMPTY_FORM = {
  professional_type: 'lawyer' as ProfessionalType,
  name: '', firm: '', title: '', specialty: '',
  industries: '', states_served: '', country_code: 'US',
  license_number: '', license_state: '', license_verified: false,
  years_experience: '', deals_closed: '', bio: '', rates: '',
  website: '', email: '', phone: '', avatar_url: '', video_url: '',
}

export default function ProfessionalsManagerPage() {
  const toast = useToast()
  const [pros, setPros] = useState<DealProfessional[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<DealProfessional | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    fetchMyProfessionals().then(setPros).finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const startCreate = () => { setEditing(null); setForm(EMPTY_FORM); setShowForm(true) }
  const startEdit = (p: DealProfessional) => {
    setEditing(p)
    setForm({
      professional_type: p.professional_type,
      name: p.name, firm: p.firm || '', title: p.title || '', specialty: p.specialty || '',
      industries: p.industries.join(', '), states_served: p.states_served.join(', '),
      country_code: p.country_code, license_number: p.license_number || '',
      license_state: p.license_state || '', license_verified: p.license_verified,
      years_experience: p.years_experience?.toString() || '', deals_closed: p.deals_closed?.toString() || '',
      bio: p.bio || '', rates: p.rates || '', website: p.website || '',
      email: p.email || '', phone: p.phone || '', avatar_url: p.avatar_url || '',
      video_url: '',
    })
    // Load the intro video (DDL-free, stored in platform_settings).
    const token = getStoredAccessToken()
    fetch(`/api/professionals/video?id=${encodeURIComponent(p.id)}`, { headers: { authorization: `Bearer ${token}` } })
      .then((r) => r.json().catch(() => ({})))
      .then((d) => { if (d.ok && d.url) setForm((f) => ({ ...f, video_url: d.url })) })
      .catch(() => {})
    setShowForm(true)
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const payload = {
      professional_type: form.professional_type,
      name: form.name.trim(),
      firm: form.firm.trim() || null,
      title: form.title.trim() || null,
      specialty: form.specialty.trim() || null,
      industries: form.industries.split(',').map((s) => s.trim()).filter(Boolean),
      states_served: form.states_served.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean),
      country_code: form.country_code.trim().toUpperCase() || 'US',
      license_number: form.license_number.trim() || null,
      license_state: form.license_state.trim().toUpperCase() || null,
      license_verified: form.license_verified,
      years_experience: form.years_experience ? Number(form.years_experience) : null,
      deals_closed: form.deals_closed ? Number(form.deals_closed) : null,
      bio: form.bio.trim() || null,
      rates: form.rates.trim() || null,
      website: form.website.trim() || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      avatar_url: form.avatar_url.trim() || null,
    }
    const res = editing
      ? await updateProfessional(editing.id, payload)
      : await createProfessional(payload)
    // Save the intro video after the record exists (best-effort).
    const savedId = editing ? editing.id : (res as any).id
    if (res.ok && savedId) {
      const token = getStoredAccessToken()
      await fetch('/api/professionals/video', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ id: savedId, url: form.video_url || '' }),
      }).catch(() => {})
    }
    setSaving(false)
    if (res.ok) {
      toast(editing ? 'Professional updated.' : 'Professional added — now live in the public directory.')
      setShowForm(false)
      load()
    } else {
      toast(res.error || 'Failed to save professional.')
    }
  }

  const remove = async (p: DealProfessional) => {
    if (!confirm(`Remove ${p.name} from the directory?`)) return
    const res = await deleteProfessional(p.id)
    if (res.ok) { toast('Professional removed.'); load() }
    else toast(res.error || 'Failed to remove.')
  }

  const [showInvite, setShowInvite] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteUrl, setInviteUrl] = useState('')
  const [inviting, setInviting] = useState(false)

  const invite = async () => {
    setInviting(true)
    try {
      const res = await fetch('/api/invites', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetType: 'professional', email: inviteEmail.trim() || undefined }),
      })
      const j = await res.json()
      if (!j.ok) throw new Error(j.error || 'Failed to create invite')
      setInviteUrl(j.url)
      toast(inviteEmail.trim() ? 'Invite sent — they fill in their own profile 📬' : 'Invite link created — copy & send it 🔗', 'success')
    } catch (err: any) {
      toast(err.message || 'Failed to create invite', 'error')
    } finally {
      setInviting(false)
    }
  }

  const toggleActive = async (p: DealProfessional) => {
    const res = await updateProfessional(p.id, { is_active: !p.is_active })
    if (res.ok) load()
    else toast(res.error || 'Failed to toggle.')
  }

  return (
    <ToastProvider>
      <AppShell active="Professional Network">
      <div style={{ maxWidth: 980, margin: '0 auto', padding: '20px 16px 60px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 26, color: 'var(--navy)', margin: 0 }}>Professional Network</h1>
            <p style={{ color: 'var(--muted)', margin: '6px 0 0', fontSize: 14, maxWidth: 560 }}>
              Lawyers, CPAs, QoE agents, lenders, and consultants you vouch for. They appear in the public directory and as recommendations on your listings.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button onClick={() => setShowInvite(true)} style={{ background: 'var(--navy)', color: '#fff', fontWeight: 700, fontSize: 14, border: 'none', padding: '11px 20px', borderRadius: 8, cursor: 'pointer' }}>
              🔗 Invite via link
            </button>
            <button onClick={startCreate} style={{ background: 'linear-gradient(135deg, var(--gold), var(--gold-dark))', color: 'var(--navy)', fontFamily: 'Georgia, serif', fontWeight: 700, fontSize: 14, border: 'none', padding: '11px 20px', borderRadius: 8, cursor: 'pointer' }}>
              + Add Professional
            </button>
          </div>
        </div>

        <ReferralPanel />

        {showInvite && (
          <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 20, marginBottom: 18, boxShadow: '0 4px 16px rgba(0,0,0,0.06)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontWeight: 800, color: 'var(--navy)', fontSize: 15 }}>Send a self-onboarding invite 🔗</div>
              <button onClick={() => setShowInvite(false)} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--muted)' }}>✕</button>
            </div>
            <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 12px' }}>
              The invitee fills in their own profile (photo, contact, specialties) and it auto-saves to your directory — they can also subscribe/unsubscribe themselves.
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="their email (optional — we send the link)"
                style={{ flex: '1 1 260px', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--line)', fontSize: 14 }}
              />
              <button onClick={invite} disabled={inviting} style={{ background: '#0e7490', color: '#fff', border: 'none', borderRadius: 8, padding: '11px 20px', fontWeight: 700, cursor: inviting ? 'wait' : 'pointer', fontSize: 14 }}>
                {inviting ? 'Creating…' : 'Create invite link'}
              </button>
            </div>
            {inviteUrl && (
              <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center', background: '#f4f8fa', border: '1px solid #cfe6ef', borderRadius: 8, padding: '10px 12px' }}>
                <code style={{ flex: 1, fontSize: 12.5, color: '#0e7490', wordBreak: 'break-all' }}>{inviteUrl}</code>
                <button
                  onClick={() => { navigator.clipboard?.writeText(inviteUrl); toast('Link copied 📋', 'success') }}
                  style={{ background: '#0e7490', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 14px', fontWeight: 700, cursor: 'pointer', fontSize: 12.5 }}
                >
                  Copy
                </button>
              </div>
            )}
          </div>
        )}

        {loading ? <LoadingState /> : (
          pros.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, background: '#fff', border: '1px solid var(--line)', borderRadius: 14, color: 'var(--muted)' }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>🤝</div>
              <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--navy)' }}>No professionals added yet</div>
              <div style={{ fontSize: 14, marginTop: 6 }}>Add your trusted attorney, CPA, QoE agent, or lender to start building your network.</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {pros.map((p) => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 16, background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', opacity: p.is_active ? 1 : 0.55 }}>
                  <div style={{ width: 46, height: 46, flex: '0 0 46px', borderRadius: 12, background: 'var(--navy)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>
                    {p.avatar_url ? <img src={p.avatar_url} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 12 }} /> : TYPE_EMOJI[p.professional_type]}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 800, color: 'var(--navy)', fontSize: 15.5 }}>
                      {p.name} {p.is_platform_verified && '✅'}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--muted)' }}>{PROFESSIONAL_LABELS[p.professional_type]}{p.firm ? ` · ${p.firm}` : ''}{p.specialty ? ` · ${p.specialty}` : ''}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                      {p.industries.slice(0, 4).join(', ') || 'All industries'}
                      {p.states_served.length > 0 && ` · ${p.states_served.join(', ')}`}
                      {!p.is_active && ' · HIDDEN'}
                    </div>
                  </div>
                  <button onClick={() => toggleActive(p)} title={p.is_active ? 'Hide from directory' : 'Show in directory'} style={{ background: 'none', border: '1px solid var(--line)', borderRadius: 8, padding: '7px 10px', cursor: 'pointer', fontSize: 13 }}>{p.is_active ? '👁' : '🙈'}</button>
                  <button onClick={() => startEdit(p)} style={{ background: 'none', border: '1px solid var(--line)', borderRadius: 8, padding: '7px 12px', cursor: 'pointer', fontSize: 13, color: 'var(--navy)', fontWeight: 700 }}>Edit</button>
                  <button onClick={() => remove(p)} style={{ background: 'none', border: '1px solid rgba(176,0,32,0.3)', borderRadius: 8, padding: '7px 12px', cursor: 'pointer', fontSize: 13, color: '#b00020', fontWeight: 700 }}>Remove</button>
                </div>
              ))}
            </div>
          )
        )}

        {showForm && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(16,26,43,0.5)', zIndex: 100, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '5vh 16px', overflowY: 'auto' }}>
            <form onSubmit={save} style={{ background: '#fff', borderRadius: 16, padding: 28, maxWidth: 640, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
                <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 21, color: 'var(--navy)', margin: 0 }}>{editing ? 'Edit Professional' : 'Add Professional'}</h2>
                <button type="button" onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--muted)' }}>✕</button>
              </div>

              <Field label="Type">
                <select value={form.professional_type} onChange={(e) => setForm({ ...form, professional_type: e.target.value as ProfessionalType })} style={inputStyle}>
                  {PROFESSIONAL_TYPES.map((t) => <option key={t} value={t}>{TYPE_EMOJI[t]} {PROFESSIONAL_LABELS[t]}</option>)}
                </select>
              </Field>
              <Grid>
                <Field label="Full Name *"><input style={inputStyle} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="Jane Smith, Esq." /></Field>
                <Field label="Firm / Company"><input style={inputStyle} value={form.firm} onChange={(e) => setForm({ ...form, firm: e.target.value })} placeholder="Smith & Associates" /></Field>
              </Grid>
              <Grid>
                <Field label="Title"><input style={inputStyle} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Partner, M&A" /></Field>
                <Field label="Specialty"><input style={inputStyle} value={form.specialty} onChange={(e) => setForm({ ...form, specialty: e.target.value })} placeholder="M&A, tax, franchise, SBA…" /></Field>
              </Grid>
              <Grid>
                <Field label="Industries (comma-separated)"><input style={inputStyle} value={form.industries} onChange={(e) => setForm({ ...form, industries: e.target.value })} placeholder="Restaurant, Laundromat, Car Wash" /></Field>
                <Field label="States Served (comma-separated, blank = nationwide)"><input style={inputStyle} value={form.states_served} onChange={(e) => setForm({ ...form, states_served: e.target.value })} placeholder="CA, NY, TX" /></Field>
              </Grid>
              <Grid>
                <Field label="Country"><input style={inputStyle} value={form.country_code} onChange={(e) => setForm({ ...form, country_code: e.target.value })} placeholder="US" /></Field>
                <Field label="Rates"><input style={inputStyle} value={form.rates} onChange={(e) => setForm({ ...form, rates: e.target.value })} placeholder="Hourly $250–$450 · Flat QoE $3.5k+" /></Field>
              </Grid>
              <Grid>
                <Field label="Years Experience"><input style={inputStyle} type="number" value={form.years_experience} onChange={(e) => setForm({ ...form, years_experience: e.target.value })} placeholder="10" /></Field>
                <Field label="Deals Closed"><input style={inputStyle} type="number" value={form.deals_closed} onChange={(e) => setForm({ ...form, deals_closed: e.target.value })} placeholder="25" /></Field>
              </Grid>
              <Grid>
                <Field label="License Number"><input style={inputStyle} value={form.license_number} onChange={(e) => setForm({ ...form, license_number: e.target.value })} placeholder="1234567" /></Field>
                <Field label="License State"><input style={inputStyle} value={form.license_state} onChange={(e) => setForm({ ...form, license_state: e.target.value })} placeholder="CA" /></Field>
              </Grid>
              <Grid>
                <Field label="Email"><input style={inputStyle} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="jane@firm.com" /></Field>
                <Field label="Phone"><input style={inputStyle} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="(555) 123-4567" /></Field>
              </Grid>
              <Grid>
                <Field label="Website"><input style={inputStyle} value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://…" /></Field>
                <Field label="Avatar URL"><input style={inputStyle} value={form.avatar_url} onChange={(e) => setForm({ ...form, avatar_url: e.target.value })} placeholder="https://…/photo.jpg" /></Field>
                <Field label="Video intro URL (YouTube / Vimeo / .mp4)"><input style={inputStyle} value={form.video_url} onChange={(e) => setForm({ ...form, video_url: e.target.value })} placeholder="https://youtube.com/watch?v=…" /></Field>
              </Grid>
              <Field label="Bio"><textarea style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} placeholder="Background, focus areas, notable deals…" /></Field>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'var(--text)', margin: '12px 0' }}>
                <input type="checkbox" checked={form.license_verified} onChange={(e) => setForm({ ...form, license_verified: e.target.checked })} />
                License verified
              </label>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
                <button type="button" onClick={() => setShowForm(false)} style={{ background: 'none', border: '1px solid var(--line)', borderRadius: 8, padding: '11px 20px', cursor: 'pointer', color: 'var(--muted)', fontWeight: 700, fontSize: 14 }}>Cancel</button>
                <button type="submit" disabled={saving} style={{ background: 'linear-gradient(135deg, var(--gold), var(--gold-dark))', color: 'var(--navy)', border: 'none', borderRadius: 8, padding: '11px 24px', cursor: 'pointer', fontWeight: 800, fontSize: 14 }}>
                  {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Professional'}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </AppShell>
    </ToastProvider>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8,
  border: '1px solid var(--line)', background: '#fff', color: 'var(--text)', fontSize: 14,
  fontFamily: 'Georgia, serif', outline: 'none',
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div style={{ marginBottom: 12 }}><label style={{ display: 'block', fontFamily: 'Georgia, serif', fontWeight: 600, color: 'var(--navy)', fontSize: 13, marginBottom: 4 }}>{label}</label>{children}</div>
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>{children}</div>
}

'use client'

// =============================================================================
// /dashboard/profile — the user's own profile: photo upload + full details.
// Works for every role (admin / broker / agent / owner). Photo upload uses
// the existing avatar lib (storage + update_profile_avatar RPC).
// =============================================================================

import { useCallback, useEffect, useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import { ToastProvider, useToast } from '@/components/ui/Toast'
import { ProfileAvatar } from '@/components/profile/ProfileAvatar'
import { supabase } from '@/lib/supabase/client'
import { LoadingState } from '@/components/ui'

export default function ProfilePage() {
  return (
    <AppShell active="Profile">
      <ToastProvider>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <ProfileForm />
        </div>
      </ToastProvider>
    </AppShell>
  )
}

function ProfileForm() {
  const toast = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [userId, setUserId] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [brokerInviteUrl, setBrokerInviteUrl] = useState('')
  const [invitingBroker, setInvitingBroker] = useState(false)
  const [form, setForm] = useState({
    full_name: '', phone: '', title: '', bio: '', public_name: '', linkedin: '',
    license_type: '', license_state: '', license_number: '', license_expiry: '',
  })

  const load = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)
      const res = await fetch('/api/profile')
      const j = await res.json()
      if (j.ok) {
        const p = j.profile || {}
        const b = j.broker || {}
        setAvatarUrl(p.avatar_url || null)
        setForm({
          full_name: p.full_name || '',
          phone: b.phone || '',
          title: b.title || '',
          bio: b.bio || '',
          public_name: b.public_name || '',
          linkedin: b.linkedin || '',
          license_type: p.license_type || '',
          license_state: p.license_state || '',
          license_number: p.license_number || '',
          license_expiry: p.license_expiry ? String(p.license_expiry).slice(0, 10) : '',
        })
      }
    } catch { /* degrade */ } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const j = await res.json()
      if (j.ok) toast('Profile saved ✅', 'success')
      else toast(j.error || 'Failed to save', 'error')
    } catch (e: any) { toast(e.message || 'Failed to save', 'error') } finally { setSaving(false) }
  }

  if (loading) return <LoadingState label="Loading profile..." />

  const makeBrokerInvite = async () => {
    setInvitingBroker(true)
    try {
      const res = await fetch('/api/invites', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetType: 'broker' }),
      })
      const j = await res.json()
      if (!j.ok) throw new Error(j.error || 'Failed')
      setBrokerInviteUrl(j.url)
      toast('Invite link created 🔗', 'success')
    } catch (err: any) {
      toast(err.message || 'Failed to create invite', 'error')
    } finally {
      setInvitingBroker(false)
    }
  }

  return (
    <div style={{ marginTop: 28 }}>
      <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 26, color: 'var(--navy)', margin: '0 0 4px' }}>My Profile</h1>
      <p style={{ color: 'var(--muted)', fontSize: 13.5, margin: '0 0 24px' }}>Your photo and details — shown to buyers, sellers, and your team.</p>

      {/* Photo */}
      <div style={{ background: '#fff', border: '1px solid #ece8dc', borderRadius: 14, padding: 24, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
          <ProfileAvatar userId={userId} avatarUrl={avatarUrl} fullName={form.full_name || 'User'} size="xlarge" editable onUpdate={(url) => setAvatarUrl(url)} />
          <div>
            <div style={{ fontWeight: 800, color: 'var(--navy)', fontSize: 16 }}>Profile photo</div>
            <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>Click the photo to upload. JPG/PNG/WebP, max 2MB.</div>
          </div>
        </div>
      </div>

      {/* Details */}
      <div style={{ background: '#fff', border: '1px solid #ece8dc', borderRadius: 14, padding: 24 }}>
        <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 18, color: 'var(--navy)', margin: '0 0 18px' }}>About you</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Field label="Full name *"><input className="input" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></Field>
          <Field label="Public name (shown to clients)"><input className="input" value={form.public_name} onChange={(e) => setForm({ ...form, public_name: e.target.value })} placeholder="e.g. Rabin Timsina" /></Field>
          <Field label="Title"><input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Senior Broker" /></Field>
          <Field label="Phone"><input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+1 (555) 000-0000" /></Field>
          <Field label="LinkedIn"><input className="input" value={form.linkedin} onChange={(e) => setForm({ ...form, linkedin: e.target.value })} placeholder="https://linkedin.com/in/..." /></Field>
          <Field label="License type"><input className="input" value={form.license_type} onChange={(e) => setForm({ ...form, license_type: e.target.value })} placeholder="e.g. Real Estate Broker" /></Field>
          <Field label="License state"><input className="input" value={form.license_state} onChange={(e) => setForm({ ...form, license_state: e.target.value })} placeholder="e.g. NY" /></Field>
          <Field label="License number"><input className="input" value={form.license_number} onChange={(e) => setForm({ ...form, license_number: e.target.value })} /></Field>
          <Field label="License expiry"><input className="input" type="date" value={form.license_expiry} onChange={(e) => setForm({ ...form, license_expiry: e.target.value })} /></Field>
        </div>
        <div style={{ gridColumn: '1 / -1', marginTop: 4 }}>
          <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#555', marginBottom: 5 }}>Bio</label>
          <textarea className="input" rows={4} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} placeholder="Tell buyers and sellers about your experience…" style={{ resize: 'vertical' }} />
        </div>
        <button onClick={save} disabled={saving} style={{ marginTop: 20, background: 'var(--navy)', color: '#c9a84c', padding: '13px 30px', borderRadius: 8, border: 'none', fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}>
          {saving ? 'Saving…' : 'Save Profile'}
        </button>
      </div>

      {/* Broker invite link */}
      <div style={{ background: '#fff', border: '1px solid #ece8dc', borderRadius: 14, padding: 24, marginTop: 20 }}>
        <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 18, color: 'var(--navy)', margin: '0 0 6px' }}>Invite a fellow broker 🔗</h2>
        <p style={{ fontSize: 13, color: '#888', margin: '0 0 14px' }}>
          Send this link to another broker — they fill in their own profile (photo, contact, specialties) and appear in the public broker directory. They can subscribe/unsubscribe themselves anytime.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <button onClick={makeBrokerInvite} disabled={invitingBroker} style={{ background: '#0e7490', color: '#fff', border: 'none', borderRadius: 8, padding: '11px 20px', fontWeight: 700, cursor: invitingBroker ? 'wait' : 'pointer', fontSize: 14 }}>
            {invitingBroker ? 'Creating…' : 'Create invite link'}
          </button>
          {brokerInviteUrl && (
            <code style={{ flex: '1 1 260px', fontSize: 12.5, color: '#0e7490', wordBreak: 'break-all', background: '#f4f8fa', border: '1px solid #cfe6ef', borderRadius: 8, padding: '10px 12px' }}>{brokerInviteUrl}</code>
          )}
          {brokerInviteUrl && (
            <button
              onClick={() => { navigator.clipboard?.writeText(brokerInviteUrl); toast('Link copied 📋', 'success') }}
              style={{ background: '#0e7490', color: '#fff', border: 'none', borderRadius: 6, padding: '9px 16px', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}
            >
              Copy
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#555', marginBottom: 5 }}>{label}</label>
      {children}
    </div>
  )
}

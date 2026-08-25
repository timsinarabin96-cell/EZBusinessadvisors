'use client'

// =============================================================================
// /dashboard/passwords — per-user "Save Passwords" vault.
// Encrypted at rest (AES-256-GCM, server-side key via /api/vault). Owner-only:
// every entry is scoped to the signed-in profile. Copy-to-clipboard, show/
// hide, edit, delete — no plaintext ever stored.
// =============================================================================

import { useEffect, useState } from 'react'
import AppShell from '@/components/layout/AppShell'

interface VaultEntry {
  id: string
  title: string
  url: string | null
  username: string | null
  password: string
  notes: string | null
  created_at: string
  updated_at: string
}

export default function PasswordsPage() {
  const [entries, setEntries] = useState<VaultEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<VaultEntry | null>(null)
  const [saving, setSaving] = useState(false)
  const [revealed, setRevealed] = useState<Record<string, boolean>>({})
  const [copied, setCopied] = useState<string>('')

  // form state
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [notes, setNotes] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const token = (await import('@/lib/supabase/client')).supabase.auth.getSession()
      const { data: { session } } = await token
      if (!session) { setError('Not signed in'); return }
      const res = await fetch('/api/vault', { headers: { Authorization: `Bearer ${session.access_token}` } })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error || 'Could not load vault')
      setEntries(json.entries || [])
    } catch (e: any) {
      setError(e.message || 'Could not load vault')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const resetForm = () => {
    setTitle(''); setUrl(''); setUsername(''); setPassword(''); setNotes('')
    setEditing(null); setShowForm(false)
  }

  const openNew = () => { resetForm(); setShowForm(true) }

  const openEdit = (e: VaultEntry) => {
    setEditing(e)
    setTitle(e.title); setUrl(e.url || ''); setUsername(e.username || ''); setPassword(''); setNotes(e.notes || '')
    setShowForm(true)
  }

  const save = async () => {
    if (!title.trim() || (!password && !editing)) { setError('Title and password are required'); return }
    setSaving(true); setError('')
    try {
      const { supabase } = await import('@/lib/supabase/client')
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not signed in')
      const body = editing
        ? { id: editing.id, title, url, username, password, notes }
        : { title, url, username, password, notes }
      const res = await fetch('/api/vault', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error || 'Save failed')
      resetForm()
      await load()
    } catch (e: any) {
      setError(e.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id: string) => {
    if (!confirm('Delete this saved password?')) return
    try {
      const { supabase } = await import('@/lib/supabase/client')
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const res = await fetch('/api/vault', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ id }),
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error || 'Delete failed')
      await load()
    } catch (e: any) {
      setError(e.message || 'Delete failed')
    }
  }

  const copy = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(id)
      setTimeout(() => setCopied(''), 1400)
    } catch { /* clipboard unavailable */ }
  }

  return (
    <AppShell active="Password Vault">
      <div style={{ maxWidth: 860, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 22 }}>
          <div>
            <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 26, color: 'var(--navy)', margin: 0 }}>🔑 Password Vault</h1>
            <p style={{ fontSize: 13.5, color: '#888', margin: '6px 0 0' }}>
              Your saved passwords — encrypted at rest, visible only to you.
            </p>
          </div>
          <button
            onClick={openNew}
            style={{ background: 'var(--navy)', color: 'var(--gold)', border: 'none', borderRadius: 8, padding: '11px 18px', fontWeight: 800, fontFamily: 'Georgia, serif', fontSize: 14, cursor: 'pointer' }}
          >
            ＋ Add Password
          </button>
        </div>

        {error && (
          <div style={{ background: '#fee', padding: '10px 14px', borderRadius: 8, color: '#c0392b', fontSize: 13, marginBottom: 14 }}>{error}</div>
        )}

        {showForm && (
          <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 24, marginBottom: 22, boxShadow: '0 10px 30px rgba(16,42,67,0.06)' }}>
            <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 18, color: 'var(--navy)', margin: '0 0 16px' }}>
              {editing ? '✏️ Edit entry' : '＋ New saved password'}
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (e.g. Buyer Portal)" style={inputStyle} />
              <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="URL (optional)" style={inputStyle} />
              <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username / email (optional)" style={inputStyle} />
              <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder={editing ? 'New password (leave blank to keep)' : 'Password'} type="text" style={inputStyle} />
            </div>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" rows={2} style={{ ...inputStyle, width: '100%', marginTop: 14, resize: 'vertical' }} />
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button onClick={save} disabled={saving} style={{ background: 'var(--navy)', color: 'var(--gold)', border: 'none', borderRadius: 8, padding: '11px 20px', fontWeight: 800, fontFamily: 'Georgia, serif', fontSize: 14, cursor: saving ? 'wait' : 'pointer' }}>
                {saving ? 'Saving…' : editing ? 'Save Changes' : 'Save Password'}
              </button>
              <button onClick={resetForm} style={{ background: '#eee', color: '#555', border: 'none', borderRadius: 8, padding: '11px 20px', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>Cancel</button>
            </div>
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#999', fontSize: 14 }}>Loading your vault…</div>
        ) : entries.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '70px 24px', background: '#faf9f4', border: '1px dashed var(--line)', borderRadius: 14, color: '#888' }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>🔐</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--navy)', fontFamily: 'Georgia, serif' }}>No saved passwords yet</div>
            <p style={{ fontSize: 13.5, margin: '8px 0 18px' }}>Save login credentials for your portals, listing platforms, and tools — all encrypted.</p>
            <button onClick={openNew} style={{ background: 'var(--navy)', color: 'var(--gold)', border: 'none', borderRadius: 8, padding: '11px 20px', fontWeight: 800, fontFamily: 'Georgia, serif', fontSize: 14, cursor: 'pointer' }}>
              ＋ Add your first password
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {entries.map((e) => (
              <div key={e.id} style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', boxShadow: '0 6px 18px rgba(16,42,67,0.04)' }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontWeight: 800, color: 'var(--navy)', fontSize: 15, fontFamily: 'Georgia, serif' }}>{e.title}</div>
                  <div style={{ fontSize: 12.5, color: '#999', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {[e.username, e.url].filter(Boolean).join(' · ') || '—'}
                  </div>
                  {e.notes && <div style={{ fontSize: 12, color: '#aaa', marginTop: 4 }}>{e.notes}</div>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <code style={{ background: '#f4f6fa', padding: '8px 12px', borderRadius: 6, fontSize: 13.5, color: '#31536f', fontFamily: 'monospace' }}>
                    {revealed[e.id] ? e.password : '••••••••'}
                  </code>
                  <button onClick={() => setRevealed((r) => ({ ...r, [e.id]: !r[e.id] }))} style={iconBtn} title="Show/hide">👁</button>
                  <button onClick={() => copy(e.password, e.id)} style={iconBtn} title="Copy password">{copied === e.id ? '✅' : '📋'}</button>
                  <button onClick={() => openEdit(e)} style={iconBtn} title="Edit">✏️</button>
                  <button onClick={() => remove(e.id)} style={iconBtn} title="Delete">🗑</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  )
}

const inputStyle: React.CSSProperties = {
  padding: '11px 13px', border: '1px solid #d8d2c2', borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box',
}

const iconBtn: React.CSSProperties = {
  background: '#f4f6fa', border: '1px solid #e2e8f0', borderRadius: 6, padding: '7px 10px', fontSize: 14, cursor: 'pointer',
}

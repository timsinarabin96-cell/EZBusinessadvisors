'use client'

// =============================================================================
// /admin/users — Platform owner (boss) user management.
// Create users, set roles, link agencies, activate/deactivate, manage
// subscriptions. Full control over every login on the platform.
// =============================================================================

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { LoadingState } from '@/components/ui'
import { useToast } from '@/components/ui/Toast'

interface UserRow {
  id: string
  email: string
  full_name: string | null
  role: string
  status: string
  avatar_url: string | null
  created_at: string | null
  memberships: { agency_id: string; role: string; is_owner: boolean }[]
  subscription: { tier: string; status: string } | null
}

export default function AdminUsersPage() {
  const toast = useToast()
  const [users, setUsers] = useState<UserRow[]>([])
  const [agencies, setAgencies] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ email: '', password: '', full_name: '', role: 'broker', agencyId: '' })
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const [uRes, aRes] = await Promise.all([
        fetch('/api/admin/users'),
        fetch('/api/admin/agencies').then((r) => r.json().catch(() => ({ ok: false }))),
      ])
      const u = await uRes.json()
      if (!uRes.ok || !u.ok) { setError(u.error || 'Access denied'); return }
      setUsers(u.users || [])
      if (aRes.ok) setAgencies((aRes as any).agencies || [])
    } catch { setError('Failed to load users.') } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const createUser = async () => {
    setBusy(true)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, agencyId: form.agencyId || null }),
      })
      const j = await res.json()
      if (!res.ok || !j.ok) { toast(j.error || 'Failed to create user', 'error'); return }
      toast('User created ✅', 'success')
      setShowCreate(false)
      setForm({ email: '', password: '', full_name: '', role: 'broker', agencyId: '' })
      load()
    } catch (e: any) { toast(e.message, 'error') } finally { setBusy(false) }
  }

  const patchUser = async (userId: string, patch: Record<string, unknown>) => {
    const res = await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, ...patch }),
    })
    const j = await res.json()
    if (j.ok) { toast('Updated', 'success'); load() } else toast(j.error || 'Update failed', 'error')
  }

  if (loading) return <LoadingState label="Loading users..." />
  if (error) {
    return (
      <div style={{ maxWidth: 560, margin: '80px auto', textAlign: 'center' }}>
        <div style={{ fontSize: 44 }}>🔐</div>
        <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 24, color: '#1a1a2e' }}>Platform Admin Only</h1>
        <p style={{ color: '#888' }}>{error}</p>
        <Link href="/auth" style={{ display: 'inline-block', marginTop: 16, background: '#1a1a2e', color: '#fff', padding: '11px 26px', borderRadius: 8, textDecoration: 'none', fontWeight: 700 }}>Sign in as admin</Link>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '40px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ color: '#c9a84c', fontSize: 12, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 700 }}>Platform Control</div>
          <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 30, color: '#1a1a2e', margin: '6px 0 0' }}>User Management</h1>
          <p style={{ color: '#888', fontSize: 14, margin: '6px 0 0' }}>Create users, assign roles, link agencies. {users.length} users total.</p>
        </div>
        <button onClick={() => setShowCreate(!showCreate)} style={{ background: '#1a1a2e', color: '#c9a84c', padding: '11px 22px', borderRadius: 8, border: 'none', fontWeight: 800, cursor: 'pointer' }}>
          {showCreate ? 'Cancel' : '+ Create User'}
        </button>
      </div>

      {/* Create user form */}
      {showCreate && (
        <div style={{ background: '#fff', border: '1px solid #ece8dc', borderRadius: 14, padding: 24, marginBottom: 24 }}>
          <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 18, color: '#1a1a2e', margin: '0 0 16px' }}>Create a new user</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
            <Field label="Full name"><input className="input" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="Jane Doe" /></Field>
            <Field label="Email *"><input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="jane@company.com" /></Field>
            <Field label="Password *"><input className="input" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Min 6 chars" /></Field>
            <Field label="Role">
              <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="broker">Broker</option>
                <option value="agent">Agent</option>
                <option value="admin">Admin</option>
                <option value="super_admin">Super Admin</option>
                <option value="owner">Owner (list a business)</option>
                <option value="buyer">Buyer (marketplace)</option>
              </select>
            </Field>
            <Field label="Link to agency (optional)">
              <select className="input" value={form.agencyId} onChange={(e) => setForm({ ...form, agencyId: e.target.value })}>
                <option value="">— none —</option>
                {agencies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </Field>
          </div>
          <button onClick={createUser} disabled={busy} style={{ marginTop: 18, background: '#1a1a2e', color: '#c9a84c', padding: '12px 28px', borderRadius: 8, border: 'none', fontWeight: 800, cursor: busy ? 'not-allowed' : 'pointer' }}>
            {busy ? 'Creating…' : 'Create User'}
          </button>
        </div>
      )}

      {/* Users table */}
      <div style={{ background: '#fff', border: '1px solid #ece8dc', borderRadius: 14, padding: 20, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: '#1a1a2e', borderBottom: '2px solid #1a1a2e' }}>
              <th style={{ padding: '10px 12px' }}>User</th>
              <th style={{ padding: '10px 12px' }}>Role</th>
              <th style={{ padding: '10px 12px' }}>Status</th>
              <th style={{ padding: '10px 12px' }}>Agency</th>
              <th style={{ padding: '10px 12px' }}>Plan</th>
              <th style={{ padding: '10px 12px' }}>Created</th>
              <th style={{ padding: '10px 12px' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} style={{ borderBottom: '1px solid #ece8dc' }}>
                <td style={{ padding: '10px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {u.avatar_url ? <img src={u.avatar_url} style={{ width: 30, height: 30, borderRadius: '50%', objectFit: 'cover' }} /> : <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#1a1a2e', color: '#c9a84c', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 800 }}>{(u.full_name || u.email)[0]?.toUpperCase()}</div>}
                    <div>
                      <div style={{ fontWeight: 700 }}>{u.full_name || '—'}</div>
                      <div style={{ fontSize: 12, color: '#888' }}>{u.email}</div>
                    </div>
                  </div>
                </td>
                <td style={{ padding: '10px 12px' }}>
                  <select value={u.role} onChange={(e) => patchUser(u.id, { role: e.target.value })} style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid #d8d2c2', fontSize: 12.5 }}>
                    <option value="super_admin">super_admin</option>
                    <option value="admin">admin</option>
                    <option value="broker">broker</option>
                    <option value="agent">agent</option>
                    <option value="owner">owner</option>
                    <option value="buyer">buyer</option>
                  </select>
                </td>
                <td style={{ padding: '10px 12px' }}>
                  <button onClick={() => patchUser(u.id, { status: u.status === 'active' ? 'inactive' : 'active' })} style={{ background: u.status === 'active' ? '#22c55e1a' : '#94a3b81a', color: u.status === 'active' ? '#15803d' : '#64748b', padding: '4px 12px', borderRadius: 99, fontSize: 11.5, fontWeight: 800, border: 'none', cursor: 'pointer', textTransform: 'uppercase' }}>
                    {u.status}
                  </button>
                </td>
                <td style={{ padding: '10px 12px', color: '#555' }}>{u.memberships?.map((m) => m.agency_id?.slice(0, 8)).join(', ') || '—'}</td>
                <td style={{ padding: '10px 12px', color: '#555' }}>{u.subscription ? `${u.subscription.tier} · ${u.subscription.status}` : '—'}</td>
                <td style={{ padding: '10px 12px', color: '#888' }}>{u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}</td>
                <td style={{ padding: '10px 12px' }}>
                  <select
                    value={u.memberships?.[0]?.agency_id || ''}
                    onChange={(e) => patchUser(u.id, { agencyId: e.target.value || null })}
                    style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid #d8d2c2', fontSize: 12.5, maxWidth: 160 }}
                  >
                    <option value="">— none —</option>
                    {agencies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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

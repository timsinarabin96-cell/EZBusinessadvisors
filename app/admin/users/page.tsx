'use client'

// =============================================================================
// /admin/users — Platform owner (boss) user management.
// Create users, set roles, link agencies, and control account status with a
// REAL kill-switch: Ban revokes the auth user + all sessions and pulls their
// listings off the market (not just a flag). Lock = payment hold.
// Every action is written to the admin audit log.
// =============================================================================

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { authenticatedFetch } from '@/lib/authenticatedFetch'
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
  last_login: string | null
  auth_banned: boolean
  memberships: { agency_id: string; role: string; is_owner: boolean }[]
  subscription: { tier: string; status: string } | null
}

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  active: { bg: '#22c55e1a', color: '#15803d' },
  inactive: { bg: '#94a3b81a', color: '#64748b' },
  locked: { bg: '#f59e0b1a', color: '#b45309' },
  banned: { bg: '#ef44441a', color: '#b91c1c' },
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
  const [banTarget, setBanTarget] = useState<UserRow | null>(null)
  const [banConfirm, setBanConfirm] = useState('')
  const [banReason, setBanReason] = useState('')
  const [loginLink, setLoginLink] = useState<{ email: string; url: string } | null>(null)
  const [showImport, setShowImport] = useState(false)
  const [importRows, setImportRows] = useState<{ email: string; full_name: string; role: string; password: string; agencyId: string }[]>([])
  const [importResults, setImportResults] = useState<{ email: string; ok: boolean; userId?: string; password?: string; error?: string }[] | null>(null)
  const [importBusy, setImportBusy] = useState(false)

  const parseCSV = (text: string) => {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    if (lines.length === 0) return []
    const header = lines[0].toLowerCase().split(',').map((h) => h.trim().replace(/^"|"$/g, ''))
    const col = (name: string) => header.indexOf(name)
    const iEmail = col('email')
    if (iEmail === -1) return []
    const rows = lines.slice(1).map((line) => {
      const cells = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''))
      return {
        email: cells[iEmail] || '',
        full_name: col('full_name') >= 0 ? cells[col('full_name')] || '' : '',
        role: col('role') >= 0 ? cells[col('role')] || 'agent' : 'agent',
        password: col('password') >= 0 ? cells[col('password')] || '' : '',
        agencyId: col('agency') >= 0 || col('agency_id') >= 0 ? cells[Math.max(col('agency'), col('agency_id'))] || '' : '',
      }
    }).filter((r) => r.email.includes('@'))
    return rows
  }

  const handleImportFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => setImportRows(parseCSV(String(reader.result || '')))
    reader.readAsText(file)
  }

  const downloadTemplate = () => {
    const csv = 'email,full_name,role,password,agency\njane@company.com,Jane Doe,broker,,9b1c…\njohn@company.com,John Smith,agent,TempPass123!,a1b2…\n'
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = 'users-import-template.csv'
    a.click()
  }

  const runImport = async () => {
    if (!importRows.length) return
    setImportBusy(true)
    try {
      const res = await authenticatedFetch('/api/admin/users/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ users: importRows.map((r) => ({ ...r, agencyId: r.agencyId || null })) }),
      })
      const j = await res.json()
      if (!res.ok || !j.ok) { toast(j.error || 'Import failed', 'error'); return }
      setImportResults(j.results || [])
      toast(`Import done: ${j.created} created, ${j.failed} failed ✅`, 'success')
      load()
    } catch (e: any) { toast(e.message, 'error') } finally { setImportBusy(false) }
  }

  const exportCSV = () => {
    if (!users.length) { toast('Nothing to export', 'error'); return }
    const rows = users.map((u) => ({ email: u.email, full_name: u.full_name || '', role: u.role, status: u.status, agency: u.memberships?.map((m) => m.agency_id).join(';') || '', plan: u.subscription?.tier || '', plan_status: u.subscription?.status || '', last_login: u.last_login || '', created_at: u.created_at || '' }))
    const headers = Object.keys(rows[0])
    const csv = [headers.join(','), ...rows.map((r) => headers.map((h) => `"${String((r as any)[h] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = 'users-export.csv'
    a.click()
    toast('CSV exported 📄', 'success')
  }

  const genLoginLink = async (u: UserRow) => {
    setBusy(true)
    try {
      const res = await authenticatedFetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'login_link', email: u.email }),
      })
      const j = await res.json()
      if (j.ok) setLoginLink({ email: u.email, url: j.url })
      else toast(j.error || 'Failed to generate link', 'error')
    } finally { setBusy(false) }
  }

  const load = useCallback(async () => {
    try {
      const [uRes, aRes] = await Promise.all([
        authenticatedFetch('/api/admin/users'),
        authenticatedFetch('/api/admin/agencies').then((r) => r.json().catch(() => ({ ok: false }))),
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
      const res = await authenticatedFetch('/api/admin/users', {
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
    const res = await authenticatedFetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, ...patch }),
    })
    const j = await res.json()
    if (j.ok) { toast('Updated ✅', 'success'); load() } else toast(j.error || 'Update failed', 'error')
  }

  const confirmBan = async () => {
    if (!banTarget || banConfirm.trim().toLowerCase() !== banTarget.email.toLowerCase()) {
      toast('Email does not match — ban cancelled', 'error')
      return
    }
    setBusy(true)
    await patchUser(banTarget.id, { status: 'banned', reason: banReason.trim() || null })
    setBusy(false)
    setBanTarget(null)
    setBanConfirm('')
    setBanReason('')
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
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '40px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ color: '#c9a84c', fontSize: 12, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 700 }}>Platform Control</div>
          <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 30, color: '#1a1a2e', margin: '6px 0 0' }}>User Management</h1>
          <p style={{ color: '#888', fontSize: 14, margin: '6px 0 0' }}>Create users, assign roles, link agencies. Ban = full kill-switch (auth revoked, sessions killed, listings unpublished). {users.length} users.</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={exportCSV} style={{ border: '2px solid #1a1a2e', color: '#1a1a2e', padding: '9px 18px', borderRadius: 8, background: '#fff', fontWeight: 800, fontSize: 13.5, cursor: 'pointer' }}>⬇️ Export CSV</button>
          <button onClick={() => { setShowImport(!showImport); setImportResults(null); setImportRows([]) }} style={{ background: '#0f766e', color: '#fff', padding: '11px 22px', borderRadius: 8, border: 'none', fontWeight: 800, cursor: 'pointer' }}>
            ⬆️ Import CSV
          </button>
          <button onClick={() => setShowCreate(!showCreate)} style={{ background: '#1a1a2e', color: '#c9a84c', padding: '11px 22px', borderRadius: 8, border: 'none', fontWeight: 800, cursor: 'pointer' }}>
            {showCreate ? 'Cancel' : '+ Create User'}
          </button>
        </div>
      </div>

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
              <th style={{ padding: '10px 12px' }}>Actions</th>
              <th style={{ padding: '10px 12px' }}>Last Login</th>
              <th style={{ padding: '10px 12px' }}>Agency</th>
              <th style={{ padding: '10px 12px' }}>Plan</th>
              <th style={{ padding: '10px 12px' }}>Created</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const st = STATUS_STYLE[u.status] || STATUS_STYLE.inactive
              return (
                <tr key={u.id} style={{ borderBottom: '1px solid #ece8dc', background: u.status === 'banned' ? '#fef2f2' : undefined }}>
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {u.avatar_url ? <img src={u.avatar_url} style={{ width: 30, height: 30, borderRadius: '50%', objectFit: 'cover' }} /> : <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#1a1a2e', color: '#c9a84c', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 800 }}>{(u.full_name || u.email)[0]?.toUpperCase()}</div>}
                      <div>
                        <div style={{ fontWeight: 700 }}>{u.full_name || '—'} {u.auth_banned && <span style={{ fontSize: 10, background: '#ef44441a', color: '#b91c1c', padding: '2px 6px', borderRadius: 99, fontWeight: 800 }}>AUTH BANNED</span>}</div>
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
                    <span style={{ background: st.bg, color: st.color, padding: '4px 12px', borderRadius: 99, fontSize: 11.5, fontWeight: 800, textTransform: 'uppercase' }}>{u.status}</span>
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {u.status === 'banned' ? (
                        <SmallBtn color="#15803d" bg="#22c55e1a" onClick={() => patchUser(u.id, { status: 'active' })}>♻️ Reactivate</SmallBtn>
                      ) : u.status === 'active' ? (
                        <>
                          <SmallBtn color="#b45309" bg="#f59e0b1a" onClick={() => patchUser(u.id, { status: 'locked', reason: 'Manual lock' })}>🔒 Lock</SmallBtn>
                          <SmallBtn color="#64748b" bg="#94a3b81a" onClick={() => patchUser(u.id, { status: 'inactive' })}>⏸ Suspend</SmallBtn>
                          <SmallBtn color="#b91c1c" bg="#ef44441a" onClick={() => setBanTarget(u)}>🚫 Ban</SmallBtn>
                        </>
                      ) : (
                        <>
                          <SmallBtn color="#15803d" bg="#22c55e1a" onClick={() => patchUser(u.id, { status: 'active' })}>▶️ Activate</SmallBtn>
                          {u.status !== 'banned' && <SmallBtn color="#b91c1c" bg="#ef44441a" onClick={() => setBanTarget(u)}>🚫 Ban</SmallBtn>}
                        </>
                      )}
                      <SmallBtn color="#1d4ed8" bg="#3b82f61a" onClick={() => genLoginLink(u)} disabled={busy}>🔗 Login</SmallBtn>
                    </div>
                  </td>
                  <td style={{ padding: '10px 12px', color: '#555', fontSize: 12.5 }}>{u.last_login ? new Date(u.last_login).toLocaleString() : 'never'}</td>
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
                  <td style={{ padding: '10px 12px', color: '#555' }}>{u.subscription ? `${u.subscription.tier} · ${u.subscription.status}` : '—'}</td>
                  <td style={{ padding: '10px 12px', color: '#888' }}>{u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Ban confirmation modal — type the email to confirm */}
      {banTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)', display: 'grid', placeItems: 'center', zIndex: 50, padding: 24 }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 28, maxWidth: 440, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,.3)' }}>
            <div style={{ fontSize: 34, marginBottom: 8 }}>🚫</div>
            <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 20, color: '#1a1a2e', margin: '0 0 6px' }}>Ban {banTarget.full_name || banTarget.email}?</h2>
            <p style={{ color: '#64748b', fontSize: 13.5, lineHeight: 1.6, margin: '0 0 16px' }}>
              This is a <b>full kill-switch</b>: their login is disabled, all sessions are revoked immediately, and every listing they own is unpublished from the marketplace. This can be reversed later.
            </p>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 4 }}>Reason (optional, saved to audit log)</div>
              <input className="input" value={banReason} onChange={(e) => setBanReason(e.target.value)} placeholder="e.g. Fraudulent listing, chargeback abuse" style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #d8d2c2', fontSize: 14 }} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 4 }}>Type <b style={{ color: '#b91c1c' }}>{banTarget.email}</b> to confirm</div>
              <input className="input" value={banConfirm} onChange={(e) => setBanConfirm(e.target.value)} placeholder="user@email.com" style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #d8d2c2', fontSize: 14 }} />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => { setBanTarget(null); setBanConfirm(''); setBanReason('') }} style={{ padding: '10px 18px', borderRadius: 8, border: '1px solid #d8d2c2', background: '#fff', color: '#334155', fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
              <button
                onClick={confirmBan}
                disabled={busy || banConfirm.trim().toLowerCase() !== banTarget.email.toLowerCase()}
                style={{ padding: '10px 22px', borderRadius: 8, border: 'none', background: banConfirm.trim().toLowerCase() === banTarget.email.toLowerCase() ? '#b91c1c' : '#e2e8f0', color: banConfirm.trim().toLowerCase() === banTarget.email.toLowerCase() ? '#fff' : '#94a3b8', fontWeight: 800, cursor: banConfirm.trim().toLowerCase() === banTarget.email.toLowerCase() ? 'pointer' : 'not-allowed' }}
              >
                {busy ? 'Banning…' : '🚫 Ban User'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk import modal */}
      {showImport && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)', display: 'grid', placeItems: 'center', zIndex: 50, padding: 24 }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 28, maxWidth: 640, width: '100%', maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 30 }}>⬆️</div>
                <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 20, color: '#1a1a2e', margin: '6px 0 2px' }}>Bulk Import Users</h2>
                <p style={{ color: '#64748b', fontSize: 13, margin: 0 }}>CSV columns: <b>email, full_name, role, password, agency</b> (agency = agency id; password optional — generated if blank). Max 100 rows.</p>
              </div>
              <button onClick={() => setShowImport(false)} style={{ background: 'none', border: 'none', fontSize: 22, color: '#94a3b8', cursor: 'pointer' }}>✕</button>
            </div>

            <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
              <label style={{ flex: 1, padding: '12px 16px', border: '2px dashed #d8d2c2', borderRadius: 10, textAlign: 'center', color: '#334155', fontWeight: 700, fontSize: 13.5, cursor: 'pointer', background: '#f8fafc' }}>
                📄 Choose CSV file
                <input type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImportFile(f) }} />
              </label>
              <button onClick={downloadTemplate} style={{ padding: '12px 18px', borderRadius: 10, border: '1px solid #d8d2c2', background: '#fff', color: '#334155', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>⬇️ Template</button>
            </div>

            {importRows.length > 0 && !importResults && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 13, color: '#64748b', marginBottom: 8 }}><b>{importRows.length}</b> valid row(s) parsed — first 5:</div>
                <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                    <thead><tr style={{ background: '#f8fafc', textAlign: 'left', color: '#334155' }}><th style={{ padding: '8px 10px' }}>Email</th><th style={{ padding: '8px 10px' }}>Name</th><th style={{ padding: '8px 10px' }}>Role</th></tr></thead>
                    <tbody>
                      {importRows.slice(0, 5).map((r, i) => (
                        <tr key={i} style={{ borderTop: '1px solid #f1f5f9' }}><td style={{ padding: '8px 10px' }}>{r.email}</td><td style={{ padding: '8px 10px' }}>{r.full_name || '—'}</td><td style={{ padding: '8px 10px' }}>{r.role}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button onClick={runImport} disabled={importBusy} style={{ marginTop: 14, padding: '12px 28px', borderRadius: 8, border: 'none', background: '#0f766e', color: '#fff', fontWeight: 800, fontSize: 14, cursor: importBusy ? 'wait' : 'pointer' }}>
                  {importBusy ? 'Importing…' : `🚀 Import ${importRows.length} users`}
                </button>
              </div>
            )}

            {importResults && (
              <div>
                <div style={{ fontSize: 13.5, color: '#334155', marginBottom: 10 }}>
                  ✅ <b>{importResults.filter((r) => r.ok).length}</b> created · ❌ <b>{importResults.filter((r) => !r.ok).length}</b> failed
                </div>
                <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden', maxHeight: 300, overflowY: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                    <thead><tr style={{ background: '#f8fafc', textAlign: 'left', color: '#334155' }}><th style={{ padding: '8px 10px' }}>Email</th><th style={{ padding: '8px 10px' }}>Result</th></tr></thead>
                    <tbody>
                      {importResults.map((r, i) => (
                        <tr key={i} style={{ borderTop: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '8px 10px' }}>{r.email}</td>
                          <td style={{ padding: '8px 10px', color: r.ok ? '#15803d' : '#b91c1c' }}>
                            {r.ok ? (r.password ? `✅ created — temp password: ${r.password}` : '✅ created') : `❌ ${r.error}`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 14 }}>
                  <button onClick={() => { setShowImport(false); setImportResults(null); setImportRows([]) }} style={{ padding: '10px 22px', borderRadius: 8, border: 'none', background: '#1a1a2e', color: '#c9a84c', fontWeight: 800, cursor: 'pointer' }}>Done</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Login link modal — support toolbox: open to set a new password, then sign in as that user */}
      {loginLink && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)', display: 'grid', placeItems: 'center', zIndex: 50, padding: 24 }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 28, maxWidth: 560, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,.3)' }}>
            <div style={{ fontSize: 34, marginBottom: 8 }}>🔗</div>
            <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 20, color: '#1a1a2e', margin: '0 0 6px' }}>Login link for {loginLink.email}</h2>
            <p style={{ color: '#64748b', fontSize: 13.5, lineHeight: 1.6, margin: '0 0 14px' }}>
              Open this link to set a new password and sign in <b>as this user</b> (support / troubleshooting). It is a recovery link — the user can also use it themselves.
            </p>
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 14px', fontSize: 12.5, color: '#334155', wordBreak: 'break-all', marginBottom: 16, fontFamily: 'monospace' }}>{loginLink.url}</div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => { navigator.clipboard?.writeText(loginLink.url); toast('Copied 📋', 'success') }} style={{ padding: '10px 18px', borderRadius: 8, border: '1px solid #d8d2c2', background: '#fff', color: '#334155', fontWeight: 700, cursor: 'pointer' }}>Copy</button>
              <button onClick={() => setLoginLink(null)} style={{ padding: '10px 22px', borderRadius: 8, border: 'none', background: '#1a1a2e', color: '#c9a84c', fontWeight: 800, cursor: 'pointer' }}>Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function SmallBtn({ children, onClick, color, bg, disabled }: { children: React.ReactNode; onClick: () => void; color: string; bg: string; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{ background: bg, color, padding: '5px 10px', borderRadius: 6, fontSize: 11.5, fontWeight: 800, border: 'none', cursor: disabled ? 'wait' : 'pointer' }}>{children}</button>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  )
}

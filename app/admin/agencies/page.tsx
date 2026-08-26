'use client'

// =============================================================================
// /admin/agencies — Platform tenant control (super admin only).
// Every CRM tenant: members, listings, plan state. Suspend = freeze the whole
// tenant (access + marketplace presence). Lock = payment hold.
// =============================================================================

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { authenticatedFetch } from '@/lib/authenticatedFetch'
import { LoadingState } from '@/components/ui'
import { useToast } from '@/components/ui/Toast'

interface AgencyRow {
  id: string
  name: string
  slug: string | null
  plan_type: string | null
  is_active: boolean
  paid_plan_active: boolean
  trial_active: boolean
  locked_at: string | null
  created_at: string | null
  members: number
  listings: number
  live_listings: number
  subscription: { tier: string; status: string } | null
}

export default function AdminAgenciesPage() {
  const toast = useToast()
  const [agencies, setAgencies] = useState<AgencyRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await authenticatedFetch('/api/admin/agencies')
      const j = await res.json()
      if (!res.ok || !j.ok) { setError(j.error || 'Access denied'); return }
      setAgencies(j.agencies || [])
    } catch { setError('Failed to load agencies.') } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const act = async (id: string, action: string, reason?: string) => {
    setBusy(id)
    try {
      const res = await authenticatedFetch('/api/admin/agencies', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action, reason }),
      })
      const j = await res.json()
      if (j.ok) { toast(`Agency ${action} ✅`, 'success'); load() } else toast(j.error || 'Failed', 'error')
    } finally { setBusy(null) }
  }

  const confirmSuspend = (a: AgencyRow) => {
    const reason = window.prompt(`Suspend "${a.name}"? This freezes their login access and unpublishes all their listings. Reason (optional):`)
    if (reason === null) return
    act(a.id, 'suspend', reason || undefined)
  }

  if (loading) return <LoadingState label="Loading agencies..." />
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
      <div style={{ marginBottom: 24 }}>
        <div style={{ color: '#c9a84c', fontSize: 12, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 700 }}>Platform Control</div>
        <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 30, color: '#1a1a2e', margin: '6px 0 0' }}>Agency Control</h1>
        <p style={{ color: '#888', fontSize: 14, margin: '6px 0 0' }}>Every tenant: members, listings, plan state. Suspend freezes an entire tenant; Lock is a payment hold.</p>
      </div>

      <div style={{ background: '#fff', border: '1px solid #ece8dc', borderRadius: 14, padding: 20, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: '#1a1a2e', borderBottom: '2px solid #1a1a2e' }}>
              <th style={{ padding: '10px 12px' }}>Agency</th>
              <th style={{ padding: '10px 12px' }}>Plan</th>
              <th style={{ padding: '10px 12px' }}>Members</th>
              <th style={{ padding: '10px 12px' }}>Listings</th>
              <th style={{ padding: '10px 12px' }}>Status</th>
              <th style={{ padding: '10px 12px' }}>Actions</th>
              <th style={{ padding: '10px 12px' }}>Created</th>
            </tr>
          </thead>
          <tbody>
            {agencies.map((a) => (
              <tr key={a.id} style={{ borderBottom: '1px solid #ece8dc', background: !a.is_active ? '#fef2f2' : a.locked_at ? '#fffbeb' : undefined }}>
                <td style={{ padding: '10px 12px' }}>
                  <div style={{ fontWeight: 700 }}>{a.name}</div>
                  <div style={{ fontSize: 12, color: '#888' }}>{a.slug || a.id.slice(0, 8)}</div>
                </td>
                <td style={{ padding: '10px 12px' }}>
                  <div>{a.plan_type || 'free'}</div>
                  {a.subscription && <div style={{ fontSize: 11.5, color: '#888' }}>{a.subscription.tier} · {a.subscription.status}</div>}
                </td>
                <td style={{ padding: '10px 12px' }}>{a.members}</td>
                <td style={{ padding: '10px 12px' }}>{a.live_listings} live / {a.listings} total</td>
                <td style={{ padding: '10px 12px' }}>
                  {!a.is_active ? <Pill color="#b91c1c" bg="#ef44441a">SUSPENDED</Pill>
                    : a.locked_at ? <Pill color="#b45309" bg="#f59e0b1a">LOCKED</Pill>
                    : a.paid_plan_active ? <Pill color="#15803d" bg="#22c55e1a">PAID</Pill>
                    : a.trial_active ? <Pill color="#1d4ed8" bg="#3b82f61a">TRIAL</Pill>
                    : <Pill color="#64748b" bg="#94a3b81a">FREE</Pill>}
                </td>
                <td style={{ padding: '10px 12px' }}>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {!a.is_active ? (
                      <Btn color="#15803d" bg="#22c55e1a" disabled={busy === a.id} onClick={() => act(a.id, 'unsuspend')}>▶️ Unsuspend</Btn>
                    ) : (
                      <Btn color="#b91c1c" bg="#ef44441a" disabled={busy === a.id} onClick={() => confirmSuspend(a)}>⏸ Suspend</Btn>
                    )}
                    {a.locked_at
                      ? <Btn color="#15803d" bg="#22c55e1a" disabled={busy === a.id} onClick={() => act(a.id, 'unlock')}>🔓 Unlock</Btn>
                      : <Btn color="#b45309" bg="#f59e0b1a" disabled={busy === a.id} onClick={() => act(a.id, 'lock', 'Payment hold')}>🔒 Lock</Btn>}
                  </div>
                </td>
                <td style={{ padding: '10px 12px', color: '#888' }}>{a.created_at ? new Date(a.created_at).toLocaleDateString() : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Pill({ children, color, bg }: { children: React.ReactNode; color: string; bg: string }) {
  return <span style={{ background: bg, color, padding: '4px 12px', borderRadius: 99, fontSize: 11, fontWeight: 800, textTransform: 'uppercase' }}>{children}</span>
}

function Btn({ children, onClick, color, bg, disabled }: { children: React.ReactNode; onClick: () => void; color: string; bg: string; disabled?: boolean }) {
  return <button onClick={onClick} disabled={disabled} style={{ background: bg, color, padding: '6px 11px', borderRadius: 7, fontSize: 12, fontWeight: 800, border: 'none', cursor: disabled ? 'wait' : 'pointer' }}>{children}</button>
}

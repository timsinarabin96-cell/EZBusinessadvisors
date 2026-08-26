/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useCallback, useEffect, useState } from 'react'
import { useToast } from '@/components/ui/Toast'
import { fetchClientAccess, grantClientAccess, revokeClientAccess, type ClientAccess } from '@/lib/clientPortal'

// =============================================================================
// DataRoomAccessPanel — invite/revoke access to a deal's shared workspace.
// -----------------------------------------------------------------------------
// Broker invites buyers, sellers, agents, attorneys, or lenders by email:
//   * Choose a role (viewer / editor / uploader / commenter)
//   * Optional expiry (access auto-revokes — "delete the user when done")
//   * Every invite sends the branded portal link by email
//   * One-click Revoke locks the link instantly + keeps the audit trail
// The invited party opens the portal → sees the Dropbox-style data room,
// fillable agreements, and messages. No login needed — the link IS the key.
// =============================================================================

const APP_URL = typeof window !== 'undefined' ? window.location.origin : ''

const ROLE_LABEL: Record<string, string> = {
  viewer: '👁 Viewer — see everything',
  uploader: '⬆ Uploader — view + upload',
  editor: '✏️ Editor — view, upload, edit, rename',
  commenter: '💬 Commenter — view + comment',
}

interface DealOption { id: string; title: string | null }

export default function DataRoomAccessPanel({ dealId, dealTitle }: { dealId: string; dealTitle?: string | null }) {
  const toast = useToast()
  const [access, setAccess] = useState<ClientAccess[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('viewer')
  const [expiryDays, setExpiryDays] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState<string>('')

  const load = useCallback(async () => {
    setAccess(await fetchClientAccess(dealId))
    setLoading(false)
  }, [dealId])

  useEffect(() => { load() }, [load])

  const invite = async () => {
    if (!name.trim() || !email.trim()) { toast('Name and email are required', 'error'); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { toast('Enter a valid email address', 'error'); return }
    setBusy(true)
    try {
      const granted = await grantClientAccess({ dealId, clientName: name.trim(), clientEmail: email.trim() })
      if (!granted) { toast('Invite failed — try again', 'error'); return }
      // Send the branded invite email with the portal link (server-side).
      const portalUrl = `${APP_URL}/portal/${dealId}/${granted.token}`
      await fetch('/api/portal/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dealId, accessId: granted.id, clientName: name.trim(), clientEmail: email.trim(), role, expiryDays: expiryDays ? Number(expiryDays) : 0, portalUrl }),
      }).catch(() => {})
      toast(`Invited ${name.trim()} — portal link sent by email`, 'success')
      setName(''); setEmail(''); setRole('viewer'); setExpiryDays('')
      await load()
    } finally {
      setBusy(false)
    }
  }

  const revoke = async (a: ClientAccess) => {
    if (!confirm(`Revoke access for ${a.client_name || a.client_email}? Their link stops working immediately.`)) return
    await revokeClientAccess(a.id)
    await fetch('/api/portal/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dealId, accessId: a.id, revoke: true, clientEmail: a.client_email }),
    }).catch(() => {})
    toast('Access revoked', 'success')
    await load()
  }

  const copyLink = async (a: ClientAccess) => {
    try {
      await navigator.clipboard.writeText(`${APP_URL}/portal/${dealId}/${a.token}`)
      setCopied(a.id)
      setTimeout(() => setCopied(''), 1600)
    } catch {
      toast('Could not copy — copy the link from the portal page', 'error')
    }
  }

  const active = access.filter((a) => a.status !== 'revoked')

  return (
    <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 20, marginTop: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <span style={{ fontSize: 20 }}>🔑</span>
        <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 18, color: 'var(--navy)', margin: 0 }}>Share this deal room</h2>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{active.length} active {active.length === 1 ? 'invitee' : 'invitees'}</span>
      </div>
      <p style={{ color: 'var(--muted)', fontSize: 13, margin: '0 0 16px' }}>
        Invite buyers, sellers, agents, attorneys, or lenders by email — they get a secure link to view, upload, edit, and create folders. Revoke anytime; access dies instantly.
      </p>

      {/* Invite form */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, marginBottom: 12 }}>
        <input placeholder="Full name (e.g. John Buyer)" value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
        <input placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
        <select value={role} onChange={(e) => setRole(e.target.value)} style={inputStyle}>
          {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input placeholder="Expires in days (optional)" type="number" min="1" value={expiryDays} onChange={(e) => setExpiryDays(e.target.value)} style={inputStyle} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={invite}
          disabled={busy}
          style={{ padding: '11px 22px', borderRadius: 8, background: 'var(--navy)', color: '#fff', border: 'none', fontWeight: 800, fontSize: 13.5, cursor: 'pointer' }}
        >
          {busy ? 'Inviting…' : '📧 Invite by email'}
        </button>
      </div>

      {/* Invitee list */}
      {loading ? (
        <div style={{ color: 'var(--muted)', fontSize: 13, padding: '12px 0' }}>Loading invitees…</div>
      ) : access.length === 0 ? (
        <div style={{ color: 'var(--muted)', fontSize: 13, padding: '16px 0', borderTop: '1px solid var(--line)', marginTop: 12 }}>
          No one invited yet. Add the buyer, seller, or agent above — the data room and agreements open through their private link.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid var(--line)', marginTop: 12, paddingTop: 12 }}>
          {access.map((a) => {
            const isRevoked = a.status === 'revoked'
            return (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, background: isRevoked ? '#f8fafc' : '#fcfbf7', border: `1px solid ${isRevoked ? '#e2e8f0' : 'var(--line)'}`, flexWrap: 'wrap', opacity: isRevoked ? 0.65 : 1 }}>
                <span style={{ fontSize: 18 }}>{isRevoked ? '🚫' : '🔓'}</span>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--ink)' }}>{a.client_name || '—'}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>{a.client_email}{isRevoked ? ' · revoked' : ' · active'}</div>
                </div>
                {!isRevoked && (
                  <button onClick={() => copyLink(a)} style={tinyBtn}>
                    {copied === a.id ? '✓ Copied' : '🔗 Copy link'}
                  </button>
                )}
                <button onClick={() => revoke(a)} disabled={isRevoked} style={{ ...tinyBtn, color: '#b91c1c', borderColor: '#fecaca', background: '#fef2f2', cursor: isRevoked ? 'not-allowed' : 'pointer' }}>
                  {isRevoked ? 'Revoked' : '🗑 Revoke / delete'}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  padding: '10px 12px', borderRadius: 8, border: '1px solid var(--line)', background: '#fff',
  fontSize: 13.5, color: 'var(--ink)', fontFamily: 'inherit',
}

const tinyBtn: React.CSSProperties = {
  padding: '7px 14px', borderRadius: 7, background: '#fff', border: '1px solid var(--line)',
  color: 'var(--navy)', fontWeight: 700, fontSize: 12.5, cursor: 'pointer', textDecoration: 'none',
}

/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

// ---------------------------------------------------------------------------
// AgencySigningCard — the agency's stored signing identity, used to AUTO
// counter-sign every buyer NDA (app/api/public/nda/sign/route.ts reads
// agencies.signing_name/signing_title). Owner/admins set it once here;
// every future NDA from this agency is signed with it.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState } from 'react'

import { useToast } from '@/components/ui/Toast'
import { fetchUserAgencyContext } from '@/lib/agencies'
import { authenticatedFetch } from '@/lib/authenticatedFetch'

interface SigningIdentity {
  id: string
  name: string
  signing_name: string | null
  signing_title: string | null
  signing_signature: string | null
}

export default function AgencySigningCard() {
  const toast = useToast()
  const [agency, setAgency] = useState<SigningIdentity | null>(null)
  const [canEdit, setCanEdit] = useState(false)
  const [name, setName] = useState('')
  const [title, setTitle] = useState('')
  const [signature, setSignature] = useState('')
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    try {
      const ctx = await fetchUserAgencyContext()
      if (!ctx.agency) return
      setCanEdit(Boolean(ctx.isOwner || ctx.role === 'admin'))
      const res = await authenticatedFetch(`/api/agency/signing?agencyId=${encodeURIComponent(ctx.agency.id)}`)
      const json = await res.json()
      const s = (json.signing as SigningIdentity) || null
      setAgency(s || ({ id: ctx.agency.id } as SigningIdentity))
      setName(s?.signing_name || '')
      setTitle(s?.signing_title || '')
      setSignature(s?.signing_signature || '')
    } catch {
      /* degrade silently */
    } finally {
      setLoaded(true)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function save() {
    if (!agency || !canEdit) return
    setSaving(true)
    try {
      const res = await authenticatedFetch('/api/agency/signing', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agencyId: agency.id,
          signingName: name,
          signingTitle: title,
          signingSignature: signature,
        }),
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error || 'Save failed')
      toast('Signing identity saved — new NDAs will be counter-signed with it.', 'success')
      setAgency({ ...agency, signing_name: name, signing_title: title, signing_signature: signature })
    } catch (e: any) {
      toast(e.message || 'Save failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 16, padding: 22, maxWidth: 640 }}>
      <div style={{ fontSize: 12, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 800, color: '#8a6d1a' }}>
        ✍️ NDA Auto-Sign Identity
      </div>
      <div style={{ fontWeight: 800, fontSize: 18, margin: '4px 0 2px' }}>Who signs for {agency?.name || 'your agency'}?</div>
      <div style={{ fontSize: 13.5, color: 'var(--muted)', marginBottom: 18 }}>
        Every buyer NDA is automatically counter-signed with this name + title. Set it once — it applies to all current and future listings.
      </div>

      {!loaded ? (
        <div style={{ color: 'var(--muted)', fontSize: 13.5 }}>Loading…</div>
      ) : !agency ? (
        <div style={{ color: 'var(--muted)', fontSize: 13.5 }}>No agency membership found.</div>
      ) : !canEdit ? (
        <div style={{ color: 'var(--muted)', fontSize: 13.5 }}>Only the agency owner or an admin can change the signing identity.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 12.5, fontWeight: 700, display: 'block', marginBottom: 5 }}>Signing name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Rabin Timsina"
              maxLength={200}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--line)', fontSize: 14, fontFamily: 'inherit' }}
            />
          </div>
          <div>
            <label style={{ fontSize: 12.5, fontWeight: 700, display: 'block', marginBottom: 5 }}>Signing title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Principal Broker"
              maxLength={200}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--line)', fontSize: 14, fontFamily: 'inherit' }}
            />
          </div>
          <div>
            <label style={{ fontSize: 12.5, fontWeight: 700, display: 'block', marginBottom: 5 }}>Typed signature (optional)</label>
            <textarea
              value={signature}
              onChange={(e) => setSignature(e.target.value)}
              placeholder="Full legal name as it should appear on the signature line"
              maxLength={2000}
              rows={2}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--line)', fontSize: 14, fontFamily: 'inherit', resize: 'vertical' }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              onClick={save}
              disabled={saving}
              style={{ padding: '11px 22px', borderRadius: 10, background: 'var(--gold)', color: 'var(--navy)', border: 'none', fontWeight: 800, fontSize: 14, cursor: saving ? 'wait' : 'pointer' }}
            >
              {saving ? 'Saving…' : 'Save signing identity'}
            </button>
            {signature && (
              <div style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: 15, color: 'var(--navy)' }}>
                {signature}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

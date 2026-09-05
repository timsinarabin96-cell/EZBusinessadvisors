/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useCallback, useEffect, useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import { Chip, GoldButton, PageHero, PremiumSelect, SectionTitle, SoftButton } from '@/components/ui/premium'
import { LoadingState } from '@/components/ui'
import { getAgencyContext } from '@/lib/agencyContext'
import { getStoredAccessToken } from '@/lib/authToken'

// =============================================================================
// Demand Letter Studio — in-app drafts ONLY. Nothing here sends email.
// Composes niche demand letters (gas stations / NEMT) with the agency's own
// branding and tracks status: draft → ready → archived.
// =============================================================================

type Niche = 'gas_station' | 'nemt'
type Status = 'draft' | 'ready' | 'archived'

interface LetterRow {
  id: string
  agency_id: string
  niche: Niche
  status: Status
  recipient_name: string | null
  business_name: string | null
  location: string | null
  subject: string
  body: string
  created_at: string
}

const NICHES: { key: Niche; label: string; icon: string }[] = [
  { key: 'gas_station', label: '⛽ Gas Stations & C-Stores', icon: '⛽' },
  { key: 'nemt', label: '🚐 NEMT / Medical Transport', icon: '🚐' },
]

const STATUS_TONE: Record<Status, 'green' | 'gray' | 'navy'> = {
  draft: 'gray',
  ready: 'green',
  archived: 'navy',
}

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

const inputStyle: React.CSSProperties = {
  width: '100%',
  border: '1px solid rgba(15,52,96,.14)',
  borderRadius: 12,
  padding: '10px 12px',
  fontSize: 13,
  outline: 0,
  boxShadow: '0 4px 12px rgba(15,23,42,.04)',
}

export default function DemandLettersPage() {
  const [agencyId, setAgencyId] = useState('')
  const [letters, setLetters] = useState<LetterRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')

  const [niche, setNiche] = useState<Niche>('gas_station')
  const [recipientName, setRecipientName] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [location, setLocation] = useState('')
  const [preview, setPreview] = useState<LetterRow | null>(null)

  const load = useCallback(async (ag: string) => {
    const token = getStoredAccessToken()
    const res = await fetch(`/api/demand-letters?agencyId=${ag}`, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    }).catch(() => null)
    const json = await res?.json().catch(() => ({}))
    setLetters(json?.letters || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    ;(async () => {
      const ctx = await getAgencyContext()
      const ag = ctx?.agencyId || ''
      if (ag) {
        setAgencyId(ag)
        await load(ag)
      } else {
        setLoading(false)
      }
    })()
  }, [load])

  const compose = async (status: Status) => {
    if (!agencyId) return
    setBusy(true)
    setNotice('')
    const token = getStoredAccessToken()
    const res = await fetch('/api/demand-letters', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        agencyId,
        niche,
        status,
        recipientName: recipientName || undefined,
        businessName: businessName || undefined,
        location: location || undefined,
      }),
    }).catch(() => null)
    const json = await res?.json().catch(() => ({}))
    setBusy(false)
    if (json?.ok && json?.letter) {
      setPreview(json.letter as LetterRow)
      setNotice(`Saved as ${status}.`)
      await load(agencyId)
    } else {
      setNotice(`Failed: ${json?.error || 'unknown error'}`)
    }
  }

  const setStatus = async (id: string, status: Status) => {
    const token = getStoredAccessToken()
    await fetch(`/api/demand-letters/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ status }),
    }).catch(() => null)
    await load(agencyId)
  }

  const remove = async (id: string) => {
    const token = getStoredAccessToken()
    await fetch(`/api/demand-letters/${id}`, {
      method: 'DELETE',
      headers: token ? { authorization: `Bearer ${token}` } : {},
    }).catch(() => null)
    await load(agencyId)
  }

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setNotice('Copied to clipboard.')
    } catch {
      setNotice('Copy failed — select the text manually.')
    }
  }

  return (
    <AppShell active="Demand Letters">
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '0 18px 60px' }}>
        <PageHero
          icon="✉️"
          eyebrow="Outreach Prep"
          title="Demand Letter Studio"
          sub="Compose niche demand letters as in-app drafts — preview, copy, or print. Nothing is emailed from here."
        />

        {loading ? (
          <LoadingState label="Loading letters…" />
        ) : (
          <>
            {/* ── Composer ── */}
            <div style={{ display: 'grid', gap: 14, background: '#fff', border: '1px solid rgba(15,52,96,.08)', borderRadius: 18, padding: 22, boxShadow: '0 10px 30px rgba(15,23,42,.05)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <PremiumSelect label="Niche" value={niche} onChange={(v) => setNiche(v as Niche)}>
                  {NICHES.map((n) => (
                    <option key={n.key} value={n.key}>{n.label}</option>
                  ))}
                </PremiumSelect>
                <label style={{ display: 'grid', gap: 5 }}>
                  <span style={{ color: 'var(--muted)', fontSize: 11, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase' }}>Recipient name</span>
                  <input style={inputStyle} value={recipientName} onChange={(e) => setRecipientName(e.target.value)} placeholder="Owner / contact (optional)" />
                </label>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <label style={{ display: 'grid', gap: 5 }}>
                  <span style={{ color: 'var(--muted)', fontSize: 11, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase' }}>Business name</span>
                  <input style={inputStyle} value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="e.g. Express Fuel & Mart" />
                </label>
                <label style={{ display: 'grid', gap: 5 }}>
                  <span style={{ color: 'var(--muted)', fontSize: 11, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase' }}>Location</span>
                  <input style={inputStyle} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="City / state (optional)" />
                </label>
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <GoldButton disabled={busy} onClick={() => compose('draft')}>
                  {busy ? 'Working…' : 'Compose & save as draft'}
                </GoldButton>
                <SoftButton disabled={busy} onClick={() => compose('ready')}>
                  Save as ready
                </SoftButton>
                {notice && <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{notice}</span>}
              </div>
            </div>

            {/* ── Preview ── */}
            {preview && (
              <div style={{ marginTop: 18, background: '#fff', border: '1px solid rgba(15,52,96,.08)', borderRadius: 18, padding: 22 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <SectionTitle eyebrow={preview.niche === 'nemt' ? '🚐 NEMT' : '⛽ Gas Station'} title={preview.subject} />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <SoftButton onClick={() => copy(preview.body)}>Copy</SoftButton>
                    <SoftButton onClick={() => window.print()}>Print</SoftButton>
                  </div>
                </div>
                <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'Georgia, serif', fontSize: 13.5, lineHeight: 1.65, color: 'var(--navy)', margin: 0 }}>{preview.body}</pre>
              </div>
            )}

            {/* ── Saved letters ── */}
            <div style={{ marginTop: 26 }}>
              <SectionTitle eyebrow={`${letters.length} total`} title="Saved letters" />
              {letters.length === 0 ? (
                <div style={{ padding: '28px 0', color: 'var(--muted)', fontSize: 13.5 }}>No letters yet — compose your first draft above.</div>
              ) : (
                <div style={{ display: 'grid', gap: 10 }}>
                  {letters.map((l) => (
                    <div key={l.id} style={{ background: '#fff', border: '1px solid rgba(15,52,96,.08)', borderRadius: 14, padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 800, fontSize: 13.5, color: 'var(--navy)' }}>
                          {l.subject}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>
                          {NICHES.find((n) => n.key === l.niche)?.icon} {l.business_name || '—'}
                          {l.location ? ` · ${l.location}` : ''} · {fmtDate(l.created_at)}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                        <Chip tone={STATUS_TONE[l.status]}>{l.status}</Chip>
                        {l.status === 'draft' && (
                          <SoftButton onClick={() => setStatus(l.id, 'ready')}>Mark ready</SoftButton>
                        )}
                        {l.status !== 'archived' && (
                          <SoftButton onClick={() => setStatus(l.id, 'archived')}>Archive</SoftButton>
                        )}
                        <SoftButton onClick={() => copy(l.body)}>Copy</SoftButton>
                        <SoftButton onClick={() => remove(l.id)}>Delete</SoftButton>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </AppShell>
  )
}

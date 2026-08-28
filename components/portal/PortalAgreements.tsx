/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useCallback, useEffect, useState } from 'react'
import { useToast } from '@/components/ui/Toast'
import DocumentSheet, { type SheetBrand } from '@/components/portal/DocumentSheet'

// =============================================================================
// PortalAgreements — two-sided fillable agreements for portal clients.
// -----------------------------------------------------------------------------
// The client (buyer/seller) opens their portal link, sees which agreements
// need their signature, fills the fields, and signs by typing their name.
// The broker completes their side in the dashboard. When every party has
// signed, the document shows "Signed ✅".
// =============================================================================

interface PortalSignature {
  id: string
  party_key: string
  party_name: string | null
  role: string | null
  status: 'unsigned' | 'signed' | 'declined' | 'expired'
  signed_at?: string | null
}

interface PortalDocument {
  id: string
  title: string
  status: string
  body_template?: string | null
  filled_data: Record<string, unknown>
  parties: Array<{ key: string; label: string; role: string; name: string | null; email: string | null }>
  partyKey: string | null
  signatures: PortalSignature[]
  allSigned: boolean
}

const ROLE_COLOR: Record<string, string> = {
  buyer: '#2563eb',   // blue — buyer fills these
  seller: '#15803d',  // green — seller fills these
  agent: '#c9a84c',   // gold — broker/agent
  custom: '#7c3aed',
}

export default function PortalAgreements({ dealId, token }: { dealId: string; token: string }) {
  const toast = useToast()
  const [docs, setDocs] = useState<PortalDocument[]>([])
  const [brand, setBrand] = useState<SheetBrand>({ agencyName: 'EZ Business Advisors', logoUrl: null })
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [signName, setSignName] = useState<Record<string, string>>({})
  const [drafts, setDrafts] = useState<Record<string, Record<string, unknown>>>({})

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/portal/documents?dealId=${encodeURIComponent(dealId)}&token=${encodeURIComponent(token)}`, { cache: 'no-store' })
      const j = await res.json()
      if (j.ok) {
        setDocs(j.documents || [])
        if (j.brand) setBrand(j.brand)
      }
    } catch {
      // non-fatal — the section just stays empty
    } finally {
      setLoading(false)
    }
  }, [dealId, token])

  useEffect(() => { load() }, [load])

  const saveDraft = async (docId: string) => {
    setBusyId(docId)
    try {
      const res = await fetch('/api/portal/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dealId, token, action: 'fill', documentId: docId, filledData: drafts[docId] || {} }),
      })
      const j = await res.json()
      if (j.ok) toast('Your details have been saved', 'success')
      else toast(j.error || 'Save failed', 'error')
    } catch {
      toast('Save failed', 'error')
    } finally {
      setBusyId(null)
    }
  }

  const sign = async (doc: PortalDocument, partyKey: string) => {
    const name = (signName[doc.id] || '').trim()
    if (!name) { toast('Type your full name to sign', 'error'); return }
    setBusyId(doc.id)
    try {
      const res = await fetch('/api/portal/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dealId, token, action: 'sign', documentId: doc.id, partyKey, name }),
      })
      const j = await res.json()
      if (j.ok) { toast('Signed ✅', 'success'); load() }
      else toast(j.error || 'Sign failed', 'error')
    } catch {
      toast('Sign failed', 'error')
    } finally {
      setBusyId(null)
    }
  }

  if (loading) return null
  if (docs.length === 0) return null

  const myParty = (doc: PortalDocument) => doc.parties.find((p) => p.key === doc.partyKey) || doc.parties[0]
  const mySignature = (doc: PortalDocument) => doc.signatures.find((s) => s.party_key === doc.partyKey) || doc.signatures.find((s) => s.status === 'unsigned') || doc.signatures[0]
  const mySigned = (doc: PortalDocument) => {
    const sig = mySignature(doc)
    return sig ? sig.status === 'signed' : false
  }

  return (
    <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: 20, gridColumn: '1 / -1' }}>
      <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 18, color: 'var(--navy)', margin: '0 0 4px' }}>📝 Agreements — Review, Fill & Sign</h2>
      <p style={{ color: 'var(--muted)', fontSize: 13, margin: '0 0 16px' }}>
        Documents that need your input. Fill your details, then sign by typing your full name. Your broker completes their side; the document locks when everyone has signed.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {docs.map((doc) => {
          const party = myParty(doc)
          const sig = mySignature(doc)
          const signed = mySigned(doc)
          const roleColor = party ? ROLE_COLOR[party.role] || '#7c3aed' : '#7c3aed'
          const signedCount = doc.signatures.filter((s) => s.status === 'signed').length
          const totalSigs = doc.signatures.length

          return (
            <div key={doc.id} style={{ border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
              {/* Full branded legal document — letterhead, agreement text, signature blocks */}
              <DocumentSheet doc={doc} brand={brand} />

              {/* Fill & sign controls */}
              <div style={{ padding: 16, borderTop: '1px solid var(--line)', background: signed ? '#f7faf6' : '#fcfbf7' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
                <span style={{ fontSize: 17 }}>{signed ? '✅' : '📄'}</span>
                <strong style={{ fontFamily: 'Georgia, serif', fontSize: 15, color: 'var(--navy)', flex: 1 }}>{doc.title}</strong>
                <span style={{ fontSize: 11.5, fontWeight: 800, padding: '3px 10px', borderRadius: 99, background: signed ? '#dcfce7' : '#fef3c7', color: signed ? '#15803d' : '#b45309' }}>
                  {doc.allSigned || signedCount === totalSigs ? 'Signed ✅' : `Signatures ${signedCount}/${totalSigs}`}
                </span>
              </div>

              {party && (
                <div style={{ fontSize: 12, color: roleColor, fontWeight: 700, marginBottom: 10 }}>
                  Your role: {party.label || party.role} {signed && '· signed ✓'}
                </div>
              )}

              {!signed && (
                <>
                  {/* Fill fields — the client enters their own info */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginBottom: 12 }}>
                    {[
                      { key: 'buyer_name', label: 'Your full name' },
                      { key: 'buyer_email', label: 'Your email' },
                      { key: 'buyer_company', label: 'Company / entity (if any)' },
                      { key: 'seller_name', label: 'Your full name' },
                      { key: 'seller_email', label: 'Your email' },
                    ].map((f) => {
                      const val = (drafts[doc.id]?.[f.key] ?? doc.filled_data[f.key] ?? '') as string
                      const isMine = f.key.startsWith(party.role)
                      if (!isMine && !doc.filled_data[f.key]) return null
                      return (
                        <label key={f.key} style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {f.label}
                          <input
                            style={{ padding: '9px 10px', borderRadius: 6, border: `1.5px solid ${isMine ? roleColor : 'var(--line)'}`, background: '#fff', fontSize: 13.5, color: 'var(--ink)' }}
                            value={val}
                            onChange={(e) => setDrafts((d) => ({ ...d, [doc.id]: { ...(d[doc.id] || {}), [f.key]: e.target.value } }))}
                          />
                        </label>
                      )
                    })}
                  </div>

                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                    <button
                      onClick={() => saveDraft(doc.id)}
                      disabled={busyId === doc.id}
                      style={{ padding: '9px 16px', borderRadius: 8, background: '#fff', border: '1.5px solid var(--navy)', color: 'var(--navy)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
                    >
                      {busyId === doc.id ? 'Saving…' : 'Save my details'}
                    </button>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flex: 1, justifyContent: 'flex-end' }}>
                      <input
                        placeholder="Type your full name to sign"
                        value={signName[doc.id] || ''}
                        onChange={(e) => setSignName((d) => ({ ...d, [doc.id]: e.target.value }))}
                        style={{ padding: '9px 12px', borderRadius: 6, border: '1.5px solid var(--line)', background: '#fff', fontSize: 13.5, minWidth: 220, flex: 1 }}
                      />
                      <button
                        onClick={() => sig && sign(doc, sig.party_key)}
                        disabled={busyId === doc.id || !sig}
                        style={{ padding: '10px 18px', borderRadius: 8, background: 'var(--navy)', color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer', border: 'none' }}
                      >
                        {busyId === doc.id ? 'Signing…' : 'Sign ✍️'}
                      </button>
                    </div>
                  </div>
                </>
              )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

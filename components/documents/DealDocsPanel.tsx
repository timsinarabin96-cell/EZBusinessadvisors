/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useCallback, useEffect, useState } from 'react'
import { fetchTemplates, fetchDocuments, fetchSignatures, createDocument, updateDocument, type DocumentTemplate, type FilledDocument, type FilledParty, type DocumentSignature } from '@/lib/documentBuilder'
import { fetchListing, type Listing } from '@/lib/listings'
import SignaturePad from './SignaturePad'
import { getStoredAccessToken } from '@/lib/authToken'

// =============================================================================
// Deal Docs & eSign — per-listing legal pack hub (like DocuSign).
// Seller pack: Marketing Agreement · Listing Agreement · LLC/Corporate
// Resolution · Property Addendum. Buyer pack: NDA · Buyer Profile · Due
// Diligence Checklist · Purchase Agreement. One click generates the whole pack
// auto-filled from the listing, with signature slots for broker + sellers +
// buyer. Every doc is saved under the listing and audit-logged.
// =============================================================================

const SELLER_TEMPLATES = ['Marketing Agreement', 'Listing Agreement', 'Resolution', 'Property Addendum']
const BUYER_TEMPLATES = ['NDA', 'Buyer Profile', 'Due Diligence', 'Purchase Agreement']

// Match by fuzzy substring so agencies' own templates (e.g. "EZ Marketing Agreement 2026")
// land in the right pack automatically.
const tplMatches = (name: string, keys: string[]) => keys.some((k) => name.toLowerCase().includes(k.toLowerCase()))

export default function DealDocsPanel({ listingId }: { listingId: string }) {
  const [listing, setListing] = useState<Listing | null>(null)
  const [templates, setTemplates] = useState<DocumentTemplate[]>([])
  const [docs, setDocs] = useState<FilledDocument[]>([])
  const [signatures, setSignatures] = useState<Record<string, DocumentSignature[]>>({})
  const [me, setMe] = useState<{ id: string; email?: string; full_name?: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [signTarget, setSignTarget] = useState<{ sigId: string; partyName: string } | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [l, tpls, d, user] = await Promise.all([
        fetchListing(listingId),
        fetchTemplates(true),
        fetchDocuments(listingId),
        import('@/lib/supabase/client').then(({ supabase }) => supabase.auth.getUser()),
      ])
      setListing(l)
      setTemplates(tpls)
      setDocs(d)
      setMe(user.data.user ? { id: user.data.user.id, email: user.data.user.email, full_name: (user.data.user.user_metadata?.full_name as string) || undefined } : null)
      const sigMap: Record<string, DocumentSignature[]> = {}
      await Promise.all(d.map(async (doc) => { sigMap[doc.id] = await fetchSignatures(doc.id) }))
      setSignatures(sigMap)
    } catch (e) {
      setError((e as Error).message || 'Failed to load docs')
    } finally {
      setLoading(false)
    }
  }, [listingId])

  useEffect(() => { load() }, [load])

  const templateByName = (name: string) => templates.find((t) => t.name === name) || null

  const genPack = async (pack: 'seller' | 'buyer') => {
    if (!listing) return
    setBusy(true)
    setError('')
    const names = pack === 'seller' ? SELLER_TEMPLATES : BUYER_TEMPLATES
    let created = 0
    for (const tplName of names) {
      const tpl = templateByName(tplName)
      if (!tpl) continue
      const existing = docs.some((d) => d.template_id === tpl.id)
      if (existing) continue

      const filled: Record<string, unknown> = {
        business_name: listing.business_name || '',
        asking_price: listing.asking_price ?? '',
        agency_name: me?.full_name || '',
        effective_date: new Date().toISOString().slice(0, 10),
        listing_date: new Date().toISOString().slice(0, 10),
        agreement_year: String(new Date().getFullYear()),
        resolution_date: new Date().toISOString().slice(0, 10),
        checklist_date: new Date().toISOString().slice(0, 10),
        profile_date: new Date().toISOString().slice(0, 10),
        addendum_date: new Date().toISOString().slice(0, 10),
      }
      // Fill template defaults for other fields.
      for (const f of tpl.fields) {
        if (filled[f.key] === undefined) filled[f.key] = f.type === 'select' ? (f.options?.[0] || '') : ''
      }

      const parties: FilledParty[] = tpl.parties.map((p) => ({
        key: p.key,
        label: p.label,
        role: p.role,
        name: p.role === 'agent' ? (me?.full_name || me?.email || null) : null,
        email: p.role === 'agent' ? (me?.email || null) : null,
      }))

      try {
        await createDocument({
          template_id: tpl.id,
          listing_id: listingId,
          title: `${tpl.name} — ${listing.business_name || 'listing'}`,
          filled_data: filled,
          parties,
        })
        created += 1

        // Auto-set the listing expiration from the Listing Agreement's
        // listing date + term months — agents track expiry with zero extra steps.
        if (tpl.name.toLowerCase().includes('listing agreement')) {
          const listingDate = String(filled.listing_date || '')
          const termMonths = Number(filled.term_months || 0)
          if (listingDate && termMonths > 0) {
            const expiresAt = new Date(new Date(listingDate + 'T12:00:00').getTime() + termMonths * 30.44 * 86400000).toISOString().slice(0, 10)
            const { supabase } = await import('@/lib/supabase/client')
            const { data: { session } } = await supabase.auth.getSession()
            if (session) {
              await fetch('/api/listings/expiry', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', authorization: `Bearer ${session.access_token}` },
                body: JSON.stringify({ action: 'set', listingId, expiresAt }),
              }).catch(() => {})
            }
          }
        }
      } catch (e) {
        setError((e as Error).message || `Failed to create ${tpl.name}`)
      }
    }
    if (created > 0) {
      await load()
      setBusy(false)
      return
    }
    setBusy(false)
    if (created === 0) setError(pack === 'seller' ? 'Seller pack is already generated.' : 'Buyer pack is already generated.')
  }

  const signedCount = (doc: FilledDocument) => {
    const sigs = signatures[doc.id] || []
    return sigs.filter((s) => s.status === 'signed').length
  }

  const exportSignedPack = async () => {
    setExporting(true)
    setError('')
    try {
      const { supabase } = await import('@/lib/supabase/client')
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token || getStoredAccessToken()
      const res = await fetch(`/api/documents/bundle?listingId=${encodeURIComponent(listingId)}&download=1`, {
        headers: { authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || 'Could not build the signed pack')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `signed-pack-${listing?.business_name?.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'deal'}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError((e as Error).message || 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  if (loading) return <div style={{ color: 'var(--muted)', padding: 24 }}>Loading deal docs…</div>

  const sellerDocs = docs.filter((d) => tplMatches(templates.find((t) => t.id === d.template_id)?.name || '', SELLER_TEMPLATES))
  const buyerDocs = docs.filter((d) => tplMatches(templates.find((t) => t.id === d.template_id)?.name || '', BUYER_TEMPLATES))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontFamily: 'Georgia, serif', color: 'var(--navy)' }}>📄 Deal Docs & eSign</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: 13 }}>
            Legal pack saved under this listing — generate, fill, and collect signatures (broker + sellers + buyer). Audit-logged.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn" onClick={() => genPack('seller')} disabled={busy} style={{ whiteSpace: 'nowrap' }}>📦 Generate Seller Pack</button>
          <button className="btn btn-primary" onClick={() => genPack('buyer')} disabled={busy} style={{ whiteSpace: 'nowrap' }}>🤝 Generate Buyer Pack</button>
          {docs.length > 0 && (
            <button className="btn" onClick={exportSignedPack} disabled={exporting} style={{ whiteSpace: 'nowrap', color: '#065f46', borderColor: '#a7f3d0', background: '#ecfdf5' }}>
              {exporting ? 'Building PDF…' : '📎 Download signed pack (PDF)'}
            </button>
          )}
        </div>
      </div>

      {error && <div style={{ padding: '10px 14px', borderRadius: 8, background: '#fdecea', color: '#b91c1c', fontSize: 13 }}>{error}</div>}

      {/* Seller pack */}
      <PackSection
        title="🧑‍💼 Seller pack"
        subtitle="Engagement + corporate authorization + financials + property"
        docs={sellerDocs}
        templates={templates}
        signatures={signatures}
        onSign={setSignTarget}
        onSend={async (docId) => {
          try {
            await updateDocument(docId, { status: 'pending_signature' })
            await load()
          } catch (e) {
            setError((e as Error).message || 'Could not send for signature')
          }
        }}
      />

      {/* Buyer pack */}
      <PackSection
        title="🤝 Buyer pack"
        subtitle="NDA → profile → diligence → purchase agreement"
        docs={buyerDocs}
        templates={templates}
        signatures={signatures}
        onSign={setSignTarget}
        onSend={async (docId) => {
          try {
            await updateDocument(docId, { status: 'pending_signature' })
            await load()
          } catch (e) {
            setError((e as Error).message || 'Could not send for signature')
          }
        }}
      />

      {/* Uploaded financials reminder */}
      <div style={{ padding: '14px 18px', borderRadius: 10, background: 'var(--cream)', border: '1px solid var(--line)', fontSize: 13, color: 'var(--muted)' }}>
        💡 <strong>Seller financials package</strong> (3 years P&L, tax returns, balance sheet, lease agreement, FFE list) — upload these under the listing's Documents tab or the Financial Files section. Add the Property Addendum when the business is sold with real estate.
      </div>

      {signTarget && (
        <SignaturePad
          signatureId={signTarget.sigId}
          partyName={signTarget.partyName}
          onDone={() => { setSignTarget(null); load() }}
          onCancel={() => setSignTarget(null)}
        />
      )}
    </div>
  )
}

function PackSection({
  title, subtitle, docs, templates, signatures, onSign, onSend,
}: {
  title: string
  subtitle: string
  docs: FilledDocument[]
  templates: DocumentTemplate[]
  signatures: Record<string, DocumentSignature[]>
  onSign: (t: { sigId: string; partyName: string }) => void
  onSend: (docId: string) => Promise<void>
}) {
  const tplName = (id: string | null) => templates.find((t) => t.id === id)?.name || 'Document'
  return (
    <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line)', background: '#faf9f4' }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--navy)' }}>{title}</div>
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>{subtitle}</div>
      </div>
      {docs.length === 0 ? (
        <div style={{ padding: '18px', color: 'var(--muted)', fontSize: 13 }}>
          No documents yet — click <strong>{title.includes('Seller') ? 'Generate Seller Pack' : 'Generate Buyer Pack'}</strong> above to create the full pack auto-filled from this listing.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {docs.map((doc) => {
            const sigs = signatures[doc.id] || []
            const signed = sigs.filter((s) => s.status === 'signed').length
            const allSigned = sigs.length > 0 && signed === sigs.length
            return (
              <div key={doc.id} style={{ padding: '12px 18px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 18 }}>{allSigned ? '✅' : '📄'}</span>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--navy)' }}>{tplName(doc.template_id)}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                    {doc.status.replace(/_/g, ' ')} · {signed}/{sigs.length} signatures
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {sigs.map((s) => (
                    <span
                      key={s.id}
                      style={{
                        fontSize: 11.5, fontWeight: 700, padding: '4px 10px', borderRadius: 99,
                        background: s.status === 'signed' ? '#ecfdf5' : '#f1f5f9',
                        color: s.status === 'signed' ? '#15803d' : '#64748b',
                        border: `1px solid ${s.status === 'signed' ? '#bbf7d0' : '#e2e8f0'}`,
                      }}
                    >
                      {s.party_name || (s.role || 'party')}{s.status === 'signed' ? ' ✓' : ''}
                    </span>
                  ))}
                  {sigs.some((s) => s.status === 'unsigned') && (
                    <button
                      className="btn"
                      style={{ padding: '4px 12px', fontSize: 12 }}
                      onClick={() => {
                        const next = sigs.find((s) => s.status === 'unsigned')!
                        onSign({ sigId: next.id, partyName: next.party_name || next.role || 'party' })
                      }}
                    >
                      ✍️ Sign
                    </button>
                  )}
                  {doc.status === 'draft' && (
                    <button
                      className="btn"
                      style={{ padding: '4px 12px', fontSize: 12, color: '#0e7490', borderColor: '#a5e3f2', background: '#f0f9ff' }}
                      onClick={() => onSend(doc.id)}
                    >
                      📨 Send for signature
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

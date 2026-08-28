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

const SELLER_TEMPLATES = ['Marketing Agreement', 'Listing Agreement', 'Financial Authorization', 'Resolution', 'Property Addendum']
const BUYER_TEMPLATES = ['NDA', 'Buyer Profile', 'Proof of Funds', 'Due Diligence', 'Purchase Agreement']

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
  // Seller details collected BEFORE generating the pack so the docs render
  // filled instead of showing [seller_name] / [commission_rate] placeholders.
  const [seller, setSeller] = useState({
    name: '', email: '', phone: '', address: '',
    commissionType: 'Percentage with Minimum', commissionRate: 10, commissionFlat: 50000, commissionMin: 15000,
    termMonths: 12, protectionMonths: 24, exclusive: 'Yes',
  })
  const [showSellerForm, setShowSellerForm] = useState(false)
  // Buyer details — collected before generating the buyer pack so the NDA,
  // Buyer Profile, and Purchase Agreement render filled instead of placeholders.
  const [buyer, setBuyer] = useState({ name: '', email: '', phone: '', address: '' })
  const [showBuyerForm, setShowBuyerForm] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      // Self-heal: make sure the pack templates exist (Financial Authorization,
      // Proof of Funds, …) even if the SQL seed hasn't been run yet. Fire and
      // forget — then reload so the new templates appear immediately.
      await fetch('/api/documents/templates/ensure', { method: 'POST' }).catch(() => {})
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
      // Pre-fill seller details from the listing record (contact_phone +
      // any seller info captured during intake) so the pack flow needs less typing.
      if (l) {
        const meta = (l as any)?.ai_metadata || {}
        const sellerName = String(meta?.seller_name || meta?.seller_entity || '')
        const sellerEmail = String(meta?.seller_email || '')
        const sellerPhone = String(meta?.seller_phone || (l as any)?.contact_phone || '')
        const sellerAddress = String(meta?.seller_address || '')
        setSeller((cur) => ({
          ...cur,
          name: sellerName || cur.name,
          email: sellerEmail || cur.email,
          phone: sellerPhone || cur.phone,
          address: sellerAddress || cur.address,
        }))
      }
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
    // Seller pack needs the seller's contact details upfront — never generate
    // a pack that renders as [seller_name] / [commission_rate] placeholders.
    if (pack === 'seller') {
      if (!seller.name.trim() || !seller.email.trim()) {
        setShowSellerForm(true)
        setError('Add the seller\'s name and email first — the legal docs need them to render correctly.')
        return
      }
    }
    // Buyer pack needs the buyer's name + email for the NDA / profile / purchase agreement.
    if (pack === 'buyer') {
      if (!buyer.name.trim() || !buyer.email.trim()) {
        setShowBuyerForm(true)
        setError('Add the buyer\'s name and email first — the legal docs need them to render correctly.')
        return
      }
    }
    setBusy(true)
    setError('')
    const names = pack === 'seller' ? SELLER_TEMPLATES : BUYER_TEMPLATES
    // Property Addendum only belongs in the pack when real estate is included.
    const filtered = pack === 'seller' && !listing.real_estate_included
      ? names.filter((n) => !n.toLowerCase().includes('property addendum'))
      : names
    let created = 0
    for (const tplName of filtered) {
      const tpl = templateByName(tplName)
      if (!tpl) continue
      const existing = docs.some((d) => d.template_id === tpl.id)
      if (existing) continue

      const listingDate = new Date().toISOString().slice(0, 10)
      const termMonths = Number(seller.termMonths) || 12
      const exclusive = seller.exclusive === 'No' ? 'non-exclusive' : 'exclusive'
      const filled: Record<string, unknown> = {
        business_name: listing.business_name || '',
        asking_price: listing.asking_price ?? '',
        listing_price: listing.asking_price ?? '',
        agency_name: me?.full_name || '',
        effective_date: new Date().toISOString().slice(0, 10),
        listing_date: listingDate,
        agreement_year: String(new Date().getFullYear()),
        resolution_date: new Date().toISOString().slice(0, 10),
        checklist_date: new Date().toISOString().slice(0, 10),
        profile_date: new Date().toISOString().slice(0, 10),
        addendum_date: new Date().toISOString().slice(0, 10),
        // Buyer details (collected above) — fill the buyer-pack templates.
        buyer_name: buyer.name,
        prospect_name: buyer.name,
        buyer_email: buyer.email,
        email: buyer.email,
        phone: buyer.phone || '',
        cell: buyer.phone || '',
        address: buyer.address || '',
        // Seller details (collected above) — the fields the PDF was missing.
        seller_name: seller.name,
        seller_entity: seller.name,
        seller_email: seller.email,
        seller_phone: seller.phone,
        seller_address: seller.address,
        commission_rate: seller.commissionRate ?? 10,
        commission_type: seller.commissionType,
        commission_flat: seller.commissionFlat ?? 0,
        commission_min: seller.commissionMin ?? 0,
        protection_months: seller.protectionMonths ?? 24,
        term_months: termMonths,
        exclusive,
        expiry_clause: `${termMonths} months after the Listing Date`,
        // Rendered commission language, driven by the commission structure option.
        commission_clause: (() => {
          const type = seller.commissionType
          const rate = seller.commissionRate ?? 0
          const flat = seller.commissionFlat ?? 0
          const min = seller.commissionMin ?? 0
          if (type === 'Flat Fee') return `a flat fee of \$${Number(flat).toLocaleString()}`
          if (type === 'Percentage with Minimum') return `${rate}% of the Total Sales Price, with a minimum of \$${Number(min).toLocaleString()}`
          if (type === 'Percentage or Minimum, Whichever is Greater') return `${rate}% of the Total Sales Price, or \$${Number(min).toLocaleString()}, whichever is greater`
          return `${rate}% of the Total Sales Price`
        })(),
        property_included: listing.real_estate_included ? 'Yes — see Property Addendum' : 'No',
        property_address: listing.property_address || '',
        property_value: listing.property_value ?? '',
        sale_type: 'Asset + Real Estate',
      }
      // Fill template defaults for other fields.
      for (const f of tpl.fields) {
        if (filled[f.key] === undefined) filled[f.key] = f.type === 'select' ? (f.options?.[0] || '') : ''
      }

      const parties: FilledParty[] = tpl.parties.map((p) => {
        if (p.role === 'agent') {
          return { key: p.key, label: p.label, role: p.role, name: me?.full_name || me?.email || null, email: me?.email || null }
        }
        if (pack === 'seller' && p.role === 'seller') {
          // First seller slot gets the collected contact; extra slots stay open.
          const isFirst = p.key === 'seller1' || p.key === 'member1' || p.key === 'officer1'
          return {
            key: p.key, label: p.label, role: p.role,
            name: isFirst ? seller.name || null : null,
            email: isFirst ? seller.email || null : null,
          }
        }
        return { key: p.key, label: p.label, role: p.role, name: null, email: null }
      })

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

      {/* Seller details — collected before generating the seller pack so the
          legal docs render filled (no [seller_name] placeholders). */}
      <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden' }}>
        <div
          style={{ padding: '12px 18px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', background: showSellerForm ? '#faf9f4' : '#fff' }}
          onClick={() => setShowSellerForm((s) => !s)}
        >
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--navy)' }}>🧑 Seller details</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              {seller.name && seller.email
                ? `${seller.name} · ${seller.email}${seller.phone ? ' · ' + seller.phone : ''}`
                : 'Add seller name / email / phone / address — used to fill the legal docs and signature requests'}
            </div>
          </div>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>{showSellerForm ? '▾ Hide' : '▸ Edit'}</span>
        </div>
        {showSellerForm && (
          <div style={{ padding: '16px 18px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>
              Seller name(s)
              <input className="input" value={seller.name} onChange={(e) => setSeller({ ...seller, name: e.target.value })} placeholder="e.g. John Smith & Jane Smith" style={{ fontSize: 13 }} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>
              Seller email
              <input className="input" value={seller.email} onChange={(e) => setSeller({ ...seller, email: e.target.value })} placeholder="seller@email.com" style={{ fontSize: 13 }} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>
              Seller phone
              <input className="input" value={seller.phone} onChange={(e) => setSeller({ ...seller, phone: e.target.value })} placeholder="(555) 123-4567" style={{ fontSize: 13 }} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>
              Seller address
              <input className="input" value={seller.address} onChange={(e) => setSeller({ ...seller, address: e.target.value })} placeholder="123 Main St, Harrisburg, PA" style={{ fontSize: 13 }} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>
              Commission structure
              <select className="input" value={seller.commissionType} onChange={(e) => setSeller({ ...seller, commissionType: e.target.value })} style={{ fontSize: 13 }}>
                <option value="Percentage of Total Sales Price">Percentage of Total Sales Price</option>
                <option value="Flat Fee">Flat Fee</option>
                <option value="Percentage with Minimum">Percentage with Minimum</option>
                <option value="Percentage or Minimum, Whichever is Greater">Percentage or Minimum, Whichever is Greater</option>
              </select>
            </label>
            {seller.commissionType !== 'Flat Fee' && (
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>
                Commission rate (%)
                <input className="input" type="number" value={seller.commissionRate} onChange={(e) => setSeller({ ...seller, commissionRate: Number(e.target.value) })} style={{ fontSize: 13 }} />
              </label>
            )}
            {seller.commissionType === 'Flat Fee' && (
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>
                Flat fee ($)
                <input className="input" type="number" value={seller.commissionFlat} onChange={(e) => setSeller({ ...seller, commissionFlat: Number(e.target.value) })} style={{ fontSize: 13 }} />
              </label>
            )}
            {(seller.commissionType === 'Percentage with Minimum' || seller.commissionType === 'Percentage or Minimum, Whichever is Greater') && (
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>
                Minimum commission ($)
                <input className="input" type="number" value={seller.commissionMin} onChange={(e) => setSeller({ ...seller, commissionMin: Number(e.target.value) })} style={{ fontSize: 13 }} />
              </label>
            )}
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>
              Term (months)
              <input className="input" type="number" value={seller.termMonths} onChange={(e) => setSeller({ ...seller, termMonths: Number(e.target.value) })} style={{ fontSize: 13 }} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>
              Protection period (months after term)
              <input className="input" type="number" value={seller.protectionMonths} onChange={(e) => setSeller({ ...seller, protectionMonths: Number(e.target.value) })} style={{ fontSize: 13 }} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>
              Exclusive listing?
              <select className="input" value={seller.exclusive} onChange={(e) => setSeller({ ...seller, exclusive: e.target.value })} style={{ fontSize: 13 }}>
                <option value="Yes">Yes — exclusive</option>
                <option value="No">No — non-exclusive</option>
              </select>
            </label>
          </div>
        )}
      </div>

      {/* Buyer details — collected before generating the buyer pack. */}
      <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden' }}>
        <div
          style={{ padding: '12px 18px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', background: showBuyerForm ? '#faf9f4' : '#fff' }}
          onClick={() => setShowBuyerForm((s) => !s)}
        >
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--navy)' }}>🤝 Buyer details</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              {buyer.name && buyer.email
                ? `${buyer.name} · ${buyer.email}${buyer.phone ? ' · ' + buyer.phone : ''}`
                : 'Add buyer name / email / phone / address — used to fill the NDA, buyer profile, and purchase agreement'}
            </div>
          </div>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>{showBuyerForm ? '▾ Hide' : '▸ Edit'}</span>
        </div>
        {showBuyerForm && (
          <div style={{ padding: '16px 18px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>
              Buyer name
              <input className="input" value={buyer.name} onChange={(e) => setBuyer({ ...buyer, name: e.target.value })} placeholder="e.g. John Smith" style={{ fontSize: 13 }} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>
              Buyer email
              <input className="input" value={buyer.email} onChange={(e) => setBuyer({ ...buyer, email: e.target.value })} placeholder="buyer@email.com" style={{ fontSize: 13 }} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>
              Buyer phone
              <input className="input" value={buyer.phone} onChange={(e) => setBuyer({ ...buyer, phone: e.target.value })} placeholder="(555) 123-4567" style={{ fontSize: 13 }} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>
              Buyer address
              <input className="input" value={buyer.address} onChange={(e) => setBuyer({ ...buyer, address: e.target.value })} placeholder="123 Main St, Harrisburg, PA" style={{ fontSize: 13 }} />
            </label>
          </div>
        )}
      </div>

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
            // Real eSign request: grant portal access + email a signing link.
            const token = await getStoredAccessToken()
            if (!token) throw new Error('Not authenticated')
            const res = await fetch('/api/documents/send-for-signature', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', authorization: `Bearer ${token}` },
              body: JSON.stringify({ documentId: docId }),
            })
            const json = await res.json().catch(() => ({ ok: false, error: 'Server error' }))
            if (!res.ok || !json.ok) throw new Error(json.error || 'Could not send for signature')
            setError('')
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
            // Real eSign request: grant portal access + email a signing link.
            const token = await getStoredAccessToken()
            if (!token) throw new Error('Not authenticated')
            const res = await fetch('/api/documents/send-for-signature', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', authorization: `Bearer ${token}` },
              body: JSON.stringify({ documentId: docId }),
            })
            const json = await res.json().catch(() => ({ ok: false, error: 'Server error' }))
            if (!res.ok || !json.ok) throw new Error(json.error || 'Could not send for signature')
            setError('')
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
                  {sigs.map((s, idx) => {
                    // Human-readable slot label: party name/email when filled,
                    // else "Seller 1" / "Buyer" style from the role key — never
                    // raw concatenated keys.
                    const roleLabel = (s.role || 'party')
                      .replace(/_/g, ' ')
                      .replace(/\b\w/g, (c) => c.toUpperCase())
                    const sameRole = sigs.filter((x) => (x.role || 'party') === (s.role || 'party')).length
                    const label = s.party_name || (sameRole > 1 ? `${roleLabel} ${idx + 1}` : roleLabel)
                    return (
                      <span
                        key={s.id}
                        style={{
                          fontSize: 11.5, fontWeight: 700, padding: '4px 10px', borderRadius: 99,
                          background: s.status === 'signed' ? '#ecfdf5' : '#f1f5f9',
                          color: s.status === 'signed' ? '#15803d' : '#64748b',
                          border: `1px solid ${s.status === 'signed' ? '#bbf7d0' : '#e2e8f0'}`,
                        }}
                      >
                        {label}{s.status === 'signed' ? ' ✓' : ''}
                      </span>
                    )
                  })}
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

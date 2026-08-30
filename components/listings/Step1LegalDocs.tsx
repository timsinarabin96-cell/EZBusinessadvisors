/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useEffect, useState } from 'react'
import { StepShell, stepField, stepLabel, stepBtn } from '@/components/listings/StepShell'
import { uploadListingDocument, fetchListingDocuments, completeStep } from '@/lib/workflow'
import { supabase } from '@/lib/supabase/client'
import DealDocsPanel from '@/components/documents/DealDocsPanel'
import { computeValuation } from '@/lib/valuation'
import { formatMoneyInput, parseMoneyInput, moneyChange } from '@/lib/moneyInput'
import { getStoredAccessToken } from '@/lib/authToken'

const fmtMoney = (n: number | null | undefined) =>
  n == null || isNaN(n) ? '—' : '$' + Math.round(n).toLocaleString('en-US')

// ---------------------------------------------------------------------------
// Step 1 — Legal Docs (listing agreement + disclosures)
// ---------------------------------------------------------------------------

export default function Step1LegalDocs({ listingId, onNext }: { listingId: string; onNext: () => void }) {
  const [docs, setDocs] = useState<any[]>([])
  const [agreementUrl, setAgreementUrl] = useState('')
  const [agreementName, setAgreementName] = useState('')
  const [busy, setBusy] = useState(false)
  const [previewDoc, setPreviewDoc] = useState<{ name: string; url: string } | null>(null)
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null)

  const load = async () => setDocs(await fetchListingDocuments(listingId))

  useEffect(() => { load() }, [listingId])

  const deleteDoc = async (d: any) => {
    if (!d?.id) { alert('Nothing to delete'); return }
    if (!confirm(`Delete "${d.file_name || d.document_type}"? This removes it from the deal record and storage.`)) return
    setDeletingDocId(d.id)
    try {
      const res = await fetch('/api/listings/documents/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingId, docId: d.id, fileUrl: d.file_url || '' }),
      })
      const j = await res.json().catch(() => ({ ok: false }))
      if (!res.ok || !j.ok) throw new Error(j.error || 'Delete failed')
      await load()
    } catch (e: any) {
      alert(e.message || 'Delete failed')
    } finally {
      setDeletingDocId(null)
    }
  }

  const addDoc = async (file: File, type: string) => {
    setBusy(true)
    try {
      // Upload to storage (best-effort) then record metadata.
      const path = `listing-docs/${listingId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
      const { error: upErr } = await supabase.storage.from('documents').upload(path, file)
      if (upErr) { alert('Upload failed — ensure the documents bucket exists'); setBusy(false); return }
      const url = supabase.storage.from('documents').getPublicUrl(path).data.publicUrl
      await uploadListingDocument(listingId, { document_type: type, file_name: file.name, file_url: url })
      await load()
    } finally { setBusy(false) }
  }

  const hasAgreement = docs.some((d) => d.document_type === 'listing_agreement')
  const ndaCount = docs.filter((d) => d.document_type === 'nda').length
  const ready = hasAgreement

  const markComplete = async () => { await completeStep(listingId, 1); onNext() }

  // ── Listing agreement eSign (gate): send to seller, track status ──────
  const [sellerEmail, setSellerEmail] = useState('')
  const [laStatus, setLaStatus] = useState<'none' | 'pending' | 'signed'>('none')
  const [laSending, setLaSending] = useState(false)
  const [laDocId, setLaDocId] = useState<string | null>(null)

  const loadLa = async () => {
    try {
      const token = getStoredAccessToken()
      const res = await fetch(`/api/listing-agreement/list`, { headers: { authorization: `Bearer ${token}` } })
      const j = await res.json().catch(() => ({}))
      const mine = (j.agreements || []).filter((a: any) => a.listing_id === listingId)
      if (mine.length > 0) {
        const a = mine[0]
        setLaDocId(a.id)
        setLaStatus(a.fully_signed ? 'signed' : 'pending')
        setSellerEmail(a.seller_email || '')
      } else {
        setLaStatus('none')
      }
    } catch { /* best-effort */ }
  }
  useEffect(() => { loadLa() }, [listingId])

  const sendLa = async () => {
    if (!sellerEmail.trim()) { alert('Enter the seller\'s email first'); return }
    setLaSending(true)
    try {
      const token = getStoredAccessToken()
      const res = await fetch('/api/listing-agreement/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ listingId, sellerEmail: sellerEmail.trim() }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.ok) throw new Error(j.error || 'Could not send')
      setLaDocId(j.documentId)
      setLaStatus('pending')
      alert('Listing agreement sent — the seller signs by email, then you approve it from the Listing Agreements page.')
    } catch (e: any) {
      alert(e.message || 'Could not send listing agreement')
    } finally {
      setLaSending(false)
    }
  }

  // ── Valuation: "your business is worth this much" ─────────────────────
  const [sde, setSde] = useState('')
  const [revenue, setRevenue] = useState('')
  const [ebitda, setEbitda] = useState('')
  const [industry, setIndustry] = useState('')
  const estimate = computeValuation({
    business_name: null,
    sde: parseMoneyInput(sde),
    annual_revenue: parseMoneyInput(revenue),
    ebitda: parseMoneyInput(ebitda),
    industry: industry || null,
    asking_price: null,
  })

  return (
    <StepShell
      step={1} title="Legal Documents" description="The signed listing agreement authorizes the engagement — nothing goes live without it."
      status="draft" onNext={markComplete} nextDisabled={!ready} nextLabel="Step 1 complete →"
    >
      {/* Listing agreement eSign gate */}
      <div style={{ marginBottom: 24, padding: 18, border: '1px solid rgba(201,168,76,0.5)', borderRadius: 12, background: '#fffdf7' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--navy)', marginBottom: 4 }}>📋 Exclusive Listing Agreement (required — the gate)</div>
        <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--muted)' }}>
          No listing goes live without a signed listing agreement. Send it to the seller — they sign by email, then you approve.
        </p>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input value={sellerEmail} onChange={(e) => setSellerEmail(e.target.value)} placeholder="Seller email" style={{ ...stepField, flex: 1, minWidth: 200 }} />
          <button
            onClick={sendLa}
            disabled={laSending || laStatus !== 'none'}
            style={{
              ...stepBtn(true),
              opacity: laStatus !== 'none' ? 0.55 : 1,
              cursor: laStatus !== 'none' || laSending ? 'not-allowed' : 'pointer',
              border: 'none',
            }}
          >
            {laSending ? 'Sending…' : laStatus === 'pending' ? '⏳ Sent — awaiting seller' : laStatus === 'signed' ? '✅ Signed' : '✉️ Send agreement to seller'}
          </button>
        </div>
        {laStatus === 'pending' && (
          <div style={{ marginTop: 10, fontSize: 13, color: '#92400e' }}>
            ⏳ Seller hasn't signed yet. You can keep filling the listing — it just can't go live until they do. When they sign, approve it from the{' '}
            <a href="/dashboard/deal-docs" style={{ color: 'var(--navy)', fontWeight: 700 }}>Listing Agreements page</a>.
          </div>
        )}
        {laStatus === 'signed' && (
          <div style={{ marginTop: 10, fontSize: 13, color: '#16a34a', fontWeight: 600 }}>✅ Listing agreement fully signed — this listing is authorized to go live.</div>
        )}
      </div>

      {/* Valuation — tell the seller what the business is worth */}
      <div style={{ marginBottom: 24, padding: 18, border: '1px solid var(--line)', borderRadius: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--navy)', marginBottom: 4 }}>💎 Business worth (valuation range)</div>
        <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--muted)' }}>
          Enter the basics to show the seller what the business is worth before setting the asking price.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
          <div>
            <label style={stepLabel}>SDE (seller's discretionary earnings)</label>
            <input value={formatMoneyInput(sde)} onChange={moneyChange(setSde)} placeholder="e.g. 120,000" style={stepField} inputMode="numeric" />
          </div>
          <div>
            <label style={stepLabel}>Annual revenue</label>
            <input value={formatMoneyInput(revenue)} onChange={moneyChange(setRevenue)} placeholder="e.g. 500,000" style={stepField} inputMode="numeric" />
          </div>
          <div>
            <label style={stepLabel}>EBITDA (optional)</label>
            <input value={formatMoneyInput(ebitda)} onChange={moneyChange(setEbitda)} placeholder="e.g. 80,000" style={stepField} inputMode="numeric" />
          </div>
          <div>
            <label style={stepLabel}>Industry (optional)</label>
            <input value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="e.g. Home Health" style={stepField} />
          </div>
        </div>
        {estimate ? (
          <div style={{ marginTop: 14, padding: '12px 16px', borderRadius: 10, background: 'var(--navy)', color: '#fff' }}>
            <div style={{ fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.7)', marginBottom: 4 }}>
              Estimated value range
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--gold)', fontFamily: 'Georgia, serif' }}>
              {fmtMoney(estimate.estimate_min)} – {fmtMoney(estimate.estimate_max)}
            </div>
            <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.6)', marginTop: 4 }}>
              {estimate.method || 'Blend of earnings multiple + revenue cross-check'}
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 12, fontSize: 12.5, color: 'var(--muted)' }}>Enter SDE or revenue to see the estimated range.</div>
        )}
      </div>

      {/* Signed listing agreement */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--navy)', marginBottom: 10 }}>Listing agreement (required)</div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input value={agreementName} onChange={(e) => setAgreementName(e.target.value)} placeholder="Document title (e.g. Listing Agreement — 2026)" style={{ ...stepField, flex: 1, minWidth: 220 }} onKeyDown={(e) => { if (hasAgreement) return }} />
          <label style={stepBtn(true)}>Choose file
            <input type="file" style={{ display: 'none' }} onChange={async (e) => { const f = e.target.files?.[0]; if (f) { setAgreementName(f.name); await addDoc(f, 'listing_agreement') } e.target.value = '' }} />
          </label>
        </div>
        {hasAgreement && <div style={{ marginTop: 8, fontSize: 13, color: '#16a34a', fontWeight: 600 }}>✓ Listing agreement uploaded</div>}
      </div>

      {/* Other legal docs */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--navy)', marginBottom: 10 }}>Supporting disclosures (optional)</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <label style={stepBtn(false)}>+ NDA template
            <input type="file" style={{ display: 'none' }} onChange={async (e) => { const f = e.target.files?.[0]; if (f) await addDoc(f, 'nda'); e.target.value = '' }} />
          </label>
          <label style={stepBtn(false)}>+ Financial proof / other
            <input type="file" style={{ display: 'none' }} onChange={async (e) => { const f = e.target.files?.[0]; if (f) await addDoc(f, 'financial_proof'); e.target.value = '' }} />
          </label>
        </div>
      </div>

      {/* Uploaded docs list — preview + delete on every doc */}
      <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {docs.map((d) => (
          <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 8 }}>
            <span style={{ fontSize: 16 }}>📎</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.file_name || d.document_type}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', textTransform: 'capitalize' }}>{d.document_type} · {d.status}</div>
            </div>
            {d.file_url && (
              <button onClick={() => setPreviewDoc({ name: d.file_name || d.document_type, url: d.file_url })} style={{ fontSize: 12, color: 'var(--navy)', fontWeight: 700, background: 'none', border: '1px solid var(--line)', borderRadius: 6, padding: '5px 10px', cursor: 'pointer' }}>👁 Preview</button>
            )}
            <button onClick={() => deleteDoc(d)} disabled={deletingDocId === d.id} style={{ fontSize: 12, color: '#dc2626', fontWeight: 700, background: 'none', border: '1px solid rgba(220,38,38,0.35)', borderRadius: 6, padding: '5px 10px', cursor: 'pointer' }}>{deletingDocId === d.id ? '…' : '✕ Delete'}</button>
          </div>
        ))}
        {docs.length === 0 && <div style={{ fontSize: 13, color: 'var(--muted)' }}>No documents uploaded yet.</div>}
      </div>

      {/* Document preview modal */}
      {previewDoc && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,11,23,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: 24 }} onClick={() => setPreviewDoc(null)}>
          <div style={{ background: '#fff', borderRadius: 12, maxWidth: 860, width: '100%', maxHeight: '90vh', overflow: 'auto', padding: 18 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#1a1a2e' }}>👁 {previewDoc.name}</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <a href={previewDoc.url} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, fontWeight: 700, color: '#1d4ed8' }}>Open in new tab ↗</a>
                <button onClick={() => setPreviewDoc(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#999' }}>✕</button>
              </div>
            </div>
            {previewDoc.url ? (
              /\.(png|jpe?g|gif|webp|svg)$/i.test(previewDoc.url) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewDoc.url} alt={previewDoc.name} style={{ width: '100%', borderRadius: 8 }} />
              ) : (
                <iframe src={previewDoc.url} title={previewDoc.name} style={{ width: '100%', height: '70vh', border: '1px solid #ece8dc', borderRadius: 8 }} />
              )
            ) : (
              <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>No preview available — use “Open in new tab”.</div>
            )}
          </div>
        </div>
      )}

      {/* Deal Docs & eSign — one-click legal pack, auto-filled + signed */}
      <div style={{ marginTop: 28 }}>
        <DealDocsPanel listingId={listingId} />
      </div>
    </StepShell>
  )
}

/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useEffect, useState } from 'react'
import { uploadListingDocument, fetchListingDocuments } from '@/lib/workflow'
import { supabase } from '@/lib/supabase/client'
import { getStoredAccessToken } from '@/lib/authToken'

// =============================================================================
// LegalDocsCard — the legal gate, inside the One-Shot Deal review.
// The signed exclusive listing agreement authorizes the engagement; nothing
// goes live without it. Also handles disclosures + NDA uploads and the seller
// eSign flow — all in the same one-step screen, no separate workflow.
// =============================================================================

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 11px', borderRadius: 8, border: '1px solid var(--line)',
  fontSize: 13, fontFamily: 'inherit', background: '#fff', color: 'var(--ink)', boxSizing: 'border-box',
}

export default function LegalDocsCard({ listingId }: { listingId: string }) {
  const [docs, setDocs] = useState<any[]>([])
  const [sellerEmail, setSellerEmail] = useState('')
  const [laStatus, setLaStatus] = useState<'none' | 'pending' | 'signed'>('none')
  const [laSending, setLaSending] = useState(false)
  const [uploading, setUploading] = useState<string | null>(null)

  const load = async () => {
    try {
      const list = await fetchListingDocuments(listingId)
      setDocs(list)
    } catch { setDocs([]) }
    try {
      const token = getStoredAccessToken()
      const res = await fetch('/api/listing-agreement/list', { headers: { authorization: `Bearer ${token}` } })
      const j = await res.json().catch(() => ({}))
      const mine = (j.agreements || []).filter((a: any) => a.listing_id === listingId)
      if (mine.length > 0) {
        setLaStatus(mine[0].fully_signed ? 'signed' : 'pending')
        setSellerEmail(mine[0].seller_email || '')
      } else {
        setLaStatus('none')
      }
    } catch { /* best-effort */ }
  }

  useEffect(() => { if (listingId) load() }, [listingId])

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
      setLaStatus('pending')
      alert('Listing agreement sent — the seller signs by email, then you approve it from the Listing Agreements page.')
      await load()
    } catch (e: any) {
      alert(e.message || 'Could not send listing agreement')
    } finally {
      setLaSending(false)
    }
  }

  const addDoc = async (file: File, type: string) => {
    setUploading(type)
    try {
      const path = `listing-docs/${listingId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
      const { error: upErr } = await supabase.storage.from('documents').upload(path, file)
      if (upErr) throw new Error('Upload failed — ensure the documents bucket exists')
      const url = supabase.storage.from('documents').getPublicUrl(path).data.publicUrl
      await uploadListingDocument(listingId, { document_type: type, file_name: file.name, file_url: url })
      await load()
    } catch (e: any) {
      alert(e.message || 'Upload failed')
    } finally {
      setUploading(null)
    }
  }

  const hasAgreement = docs.some((d) => d.document_type === 'listing_agreement')
  const ndaCount = docs.filter((d) => d.document_type === 'nda').length

  return (
    <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--navy)', fontFamily: 'Georgia, serif', marginBottom: 4 }}>⚖️ Legal & compliance</div>
      <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.55, marginBottom: 12 }}>
        The signed exclusive listing agreement authorizes the engagement — nothing goes live without it. Disclosures and NDAs ride along in the same deal room.
      </div>

      {/* Listing agreement eSign gate */}
      <div style={{ marginBottom: 14, padding: 14, border: '1px solid rgba(201,168,76,0.5)', borderRadius: 10, background: '#fffdf7' }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--navy)', marginBottom: 4 }}>📋 Exclusive Listing Agreement {laStatus === 'signed' && <span style={{ color: '#16a34a' }}>— ✅ signed</span>}{laStatus === 'pending' && <span style={{ color: '#92400e' }}>— ⏳ awaiting seller</span>}</div>
        <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--muted)' }}>
          {laStatus === 'signed' ? 'Fully signed — this listing is authorized to go live.' : 'Send it to the seller — they sign by email, then you approve.'}
        </p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input value={sellerEmail} onChange={(e) => setSellerEmail(e.target.value)} placeholder="Seller email" style={{ ...inputStyle, flex: 1, minWidth: 200 }} />
          <button
            type="button"
            onClick={sendLa}
            disabled={laSending || laStatus !== 'none'}
            style={{
              padding: '9px 16px', borderRadius: 8, border: 'none', cursor: laStatus !== 'none' || laSending ? 'not-allowed' : 'pointer',
              background: laStatus === 'signed' ? '#16a34a' : 'var(--navy)', color: '#fff', fontWeight: 700, fontSize: 12.5,
              opacity: laStatus !== 'none' ? 0.6 : 1,
            }}
          >
            {laSending ? 'Sending…' : laStatus === 'pending' ? '⏳ Sent — awaiting seller' : laStatus === 'signed' ? '✅ Signed' : '✉️ Send agreement to seller'}
          </button>
        </div>
        {laStatus === 'pending' && (
          <div style={{ marginTop: 8, fontSize: 12, color: '#92400e' }}>
            You can keep working — the listing just can't go live until the seller signs. Approve it from the{' '}
            <a href="/dashboard/deal-docs" style={{ color: 'var(--navy)', fontWeight: 700 }}>Listing Agreements page</a>.
          </div>
        )}
      </div>

      {/* Uploads: agreement / disclosures / NDA */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {([
          ['listing_agreement', '📄 Listing agreement (upload)', 'PDF'],
          ['disclosures', '📋 Disclosures', 'PDF'],
          ['nda', '🔒 NDA template', 'PDF'],
        ] as const).map(([type, label, accept]) => (
          <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ ...inputStyle, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>{label}{type === 'nda' && ndaCount > 0 ? ` (${ndaCount})` : ''}</span>
              <span style={{ color: hasAgreement && type === 'listing_agreement' ? '#16a34a' : '#64748b', fontSize: 12, fontWeight: 700 }}>
                {uploading === type ? 'Uploading…' : hasAgreement && type === 'listing_agreement' ? '✓ attached' : 'choose file'}
              </span>
              <input
                type="file"
                accept={accept}
                style={{ display: 'none' }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) addDoc(f, type); e.target.value = '' }}
              />
            </label>
          </div>
        ))}
        {docs.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
            {docs.slice(0, 6).map((d) => (
              <a key={d.id} href={d.file_url} target="_blank" rel="noreferrer" style={{ fontSize: 11.5, color: 'var(--navy)', textDecoration: 'none', display: 'flex', gap: 6 }}>
                📎 <span style={{ fontWeight: 600 }}>{d.file_name || d.document_type}</span>
                <span style={{ marginLeft: 'auto', color: '#2563eb' }}>Open ↗</span>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

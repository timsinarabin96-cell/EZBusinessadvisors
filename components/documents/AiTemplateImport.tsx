/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useRef, useState } from 'react'
import type { DocumentTemplate, TemplateField, TemplateParty } from '@/lib/documentBuilder'

// =============================================================================
// AiTemplateImport — upload your brokerage's ORIGINAL legal document (PDF,
// Word, text, even a scanned image). AI reads it, finds every blank (parties,
// business name, price, dates, commission, signatures) and returns a ready
// fillable template: fields, signature slots, and a body with {{placeholders}}.
// You review the AI's work, tweak if needed, and save to YOUR agency library.
// =============================================================================

interface AiInferred {
  name: string
  category: string
  description?: string | null
  fields: TemplateField[]
  parties: TemplateParty[]
  body_template: string
}

export default function AiTemplateImport({ agencyId, onSaved }: { agencyId?: string | null; onSaved?: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [inferred, setInferred] = useState<AiInferred | null>(null)
  const [sourceName, setSourceName] = useState('')
  const [saving, setSaving] = useState(false)

  const upload = async (file: File) => {
    setBusy(true)
    setError('')
    try {
      const fd = new FormData()
      fd.set('file', file)
      if (agencyId) fd.set('agencyId', agencyId)
      const res = await fetch('/api/documents/templates/import', { method: 'POST', body: fd })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.ok) throw new Error(j.error || 'AI import failed')
      setInferred(j.inferred)
      setSourceName(file.name)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'AI import failed')
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const save = async () => {
    if (!inferred) return
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/documents/templates/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: inferred.name,
          category: inferred.category,
          description: inferred.description,
          fields: inferred.fields,
          parties: inferred.parties,
          body_template: inferred.body_template,
          agencyId,
          sourceFileName: sourceName,
          aiExtracted: true,
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.ok) throw new Error(j.error || 'Save failed')
      setInferred(null)
      setSourceName('')
      onSaved?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const patch = (p: Partial<AiInferred>) => setInferred((cur) => (cur ? { ...cur, ...p } : cur))
  const patchField = (i: number, p: Partial<TemplateField>) => {
    if (!inferred) return
    patch({ fields: inferred.fields.map((f, idx) => (idx === i ? { ...f, ...p } : f)) })
  }
  const patchParty = (i: number, p: Partial<TemplateParty>) => {
    if (!inferred) return
    patch({ parties: inferred.parties.map((pr, idx) => (idx === i ? { ...pr, ...p } : pr)) })
  }

  if (!inferred) {
    return (
      <div style={{ background: '#fff', border: '1.5px dashed var(--line)', borderRadius: 12, padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--navy)' }}>⚡ AI Import — upload your own document</div>
            <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 3, maxWidth: 560 }}>
              Have your own listing agreement, NDA, or purchase contract? Upload the original (PDF, Word, text, or a scan) and AI finds every blank — parties, price, dates, commission, signatures — and builds a fillable template that auto-fills from each listing.
            </div>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg,.webp"
            style={{ display: 'none' }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f) }}
          />
          <button className="btn btn-primary" disabled={busy} onClick={() => fileRef.current?.click()} style={{ whiteSpace: 'nowrap' }}>
            {busy ? '⏳ AI reading…' : '📤 Upload & AI-fill'}
          </button>
        </div>
        {error && <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 8, background: '#fdecea', color: '#b91c1c', fontSize: 12.5 }}>{error}</div>}
      </div>
    )
  }

  const fieldCount = inferred.fields.length
  const partyCount = inferred.parties.length

  return (
    <div style={{ background: '#fff', border: '1.5px solid #0e7490', borderRadius: 12, padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--navy)' }}>🤖 AI found {fieldCount} fields · {partyCount} signature slots in <em>{sourceName}</em></div>
          <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 2 }}>Review below, tweak anything, then save to your agency library.</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={() => { setInferred(null); setSourceName(''); setError('') }}>Cancel</button>
          <button className="btn btn-primary" disabled={saving || fieldCount === 0} onClick={save}>
            {saving ? '💾 Saving…' : '💾 Save to my library'}
          </button>
        </div>
      </div>

      {error && <div style={{ padding: '8px 12px', borderRadius: 8, background: '#fdecea', color: '#b91c1c', fontSize: 12.5 }}>{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--navy)', display: 'flex', flexDirection: 'column', gap: 4 }}>
          Template name *
          <input style={inputStyle} value={inferred.name} onChange={(e) => patch({ name: e.target.value })} />
        </label>
        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--navy)', display: 'flex', flexDirection: 'column', gap: 4 }}>
          Category
          <select style={inputStyle} value={inferred.category} onChange={(e) => patch({ category: e.target.value })}>
            {['Listing Agreement', 'NDA', 'Purchase Agreement', 'Seller Documents', 'Buyer Documents', 'Marketing Agreement', 'Corporate Documents', 'LOI', 'Other'].map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--navy)', display: 'flex', flexDirection: 'column', gap: 4 }}>
          Description
          <input style={inputStyle} value={inferred.description || ''} onChange={(e) => patch({ description: e.target.value })} />
        </label>
      </div>

      {/* Fields */}
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)', marginBottom: 6 }}>
          Fill fields <span style={{ fontWeight: 400, color: 'var(--muted)' }}>— auto-detected blanks</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {inferred.fields.map((f, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <input style={{ ...inputStyle, width: 140 }} value={f.key} onChange={(e) => patchField(i, { key: e.target.value.replace(/[^a-z0-9_]/gi, '') })} />
              <input style={{ ...inputStyle, width: 170 }} value={f.label} onChange={(e) => patchField(i, { label: e.target.value })} />
              <select style={{ ...inputStyle, width: 105 }} value={f.type} onChange={(e) => patchField(i, { type: e.target.value as TemplateField['type'] })}>
                {['text', 'number', 'date', 'select', 'textarea', 'signature'].map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                <input type="checkbox" checked={!!f.required} onChange={(e) => patchField(i, { required: e.target.checked })} /> req
              </label>
              <button className="btn" style={{ padding: '2px 8px', fontSize: 11, color: '#b91c1c' }} onClick={() => patch({ fields: inferred.fields.filter((_, idx) => idx !== i) })}>✕</button>
            </div>
          ))}
          <button className="btn" style={{ alignSelf: 'flex-start', padding: '3px 10px', fontSize: 12 }} onClick={() => patch({ fields: [...inferred.fields, { key: '', label: '', type: 'text', required: false, placeholder: '' }] })}>+ Add field</button>
        </div>
      </div>

      {/* Parties */}
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)', marginBottom: 6 }}>Signature slots</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {inferred.parties.map((p, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <input style={{ ...inputStyle, width: 130 }} value={p.key} onChange={(e) => patchParty(i, { key: e.target.value.replace(/[^a-z0-9_]/gi, '') })} />
              <input style={{ ...inputStyle, width: 170 }} value={p.label} onChange={(e) => patchParty(i, { label: e.target.value })} />
              <select style={{ ...inputStyle, width: 105 }} value={p.role} onChange={(e) => patchParty(i, { role: e.target.value as TemplateParty['role'] })}>
                <option value="agent">Agent</option>
                <option value="seller">Seller</option>
                <option value="buyer">Buyer</option>
                <option value="custom">Custom</option>
              </select>
              <button className="btn" style={{ padding: '2px 8px', fontSize: 11, color: '#b91c1c' }} onClick={() => patch({ parties: inferred.parties.filter((_, idx) => idx !== i) })}>✕</button>
            </div>
          ))}
          <button className="btn" style={{ alignSelf: 'flex-start', padding: '3px 10px', fontSize: 12 }} onClick={() => patch({ parties: [...inferred.parties, { key: '', label: '', role: 'custom' }] })}>+ Add signer</button>
        </div>
      </div>

      {/* Body */}
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)', marginBottom: 6 }}>
          Document body <span style={{ fontWeight: 400, color: 'var(--muted)' }}>— your original language, blanks replaced with {'{{tokens}}'}</span>
        </div>
        <textarea
          style={{ ...inputStyle, width: '100%', minHeight: 180, fontFamily: 'monospace', fontSize: 12.5, lineHeight: 1.55 }}
          value={inferred.body_template}
          onChange={(e) => patch({ body_template: e.target.value })}
        />
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  padding: '7px 10px',
  borderRadius: 8,
  border: '1px solid var(--line, #d8d4c8)',
  background: '#fff',
  fontSize: 13,
  color: '#0f172a',
  outline: 'none',
}

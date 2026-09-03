/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

// =============================================================================
// MultiYearFinancialUpload — the Financial Intelligence Core's intake screen.
// -----------------------------------------------------------------------------
// Adaptive operating history: broker declares 1-5 years (a 2-year-old business
// gets exactly 2 year slots — no forced empty year 3). Per year: pick files,
// PREVIEW each one before upload, DELETE mistakes, then upload with the year
// stamped on every doc. After upload, stored docs show preview + delete.
// Feeds /api/financial/intelligence (universal reader) which persists
// per-document extractions into financial_extractions.
// =============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  uploadFinancialFiles, deleteFinancialFile, fetchFinancialFiles, fetchDealOptions,
  getAccessToken, fileKindOf, FILE_ICON, formatBytes, type FinancialDoc} from '@/lib/financialFiles'
import { detectUniversalDocTypeClient, UNIVERSAL_TYPE_SHORT_LABELS } from '@/lib/financialExtractor'
import { useToast } from '@/components/ui/Toast'
import DocOpenLink from '@/components/financial/DocOpenLink'

const MAX_YEARS = 5

interface YearSlot {
  year: number
  files: File[]
}

/** Client-side preview for a queued file (PDF iframe or image thumbnail). */
function QueuedPreview({ file }: { file: File }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    const objectUrl = URL.createObjectURL(file)
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [file])

  const kind = fileKindOf(file.name)
  if (kind === 'image' && url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={file.name} style={{ width: '100%', height: 110, objectFit: 'cover', display: 'block', background: '#f1f5f9' }} />
  }
  if (kind === 'pdf' && url) {
    return <iframe src={url} title={file.name} style={{ width: '100%', height: 110, border: 'none', background: '#f8fafc', pointerEvents: 'none' }} />
  }
  return (
    <div style={{ height: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', fontSize: 34 }}>
      {FILE_ICON[kind]}
    </div>
  )
}

export default function MultiYearFinancialUpload({ onAnalyzed }: { onAnalyzed?: (r: unknown) => void }) {
  const toast = useToast()
  const [deals, setDeals] = useState<{ id: string; title: string }[]>([])
  const [selected, setSelected] = useState('')
  const [operatingYears, setOperatingYears] = useState(3)
  const [slots, setSlots] = useState<YearSlot[]>([])
  const [stored, setStored] = useState<FinancialDoc[]>([])
  const [busy, setBusy] = useState<'upload' | 'analyze' | null>(null)
  const [step, setStep] = useState('')
  const [error, setError] = useState<string | null>(null)
  const inputRefs = useRef<Record<number, HTMLInputElement | null>>({})

  useEffect(() => {
    fetchDealOptions().then(setDeals).catch(() => setDeals([]))
  }, [])

  // Reset slots when the declared year count changes (adaptive history).
  useEffect(() => {
    setSlots(Array.from({ length: Math.min(operatingYears, MAX_YEARS) }, (_, i) => ({ year: i + 1, files: [] })))
  }, [operatingYears])

  const reloadStored = useCallback(async () => {
    if (!selected) { setStored([]); return }
    const all = await fetchFinancialFiles().catch(() => [] as FinancialDoc[])
    setStored(all.filter((d) => d.listing_id === selected || d.deal_id === selected))
  }, [selected])

  useEffect(() => { reloadStored() }, [reloadStored])

  const addFiles = (year: number, list: FileList | null) => {
    if (!list?.length) return
    setSlots((prev) => prev.map((slot) => {
      if (slot.year !== year) return slot
      const seen = new Set(slot.files.map((f) => f.name + '|' + f.size))
      const unique = Array.from(list).filter((f) => !seen.has(f.name + '|' + f.size))
      return { ...slot, files: [...slot.files, ...unique] }
    }))
    setError(null)
  }

  const removeQueued = (year: number, name: string) => {
    setSlots((prev) => prev.map((slot) =>
      slot.year === year ? { ...slot, files: slot.files.filter((f) => f.name !== name) } : slot,
    ))
  }

  const allQueued = useMemo(() => slots.flatMap((s) => s.files), [slots])

  const uploadAll = async () => {
    if (!selected) { setError('Select a listing / deal to attach the documents to.'); return }
    if (!allQueued.length) { setError('Add at least one document first.'); return }
    setBusy('upload'); setError(null)
    let ok = 0, failed = 0
    const errors: string[] = []
    for (const slot of slots) {
      if (!slot.files.length) continue
      setStep(`Uploading year ${slot.year} (${slot.files.length} doc${slot.files.length === 1 ? '' : 's'})…`)
      const result = await uploadFinancialFiles(
        { dealId: null, listingId: selected, parentId: selected },
        slot.files,
        undefined,
        { fiscalYear: slot.year, operatingYears },
      )
      ok += result.ok
      failed += result.failed
      errors.push(...result.errors)
    }
    if (failed) toast(`${failed} upload(s) failed`, 'error')
    if (ok) toast(`${ok} document(s) uploaded ✅`, 'success')
    if (errors.length) setError(errors[0])
    setSlots(slots.map((s) => ({ ...s, files: [] })))
    setBusy(null); setStep('')
    await reloadStored()
  }

  const analyze = async () => {
    if (!selected) { setError('Select a listing first.'); return }
    const token = await getAccessToken()
    if (!token) { setError('You must be signed in to analyze documents.'); return }
    setBusy('analyze'); setError(null); setStep('🧠 Reading every document — PDFs, scans, bank statements, POS summaries…')
    try {
      const res = await fetch('/api/financial/intelligence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ listingId: selected, fiscalYear: null }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'Analysis failed')
      onAnalyzed?.(data)
      toast('Financial intelligence updated ✅', 'success')
    } catch (e: any) {
      setError(e?.message || 'Analysis failed')
    } finally {
      setBusy(null); setStep('')
    }
  }

  const removeStored = async (doc: FinancialDoc) => {
    if (!confirm(`Delete "${doc.file_name}"? This removes the file and its extraction.`)) return
    const result = await deleteFinancialFile(doc)
    if (result.success) { toast('Document deleted', 'success'); reloadStored() }
    else toast(result.error || 'Delete failed', 'error')
  }

  const yearTag = (name: string) => {
    const type = detectUniversalDocTypeClient(name)
    return UNIVERSAL_TYPE_SHORT_LABELS[type] || type
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--line)',
    fontSize: 13.5, background: '#fff', color: 'var(--navy)', boxSizing: 'border-box',
  }

  return (
    <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 22 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <div>
          <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 19, color: 'var(--navy)', margin: 0 }}>📚 Multi-Year Financial Reader</h2>
          <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 2 }}>
            Upload <strong>each year&apos;s</strong> financials — P&amp;L, bank statements, tax returns, POS summaries, sales reports, billing summaries. Preview before upload, delete mistakes, then let the reader extract everything.
          </div>
        </div>
      </div>

      {/* Attach-to + operating history */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 200px', gap: 12, marginBottom: 16 }}>
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Attach to listing / deal</label>
          <select value={selected} onChange={(e) => setSelected(e.target.value)} className="select" disabled={!!busy} style={inputStyle}>
            <option value="">Select a listing / deal…</option>
            {deals.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Years of history</label>
          <select value={operatingYears} onChange={(e) => setOperatingYears(Number(e.target.value))} className="select" disabled={!!busy} style={inputStyle}>
            {[1, 2, 3, 4, 5].map((y) => <option key={y} value={y}>{y} year{y === 1 ? '' : 's'}</option>)}
          </select>
        </div>
      </div>

      {/* History band hint */}
      <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 10, fontSize: 12.5, lineHeight: 1.5,
        background: operatingYears >= 3 ? '#f0fdf4' : '#fffbeb',
        border: operatingYears >= 3 ? '1px solid #bbf7d0' : '1px solid #fde68a',
        color: operatingYears >= 3 ? '#166534' : '#92400e' }}>
        {operatingYears >= 3
          ? `✅ ${operatingYears} years declared — "established track record" band: standard market multiples apply.`
          : `ℹ️ ${operatingYears} year${operatingYears === 1 ? '' : 's'} declared — "limited operating history" band: we use more conservative multiples (that's what buyers and SBA lenders do). Still fully valued and sellable.`}
      </div>

      {/* Year slots */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {slots.map((slot) => (
          <div key={slot.year} style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 14, background: '#fafbfc' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <span style={{ background: 'var(--navy)', color: '#c9a84c', borderRadius: 7, padding: '3px 10px', fontSize: 12, fontWeight: 800 }}>
                Year {slot.year}
              </span>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>{slot.files.length} file(s) queued</span>
              <button
                onClick={() => inputRefs.current[slot.year]?.click()}
                disabled={!!busy}
                style={{ marginLeft: 'auto', padding: '6px 14px', borderRadius: 8, background: 'var(--navy)', color: '#fff', border: 'none', fontSize: 12, fontWeight: 700, cursor: busy ? 'wait' : 'pointer' }}
              >
                + Add documents
              </button>
              <input
                ref={(el) => { inputRefs.current[slot.year] = el }}
                type="file"
                multiple
                accept=".pdf,.csv,.tsv,.txt,.xls,.xlsx,.doc,.docx,image/*"
                style={{ display: 'none' }}
                onChange={(e) => { addFiles(slot.year, e.target.files); e.target.value = '' }}
              />
            </div>

            {/* Queued files with preview + remove */}
            {slot.files.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
                {slot.files.map((f) => (
                  <div key={f.name} style={{ border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
                    <QueuedPreview file={f} />
                    <div style={{ padding: '7px 9px' }}>
                      <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--navy)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f.name}>{f.name}</div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 3 }}>
                        <span style={{ fontSize: 10.5, color: '#94a3b8' }}>{formatBytes(f.size)}</span>
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#0e7490' }}>{yearTag(f.name)}</span>
                      </div>
                      <button
                        onClick={() => removeQueued(slot.year, f.name)}
                        disabled={!!busy}
                        style={{ width: '100%', marginTop: 6, padding: '5px 0', borderRadius: 6, border: '1px solid #fecaca', background: '#fff', color: '#b91c1c', fontSize: 11, fontWeight: 700, cursor: busy ? 'wait' : 'pointer' }}
                      >
                        ✕ Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: '16px', border: '1px dashed var(--line)', borderRadius: 10, textAlign: 'center', color: '#94a3b8', fontSize: 12.5 }}>
                No documents queued for Year {slot.year} — {slot.year === 1 ? 'required' : `optional${slot.year > operatingYears ? '' : ''}`}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Actions */}
      {error && <div style={{ marginTop: 12, color: '#b91c1c', fontSize: 13 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
        <button onClick={uploadAll} disabled={busy === 'upload' || allQueued.length === 0} style={{ padding: '11px 22px', borderRadius: 9, background: 'var(--navy)', color: '#fff', border: 'none', fontWeight: 800, fontSize: 13.5, cursor: busy === 'upload' ? 'wait' : 'pointer' }}>
          {busy === 'upload' ? 'Uploading…' : '📤 Upload all years'}
        </button>
        <button onClick={analyze} disabled={busy === 'analyze' || !selected} style={{ padding: '11px 22px', borderRadius: 9, background: '#c9a84c', color: 'var(--navy)', border: 'none', fontWeight: 800, fontSize: 13.5, cursor: busy === 'analyze' ? 'wait' : 'pointer' }}>
          {busy === 'analyze' ? step : '🧠 Read & extract all documents'}
        </button>
        {busy === 'analyze' && <span style={{ fontSize: 12.5, color: 'var(--muted)', alignSelf: 'center' }}>{step}</span>}
      </div>

      {/* Stored docs (with preview + delete) */}
      {stored.length > 0 && (
        <div style={{ marginTop: 22 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--navy)', marginBottom: 8 }}>📁 Uploaded documents ({stored.length})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {stored.map((doc) => (
              <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', border: '1px solid var(--line)', borderRadius: 10, background: '#fff' }}>
                <span style={{ fontSize: 20 }}>{FILE_ICON[doc.file_kind]}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.file_name}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>
                    {doc.fiscal_year ? `Year ${doc.fiscal_year}` : 'No year'} · {doc.category.replace(/_/g, ' ')}{doc.doc_type ? ` · ${doc.doc_type.replace(/_/g, ' ')}` : ''} · {formatBytes(doc.file_size)}
                  </div>
                </div>
                <DocOpenLink doc={doc} style={{ padding: '6px 12px', borderRadius: 7, border: '1px solid var(--line)', color: 'var(--navy)', textDecoration: 'none', fontSize: 12, fontWeight: 700 }}>👁 Preview</DocOpenLink>
                <button onClick={() => removeStored(doc)} disabled={!!busy} style={{ padding: '6px 12px', borderRadius: 7, border: '1px solid #fecaca', background: '#fff', color: '#b91c1c', fontSize: 12, fontWeight: 700, cursor: busy ? 'wait' : 'pointer' }}>Delete</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

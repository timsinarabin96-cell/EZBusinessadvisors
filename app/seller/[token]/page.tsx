/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

// =============================================================================
// /seller/[token] — seller self-service portal.
// Sellers open their private link and see: lead status, listing progress,
// live buyer views + NDA interest, and next steps. Token is the auth — no
// login needed, same pattern as the lender portal.
// =============================================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { fetchSellerPortal, leadStatusLabel, uploadSellerFinancial, deleteSellerFinancial, type SellerPortalData } from '@/lib/sellerPortal'
import { ToastProvider, useToast } from '@/components/ui/Toast'
import Link from 'next/link'

const money = (n: number | null | undefined) => (n != null ? '$' + Math.round(n).toLocaleString() : '—')

const STATUS_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  draft: { label: 'Preparing', color: '#b45309', bg: '#fdf3e3' },
  active: { label: 'Live', color: '#15803d', bg: '#e8f7ee' },
  pending_sale: { label: 'Pending Sale', color: '#b45309', bg: '#fdf3e3' },
  under_contract: { label: 'Under Contract', color: '#0e7490', bg: '#e6f6fa' },
  sold: { label: 'Sold', color: '#1a1a2e', bg: '#ece8f5' },
  withdrawn: { label: 'Withdrawn', color: '#dc2626', bg: '#fdeaea' },
}

export default function SellerPortalPage() {
  return (
    <ToastProvider>
      <SellerBody />
    </ToastProvider>
  )
}

function SellerBody() {
  const toast = useToast()
  const params = useParams()
  const token = String(params.token || '')

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [data, setData] = useState<SellerPortalData | null>(null)
  const [queue, setQueue] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [fiscalYear, setFiscalYear] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const [interview, setInterview] = useState<{ qa: { q: string; a: string }[]; next: { id: string; question: string; hint?: string; answers?: string[] } | null; complete: boolean; remaining: number; total: number } | null>(null)
  const [interviewLoading, setInterviewLoading] = useState(false)
  const [interviewAnswer, setInterviewAnswer] = useState('')

  const loadInterview = useCallback(async () => {
    setInterviewLoading(true)
    try {
      const res = await fetch(`/api/seller-portal/interview?token=${encodeURIComponent(token)}`, { cache: 'no-store' })
      const j = await res.json()
      if (j.ok) setInterview(j)
    } catch { /* best-effort */ } finally {
      setInterviewLoading(false)
    }
  }, [token])

  const answerInterview = async (answer: string) => {
    if (!answer.trim() || interviewLoading) return
    setInterviewLoading(true)
    try {
      const res = await fetch(`/api/seller-portal/interview?token=${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ a: answer }),
      })
      const j = await res.json()
      if (j.ok) {
        setInterview(j)
        setInterviewAnswer('')
        if (j.complete) toast('Thank you — your confirmation is recorded ✅', 'success')
      }
    } catch { /* best-effort */ } finally {
      setInterviewLoading(false)
    }
  }

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetchSellerPortal(token)
    setLoading(false)
    if (!res.ok || !res.lead) {
      setError(res.error || 'Link not found')
      return
    }
    setData(res)
  }, [token])

  useEffect(() => { load() }, [load])

  // Load the accuracy interview once we have a listing.
  useEffect(() => {
    if (data?.listing?.id) loadInterview()
  }, [data?.listing?.id, loadInterview])

  const listing = data?.listing || null
  const listingStatus = listing ? STATUS_STYLE[listing.status || ''] || STATUS_STYLE.draft : null

  // --- Seller financial self-upload (Phase 3) ---
  const addFiles = (list: FileList | null) => {
    if (!list?.length) return
    setQueue((prev) => {
      const seen = new Set(prev.map((f) => f.name + '|' + f.size))
      const unique = Array.from(list).filter((f) => !seen.has(f.name + '|' + f.size))
      return [...prev, ...unique]
    })
  }

  const removeQueued = (name: string) => setQueue((prev) => prev.filter((f) => f.name !== name))

  const uploadQueued = async () => {
    if (!queue.length) return
    setUploading(true)
    let ok = 0
    let failed = 0
    for (const f of queue) {
      const res = await uploadSellerFinancial(token, f, fiscalYear ? Number(fiscalYear) : undefined)
      if (res.ok) ok++
      else failed++
    }
    setUploading(false)
    if (ok) toast(`${ok} document${ok === 1 ? '' : 's'} uploaded — a broker will review them ✅`, 'success')
    if (failed) toast(`${failed} upload(s) failed`, 'error')
    setQueue([])
    setFiscalYear('')
    load()
  }

  const deleteDoc = async (docId: string) => {
    if (!confirm('Delete this document?')) return
    const res = await deleteSellerFinancial(token, docId)
    if (res.ok) { toast('Document deleted', 'success'); load() }
    else toast(res.error || 'Delete failed', 'error')
  }

  return (
    <div style={{ minHeight: '100vh', background: '#faf9f5', fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #1a1a2e, #2b2b4a)', color: '#fff', padding: '44px 24px 70px', textAlign: 'center' }}>
        <div style={{ fontSize: 12, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#c9a84c', fontWeight: 700 }}>Seller Portal</div>
        <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 32, margin: '10px 0 6px' }}>
          {loading ? 'Loading…' : data?.lead?.business_name || 'Your Business'}
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, margin: 0 }}>
          {loading ? 'Fetching your details…' : 'Track your listing — confidentially, anytime.'}
        </p>
      </div>

      <div style={{ maxWidth: 860, margin: '-38px auto 0', padding: '0 20px 60px' }}>
        {loading ? (
          <div style={{ background: '#fff', borderRadius: 14, padding: 40, textAlign: 'center', color: '#999', boxShadow: '0 8px 30px rgba(26,26,46,0.08)' }}>Loading…</div>
        ) : error ? (
          <div style={{ background: '#fff', borderRadius: 14, padding: 40, textAlign: 'center', boxShadow: '0 8px 30px rgba(26,26,46,0.08)' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🔒</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#1a1a2e' }}>Link not found</div>
            <div style={{ fontSize: 13.5, color: '#888', marginTop: 8 }}>{error}</div>
            <Link href="/" style={{ display: 'inline-block', marginTop: 18, color: '#c9a84c', fontWeight: 700 }}>← Back to home</Link>
          </div>
        ) : data && data.lead ? (
          <>
            {/* Status banner */}
            <div style={{ background: '#fff', borderRadius: 14, padding: '22px 24px', boxShadow: '0 8px 30px rgba(26,26,46,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#999', fontWeight: 700 }}>Current status</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#1a1a2e', marginTop: 4 }}>
                  {listing && listingStatus ? listingStatus.label : leadStatusLabel(data.lead.status)}
                </div>
                <div style={{ fontSize: 12.5, color: '#888', marginTop: 3 }}>
                  {data.lead.industry ? `${data.lead.industry} · ` : ''}{data.lead.location_general || ''}
                  {listing?.asking_price ? ` · ${money(listing.asking_price)}` : ''}
                </div>
              </div>
              {listing && listingStatus && (
                <span style={{ fontSize: 12.5, fontWeight: 700, color: listingStatus.color, background: listingStatus.bg, padding: '7px 14px', borderRadius: 999 }}>
                  {listingStatus.label}
                </span>
              )}
            </div>

            {/* Live stats */}
            {listing && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14, marginTop: 16 }}>
                <StatCard label="Buyer views" value={String(data.stats.viewsTotal)} sub={data.stats.views7d > 0 ? `${data.stats.views7d} this week` : 'Total to date'} />
                <StatCard label="Confidential requests" value={String(data.stats.ndaRequests)} sub="Buyers who asked for access" />
                <StatCard label="Listing ref" value={listing.listing_ref || '—'} sub="Your broker reference" />
              </div>
            )}

            {/* Live recast preview (Phase 3) — the 'wow' that makes the portal worth it */}
            {data.financials?.preview && (
              <div style={{ background: 'linear-gradient(135deg,#1a1a2e,#0f3460)', borderRadius: 16, padding: '26px 28px', marginTop: 16, color: '#fff', boxShadow: '0 12px 40px rgba(16,42,67,0.25)' }}>
                <div style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#c9a84c', fontWeight: 800 }}>Your live valuation preview</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 16, marginTop: 16 }}>
                  {data.financials.preview.revenue != null && (
                    <PreviewMetric label="Annual revenue" value={money(data.financials.preview.revenue)} />
                  )}
                  {data.financials.preview.sde != null && (
                    <PreviewMetric label="Owner earnings (SDE)" value={money(data.financials.preview.sde)} />
                  )}
                  {data.financials.preview.ebitda != null && (
                    <PreviewMetric label="EBITDA" value={money(data.financials.preview.ebitda)} />
                  )}
                  {data.financials.preview.valueRangeLow != null && data.financials.preview.valueRangeHigh != null && (
                    <PreviewMetric
                      label="Estimated value range"
                      value={`${money(data.financials.preview.valueRangeLow)} – ${money(data.financials.preview.valueRangeHigh)}`}
                      accent
                    />
                  )}
                </div>
                <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.55)', marginTop: 14 }}>
                  Estimated from the documents you&apos;ve shared. Your broker finalizes the official number — this updates as you upload more.
                </div>
              </div>
            )}

            {/* Seller financial upload — preview + delete, feeds the recast (Phase 3) */}
            <div style={{ background: '#fff', borderRadius: 14, padding: '22px 24px', marginTop: 16, boxShadow: '0 8px 30px rgba(26,26,46,0.08)' }}>
              <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#999', fontWeight: 700 }}>Your financials</div>
              <div style={{ fontSize: 14.5, fontWeight: 700, color: '#1a1a2e', marginTop: 6 }}>Upload your P&L, bank statements, or POS summaries</div>
              <div style={{ fontSize: 12.5, color: '#888', marginTop: 3, lineHeight: 1.6 }}>
                Sharing your numbers speeds up valuation and builds buyer confidence. Everything stays confidential.
              </div>

              {/* Queue picker */}
              <div
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files) }}
                style={{ border: '2px dashed #d8d2c2', borderRadius: 12, padding: '22px 16px', textAlign: 'center', marginTop: 14, cursor: 'pointer', background: '#faf9f5' }}
              >
                <input
                  ref={inputRef}
                  type="file"
                  multiple
                  accept=".pdf,.csv,.tsv,.txt,.xls,.xlsx,.doc,.docx,image/*"
                  style={{ display: 'none' }}
                  onChange={(e) => { addFiles(e.target.files); e.target.value = '' }}
                />
                <div style={{ fontSize: 26, marginBottom: 4 }}>📥</div>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: '#334155' }}>Click or drop files here</div>
                <div style={{ fontSize: 11.5, color: '#aaa', marginTop: 3 }}>PDF, Excel, CSV, images · up to 25MB each</div>
              </div>

              {/* Optional fiscal year tag */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>Fiscal year (optional):</label>
                <select value={fiscalYear} onChange={(e) => setFiscalYear(e.target.value)} style={{ padding: '7px 10px', borderRadius: 7, border: '1px solid var(--line)', fontSize: 12.5 }}>
                  <option value="">Auto-detect</option>
                  {[1, 2, 3, 4, 5].map((y) => <option key={y} value={y}>Year {y}</option>)}
                </select>
                {queue.length > 0 && (
                  <button onClick={uploadQueued} disabled={uploading} style={{ marginLeft: 'auto', padding: '9px 18px', borderRadius: 8, background: '#1a1a2e', color: '#c9a84c', border: 'none', fontWeight: 800, fontSize: 12.5, cursor: uploading ? 'wait' : 'pointer' }}>
                    {uploading ? 'Uploading…' : `Upload ${queue.length} file${queue.length === 1 ? '' : 's'}`}
                  </button>
                )}
              </div>

              {/* Queued files with preview + remove */}
              {queue.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10, marginTop: 12 }}>
                  {queue.map((f) => (
                    <div key={f.name} style={{ border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
                      <div style={{ height: 80, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>📄</div>
                      <div style={{ padding: '7px 9px' }}>
                        <div style={{ fontSize: 11.5, fontWeight: 700, color: '#1a1a2e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f.name}>{f.name}</div>
                        <button onClick={() => removeQueued(f.name)} style={{ width: '100%', marginTop: 6, padding: '4px 0', borderRadius: 6, border: '1px solid #fecaca', background: '#fff', color: '#b91c1c', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>✕ Remove</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Uploaded docs with preview + delete */}
              {data.financials?.docs && data.financials.docs.length > 0 && (
                <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 7 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#334155' }}>Uploaded ({data.financials.docs.length})</div>
                  {data.financials.docs.map((d) => (
                    <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', border: '1px solid var(--line)', borderRadius: 9, background: '#fafbfc' }}>
                      <span style={{ fontSize: 18 }}>📄</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 700, color: '#1a1a2e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.file_name}</div>
                        <div style={{ fontSize: 11, color: '#94a3b8' }}>
                          {d.fiscal_year ? `Year ${d.fiscal_year} · ` : ''}{d.category.replace(/_/g, ' ')}
                        </div>
                      </div>
                      <a href={d.file_url} target="_blank" rel="noreferrer" style={{ fontSize: 12, fontWeight: 700, color: '#0e7490', textDecoration: 'none' }}>Preview</a>
                      <button onClick={() => deleteDoc(d.id)} style={{ fontSize: 11.5, fontWeight: 700, color: '#b91c1c', background: 'none', border: 'none', cursor: 'pointer' }}>Delete</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Financial accuracy interview (compact verification bot) */}
            {data?.listing?.id && interview && (
              <div style={{ background: '#fff', borderRadius: 14, padding: '22px 24px', marginTop: 16, boxShadow: '0 8px 30px rgba(26,26,46,0.08)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 22 }}>🤖</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14.5, fontWeight: 800, color: '#1a1a2e' }}>Financial accuracy check</div>
                    <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                      {interview.complete
                        ? 'Completed — your confirmation is recorded and shared with your broker.'
                        : `${interview.remaining} of ${interview.total} quick questions — this makes your valuation bulletproof.`}
                    </div>
                  </div>
                  <span style={{ fontSize: 11.5, fontWeight: 800, color: interview.complete ? '#1e7e34' : '#b45309', background: interview.complete ? '#e8f7ee' : '#fdf3e3', padding: '5px 12px', borderRadius: 999 }}>
                    {interview.complete ? '✅ Verified' : 'In progress'}
                  </span>
                </div>

                {/* Transcript */}
                {interview.qa.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14, maxHeight: 260, overflowY: 'auto' }}>
                    {interview.qa.map((entry, i) => (
                      <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                        <div style={{ fontSize: 13, color: '#334155', background: '#f1f5f9', borderRadius: '10px 10px 10px 2px', padding: '9px 12px', alignSelf: 'flex-start', maxWidth: '85%' }}>{entry.q}</div>
                        <div style={{ fontSize: 13, color: '#102a43', background: '#eff6ff', borderRadius: '10px 10px 2px 10px', padding: '9px 12px', alignSelf: 'flex-end', maxWidth: '85%' }}>{entry.a}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Next question + answer */}
                {interview.next && !interview.complete && (
                  <div style={{ marginTop: 14, borderTop: '1px solid var(--line)', paddingTop: 14 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: '#1a1a2e', lineHeight: 1.5 }}>{interview.next.question}</div>
                    {interview.next.hint && <div style={{ fontSize: 12, color: '#0e7490', marginTop: 4 }}>💡 {interview.next.hint}</div>}
                    {interview.next.answers && (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                        {interview.next.answers.map((a) => (
                          <button key={a} onClick={() => answerInterview(a)} disabled={interviewLoading} style={{ padding: '8px 14px', borderRadius: 999, border: '1px solid #d8d2c2', background: '#fff', color: '#1a1a2e', fontSize: 12.5, fontWeight: 700, cursor: interviewLoading ? 'wait' : 'pointer' }}>
                            {a}
                          </button>
                        ))}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                      <input
                        value={interviewAnswer}
                        onChange={(e) => setInterviewAnswer(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') answerInterview(interviewAnswer) }}
                        placeholder="Type your answer…"
                        style={{ flex: 1, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--line)', fontSize: 13.5 }}
                      />
                      <button onClick={() => answerInterview(interviewAnswer)} disabled={interviewLoading || !interviewAnswer.trim()} style={{ padding: '10px 18px', borderRadius: 8, background: '#1a1a2e', color: '#c9a84c', border: 'none', fontWeight: 800, fontSize: 12.5, cursor: interviewLoading ? 'wait' : 'pointer' }}>
                        {interviewLoading ? '…' : 'Send'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Next steps */}
            <div style={{ background: '#fff', borderRadius: 14, padding: '22px 24px', marginTop: 16, boxShadow: '0 8px 30px rgba(26,26,46,0.08)' }}>
              <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#999', fontWeight: 700 }}>What happens next</div>
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {data.nextSteps.map((step, i) => (
                  <div key={step} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <span style={{ width: 24, height: 24, borderRadius: 999, background: '#e8edf3', color: '#52606d', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 800, flexShrink: 0 }}>{i + 1}</span>
                    <span style={{ fontSize: 14, color: '#334155', lineHeight: 1.55 }}>{step}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Confidentiality note */}
            <div style={{ marginTop: 20, textAlign: 'center', fontSize: 12, color: '#aaa', lineHeight: 1.6 }}>
              Your information stays strictly confidential. Buyers only see what you approve.
              <br />Questions? Ask your broker — they have the full picture.
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}

function StatCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: '16px 18px', boxShadow: '0 4px 16px rgba(26,26,46,0.06)' }}>
      <div style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#999', fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: '#1a1a2e', marginTop: 4 }}>{value}</div>
      <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{sub}</div>
    </div>
  )
}

function PreviewMetric({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 10, padding: '12px 14px' }}>
      <div style={{ fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.6)', fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 800, marginTop: 5, color: accent ? '#c9a84c' : '#fff' }}>{value}</div>
    </div>
  )
}

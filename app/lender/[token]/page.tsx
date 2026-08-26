/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

// =============================================================================
// /lender/[token] — secure lender qualification page.
// The lender opens their link, sees the deal summary + how many documents are
// available, and marks it prequalified (with max loan + terms) or declined.
// Token is the auth — no login needed, same pattern as the client portal.
// =============================================================================

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { fetchLenderQualification, respondToQualification } from '@/lib/lenderQualify'
import { ToastProvider, useToast } from '@/components/ui/Toast'

const money = (n: number | null | undefined) => (n != null ? '$' + Math.round(n).toLocaleString() : '—')

export default function LenderPortalPage() {
  return (
    <ToastProvider>
      <LenderBody />
    </ToastProvider>
  )
}

function LenderBody() {
  const toast = useToast()
  const params = useParams()
  const token = String(params.token || '')

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [data, setData] = useState<{
    lender: { name: string; firm: string | null; email: string | null } | null
    deal: {
      businessName: string | null
      industry: string | null
      location: string | null
      askingPrice: number | null
      annualRevenue: number | null
      sde: number | null
      status: string | null
    } | null
    docCount: number
    docs: { id: string; file_name: string; file_url: string; file_kind: string | null }[]
    qualification: { status: string; respondedAt: string | null; maxLoanAmount: number | null; terms: string | null; notes: string | null } | null
  } | null>(null)

  const [maxLoan, setMaxLoan] = useState('')
  const [terms, setTerms] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetchLenderQualification(token)
    setLoading(false)
    if (!res.ok || !res.qualification) {
      setError(res.error || 'Link not found')
      return
    }
    const q = res.qualification
    setData({
      lender: q.lenders || null,
      deal: q.deals
        ? {
            businessName: (q.deals as any)?.listings?.business_name || null,
            industry: (q.deals as any)?.listings?.industry || null,
            location: (q.deals as any)?.listings?.location_general || null,
            askingPrice: (q.deals as any)?.listings?.asking_price ?? null,
            annualRevenue: (q.deals as any)?.listings?.annual_revenue ?? null,
            sde: (q.deals as any)?.listings?.sde ?? null,
            status: (q.deals as any)?.status || null,
          }
        : null,
      docCount: (res as any).docCount || 0,
      docs: (res as any).docs || [],
      qualification: {
        status: q.status,
        respondedAt: q.responded_at,
        maxLoanAmount: q.max_loan_amount,
        terms: q.terms,
        notes: q.notes,
      },
    })
    if (q.max_loan_amount) setMaxLoan(String(q.max_loan_amount))
    if (q.terms) setTerms(q.terms)
    if (q.notes) setNotes(q.notes)
  }, [token])

  useEffect(() => { load() }, [load])

  const respond = async (status: 'prequalified' | 'declined') => {
    setBusy(true)
    const res = await respondToQualification(token, status, {
      maxLoanAmount: maxLoan ? Number(maxLoan.replace(/[$,]/g, '')) : null,
      terms: terms || undefined,
      notes: notes || undefined,
    })
    setBusy(false)
    if (res.ok) {
      toast(status === 'prequalified' ? 'Deal marked prequalified ✅' : 'Deal marked declined', status === 'prequalified' ? 'success' : 'error')
      load()
    } else {
      toast(res.error || 'Failed to respond', 'error')
    }
  }

  const alreadyResponded = data?.qualification?.status === 'prequalified' || data?.qualification?.status === 'declined'

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#071827,#12395a 58%,#176b87)', padding: '48px 20px' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        {/* Brand */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 40 }}>🏦</div>
          <div style={{ color: '#76d7ea', fontSize: 12, fontWeight: 800, letterSpacing: '.2em', textTransform: 'uppercase', marginTop: 8 }}>Lender Qualification Portal</div>
        </div>

        <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 24px 80px rgba(0,0,0,0.35)' }}>
          {loading ? (
            <div style={{ padding: 60, textAlign: 'center', color: '#888' }}>Loading deal…</div>
          ) : error || !data ? (
            <div style={{ padding: 60, textAlign: 'center' }}>
              <div style={{ fontSize: 40 }}>🔒</div>
              <h1 style={{ fontFamily: 'Georgia, serif', color: '#1a1a2e', fontSize: 22 }}>Link not found</h1>
              <p style={{ color: '#888', fontSize: 14 }}>{error || 'This qualification link is invalid or was removed.'}</p>
            </div>
          ) : (
            <>
              {/* Deal header */}
              <div style={{ padding: '28px 32px', background: '#f8f6ef', borderBottom: '1px solid #ece8dc' }}>
                <div style={{ fontSize: 11, color: '#c9a84c', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.15em' }}>Deal for financing review</div>
                <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 26, color: '#1a1a2e', margin: '8px 0 4px' }}>{data.deal?.businessName || 'Confidential business'}</h1>
                <div style={{ color: '#888', fontSize: 14 }}>
                  {[data.deal?.industry, data.deal?.location].filter(Boolean).join(' · ') || 'Business opportunity'}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12, marginTop: 20 }}>
                  <Stat label="Asking price" value={money(data.deal?.askingPrice)} />
                  <Stat label="Annual revenue" value={money(data.deal?.annualRevenue)} />
                  <Stat label="SDE" value={money(data.deal?.sde)} />
                  <Stat label="Documents" value={String(data.docCount)} />
                </div>
              </div>

              {/* Deal documents — the lender needs the actual files to qualify */}
              {data.docs.length > 0 && (
                <div style={{ padding: '20px 32px', borderBottom: '1px solid #ece8dc' }}>
                  <div style={{ fontSize: 11, color: '#c9a84c', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.15em', marginBottom: 10 }}>
                    📁 Deal documents ({data.docs.length})
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {data.docs.map((d) => (
                      <a
                        key={d.id}
                        href={d.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, border: '1px solid #ece8dc', background: '#faf9f4', textDecoration: 'none', color: '#1a1a2e' }}
                      >
                        <span style={{ fontSize: 16 }}>{d.file_kind === 'pdf' ? '📕' : d.file_kind === 'image' ? '🖼️' : d.file_kind === 'spreadsheet' ? '📊' : '📄'}</span>
                        <span style={{ flex: 1, fontWeight: 700, fontSize: 13.5 }}>{d.file_name}</span>
                        <span style={{ fontSize: 12, color: '#0e7490', fontWeight: 800 }}>Open ↗</span>
                      </a>
                    ))}
                  </div>
                  <div style={{ fontSize: 11.5, color: '#999', marginTop: 8 }}>Files open in a new tab — private to this qualification link.</div>
                </div>
              )}

              {/* Status */}
              <div style={{ padding: '20px 32px', borderBottom: '1px solid #ece8dc' }}>
                {alreadyResponded ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 30 }}>{data.qualification?.status === 'prequalified' ? '✅' : '🚫'}</span>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: data.qualification?.status === 'prequalified' ? '#15803d' : '#b91c1c' }}>
                        {data.qualification?.status === 'prequalified' ? 'Deal prequalified' : 'Deal declined'}
                      </div>
                      <div style={{ fontSize: 13, color: '#888' }}>
                        {data.qualification?.maxLoanAmount ? `Max loan: ${money(data.qualification.maxLoanAmount)}` : ''}
                        {data.qualification?.terms ? ` · ${data.qualification.terms}` : ''}
                        {data.qualification?.respondedAt ? ` · ${new Date(data.qualification.respondedAt).toLocaleDateString()}` : ''}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: 13.5, color: '#555', lineHeight: 1.6 }}>
                    Review the deal details above and mark your financing decision. The requesting broker is notified instantly.
                  </div>
                )}
              </div>

              {/* Response form */}
              {!alreadyResponded && (
                <div style={{ padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
                    <label style={labelStyle}>Max loan amount ($)</label>
                    <input className="input" value={maxLoan} onChange={(e) => setMaxLoan(e.target.value)} placeholder="e.g. 2,500,000" inputMode="decimal" style={inputStyle} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
                    <label style={labelStyle}>Terms / program</label>
                    <input className="input" value={terms} onChange={(e) => setTerms(e.target.value)} placeholder="e.g. SBA 7(a), 10 yr, 8.5%" style={inputStyle} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
                    <label style={labelStyle}>Notes for broker</label>
                    <textarea className="input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What's needed to move forward…" style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
                  </div>
                  <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
                    <button
                      onClick={() => respond('prequalified')}
                      disabled={busy}
                      style={{ flex: 1, padding: '13px 0', borderRadius: 10, background: '#15803d', color: '#fff', border: 'none', fontWeight: 800, cursor: 'pointer', fontFamily: 'Georgia, serif', fontSize: 15 }}
                    >
                      ✅ Mark Prequalified
                    </button>
                    <button
                      onClick={() => respond('declined')}
                      disabled={busy}
                      style={{ flex: 1, padding: '13px 0', borderRadius: 10, background: 'transparent', color: '#b91c1c', border: '1px solid #f0c4c4', fontWeight: 800, cursor: 'pointer', fontFamily: 'Georgia, serif', fontSize: 15 }}
                    >
                      🚫 Decline
                    </button>
                  </div>
                </div>
              )}

              {/* Footer */}
              <div style={{ padding: '16px 32px', background: '#f8f6ef', borderTop: '1px solid #ece8dc', fontSize: 12, color: '#999' }}>
                Requested for {data.lender?.name || 'your firm'}{data.lender?.firm ? ` · ${data.lender.firm}` : ''} — this link is private, don't forward it.
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #ece8dc', borderRadius: 10, padding: '12px 14px' }}>
      <div style={{ fontSize: 10.5, color: '#999', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 800, color: '#1a1a2e', fontFamily: 'Georgia, serif', marginTop: 4 }}>{value}</div>
    </div>
  )
}

const labelStyle: React.CSSProperties = { fontSize: 13, color: '#555', fontWeight: 600, alignSelf: 'center' }
const inputStyle: React.CSSProperties = { padding: '10px 12px', borderRadius: 8, border: '1px solid #d8d2c2', fontSize: 14, width: '100%' }

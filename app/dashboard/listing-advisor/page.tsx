/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useCallback, useEffect, useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import { LoadingState } from '@/components/ui'
import { ToastProvider, useToast } from '@/components/ui/Toast'
import { getAgencyContext } from '@/lib/agencyContext'
import { getStoredAccessToken } from '@/lib/authToken'

// =============================================================================
// Listing Advisor — the "ask the right questions" tool.
// Pick a listing → the advisor reads what docs are on file → returns:
//   1. Questions to ask the seller
//   2. What the business is worth (valuation range)
//   3. Is it worth listing? (verdict + score)
//   4. What to request from the seller for the best CIM
// =============================================================================

interface AdvisorQuestion { id: string; question: string; why: string; suggestedAnswers?: string[] }
interface AdvisorValuation { low: number | null; mid: number | null; high: number | null; method: string; confidence: string; reasoning: string; aiCommentary?: string }
interface AdvisorVerdict { score: number; band: string; worthListing: boolean; reasons: string[]; blockers: string[] }
interface AdvisorCimItem { item: string; why: string; priority: 'must' | 'should' | 'nice' }
interface DocSummary { total: number; taxReturns: number; financialStatements: number; bankStatements: number; other: number }
interface AdvisorReport {
  listingId: string
  businessName: string | null
  generatedAt: string
  docs: DocSummary
  questions: AdvisorQuestion[]
  valuation: AdvisorValuation
  verdict: AdvisorVerdict
  cimChecklist: AdvisorCimItem[]
  model: 'ai' | 'deterministic'
}

const fmt = (n: number | null) => (n == null ? '—' : `$${n.toLocaleString()}`)
const PRIORITY_LABEL: Record<string, string> = { must: '🔴 Must-have', should: '🟡 Should-have', nice: '🟢 Nice-to-have' }

export default function ListingAdvisorPage() {
  return (
    <AppShell active="Listing Advisor">
      <ToastProvider>
        <div style={{ maxWidth: 1080, margin: '0 auto', padding: '24px 20px 60px' }}>
          <ListingAdvisor />
        </div>
      </ToastProvider>
    </AppShell>
  )
}

function ListingAdvisor() {
  const toast = useToast()
  const [listings, setListings] = useState<{ id: string; business_name: string | null; asking_price: number | null }[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [report, setReport] = useState<AdvisorReport | null>(null)
  const [error, setError] = useState('')

  const loadListings = useCallback(async () => {
    try {
      const token = await getStoredAccessToken()
      const ctx = await getAgencyContext()
      if (!token || !ctx) { setLoading(false); return }
      const res = await fetch(`/api/listings/options?agencyId=${ctx.agencyId}`, { headers: { authorization: `Bearer ${token}` } })
      const json = await res.json().catch(() => ({ ok: false }))
      if (json.ok && Array.isArray(json.listings)) setListings(json.listings)
    } catch { /* options are best-effort */ }
    setLoading(false)
  }, [])

  useEffect(() => { loadListings() }, [loadListings])

  const run = async () => {
    if (!selectedId) { setError('Pick a listing first.'); return }
    setError('')
    setRunning(true)
    setReport(null)
    try {
      const token = await getStoredAccessToken()
      if (!token) { setError('Not authenticated.'); setRunning(false); return }
      const res = await fetch('/api/listing-advisor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ listingId: selectedId }),
      })
      const json = await res.json().catch(() => ({ ok: false, error: 'Server error' }))
      if (!res.ok || !json.ok) { setError(json.error || 'Advisor run failed.'); setRunning(false); return }
      setReport(json.report)
    } catch {
      setError('Network error — please try again.')
    } finally {
      setRunning(false)
    }
  }

  const chosen = listings.find((l) => l.id === selectedId)

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, color: '#8a6d1a', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>AI Listing Advisor</div>
        <div style={{ fontSize: 24, fontWeight: 800, color: '#1a1a2e', fontFamily: 'Georgia, serif' }}>Is this worth listing — and what do we need?</div>
        <div style={{ fontSize: 13.5, color: '#666', marginTop: 6, maxWidth: 720 }}>
          Pick a listing. The advisor reads what financials are already on file, then tells you what to ask the seller,
          what the business is worth, whether it&apos;s ready for market, and exactly what to gather for the best CIM.
        </div>
      </div>

      {/* Selector */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 22 }}>
        <select
          value={selectedId}
          onChange={(e) => { setSelectedId(e.target.value); setReport(null); setError('') }}
          style={{ flex: 1, minWidth: 280, padding: '11px 13px', border: '1px solid #d8d2c2', borderRadius: 8, fontSize: 13.5, background: '#fff', outline: 'none' }}
        >
          <option value="">{loading ? 'Loading listings…' : 'Select a listing…'}</option>
          {listings.map((l) => (
            <option key={l.id} value={l.id}>
              {l.business_name || 'Untitled listing'}{l.asking_price ? ` — $${l.asking_price.toLocaleString()}` : ''}
            </option>
          ))}
        </select>
        <button
          onClick={run}
          disabled={running || !selectedId}
          style={{ padding: '12px 26px', borderRadius: 10, background: '#1a1a2e', color: '#fff', border: 'none', fontWeight: 800, cursor: running || !selectedId ? 'not-allowed' : 'pointer', fontSize: 14, fontFamily: 'Georgia, serif', opacity: running || !selectedId ? 0.6 : 1 }}
        >
          {running ? 'Analyzing…' : 'Run Advisor →'}
        </button>
      </div>

      {error && <div style={{ fontSize: 13, color: '#b3261e', marginBottom: 14 }}>{error}</div>}
      {running && <LoadingState label="Reading docs, building questions, valuing…" />}

      {report && !running && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Header */}
          <div style={{ background: '#1a1a2e', borderRadius: 14, padding: '20px 22px', color: '#fff' }}>
            <div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'Georgia, serif' }}>{report.businessName || 'Listing'}</div>
            <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.65)', marginTop: 4 }}>
              {report.docs.total} doc{report.docs.total === 1 ? '' : 's'} on file
              {report.docs.taxReturns ? ` · ${report.docs.taxReturns} tax return${report.docs.taxReturns === 1 ? '' : 's'}` : ''}
              {report.docs.financialStatements ? ` · ${report.docs.financialStatements} P&L` : ''}
              {report.docs.bankStatements ? ` · ${report.docs.bankStatements} bank stmt${report.docs.bankStatements === 1 ? '' : 's'}` : ''}
              {' · '}{report.model === 'ai' ? '✨ AI-assisted' : 'deterministic mode'}
            </div>
          </div>

          {/* Verdict */}
          <div style={{ background: '#fff', borderRadius: 14, padding: '20px 22px', border: '1px solid #e5e2d8' }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#8a6d1a', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Listability verdict</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 10 }}>
              <div style={{ fontSize: 34, fontWeight: 800, fontFamily: 'Georgia, serif', color: report.verdict.score >= 70 ? '#1e7a3c' : report.verdict.score >= 40 ? '#b7791f' : '#b3261e' }}>
                {report.verdict.score}
                <span style={{ fontSize: 16, color: '#999' }}>/100</span>
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800 }}>{report.verdict.band}</div>
                <div style={{ fontSize: 12.5, color: '#666' }}>{report.verdict.worthListing ? '✅ Worth taking to market' : '⚠️ Hold — address the blockers first'}</div>
              </div>
            </div>
            {report.verdict.reasons.map((r, i) => <div key={i} style={{ fontSize: 13, color: '#444', marginBottom: 4 }}>• {r}</div>)}
            {report.verdict.blockers.length > 0 && (
              <div style={{ marginTop: 8, fontSize: 12.5, color: '#b3261e' }}>
                <strong>Blockers:</strong> {report.verdict.blockers.join(' · ')}
              </div>
            )}
          </div>

          {/* Valuation */}
          <div style={{ background: '#fff', borderRadius: 14, padding: '20px 22px', border: '1px solid #e5e2d8' }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#8a6d1a', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>What it&apos;s worth</div>
            {report.valuation.mid != null ? (
              <>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
                  {[
                    ['Low', report.valuation.low],
                    ['Mid', report.valuation.mid],
                    ['High', report.valuation.high],
                  ].map(([label, val]) => (
                    <div key={String(label)} style={{ background: '#f7f6f2', borderRadius: 10, padding: '12px 18px', textAlign: 'center' }}>
                      <div style={{ fontSize: 11, color: '#999', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
                      <div style={{ fontSize: 20, fontWeight: 800, fontFamily: 'Georgia, serif', color: '#1a1a2e' }}>{fmt(val as number | null)}</div>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 12.5, color: '#777' }}>Method: {report.valuation.method} · Confidence: {report.valuation.confidence}</div>
              </>
            ) : (
              <div style={{ fontSize: 13, color: '#b7791f' }}>Not enough data yet — upload financials or answer the questions below, then re-run.</div>
            )}
            <div style={{ fontSize: 13, color: '#444', marginTop: 8 }}>{report.valuation.reasoning}</div>
          </div>

          {/* Questions */}
          <div style={{ background: '#fff', borderRadius: 14, padding: '20px 22px', border: '1px solid #e5e2d8' }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#8a6d1a', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Questions to ask the seller</div>
            <div style={{ fontSize: 12.5, color: '#888', marginBottom: 12 }}>Ask these before building the CIM — each one changes the story or the price.</div>
            {report.questions.map((q) => (
              <div key={q.id} style={{ padding: '12px 0', borderBottom: '1px solid #f0eee6' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#1a1a2e' }}>{q.question}</div>
                <div style={{ fontSize: 12.5, color: '#777', marginTop: 3 }}>{q.why}</div>
                {q.suggestedAnswers && q.suggestedAnswers.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                    {q.suggestedAnswers.map((a) => (
                      <span key={a} style={{ fontSize: 11.5, background: '#f7f6f2', border: '1px solid #e5e2d8', borderRadius: 99, padding: '4px 10px', color: '#555' }}>{a}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* CIM checklist */}
          <div style={{ background: '#fff', borderRadius: 14, padding: '20px 22px', border: '1px solid #e5e2d8' }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#8a6d1a', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>CIM prep checklist</div>
            <div style={{ fontSize: 12.5, color: '#888', marginBottom: 12 }}>Exactly what to request from the seller for the best Confidential Information Memorandum.</div>
            {(['must', 'should', 'nice'] as const).map((p) => (
              <div key={p}>
                {report.cimChecklist.filter((c) => c.priority === p).map((c) => (
                  <div key={c.item} style={{ padding: '10px 0', borderBottom: '1px solid #f0eee6' }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: '#1a1a2e' }}>{PRIORITY_LABEL[p]} — {c.item}</div>
                    <div style={{ fontSize: 12.5, color: '#777', marginTop: 2 }}>{c.why}</div>
                  </div>
                ))}
              </div>
            ))}
          </div>

          <div style={{ textAlign: 'center', fontSize: 12, color: '#aaa' }}>
            Generated {new Date(report.generatedAt).toLocaleString()} · Re-run after uploading more docs or answering questions to refresh the valuation.
          </div>
        </div>
      )}

      {!report && !running && !error && listings.length === 0 && !loading && (
        <div style={{ fontSize: 13.5, color: '#888', textAlign: 'center', padding: '40px 0' }}>
          No listings found. Create a listing first, then run the advisor on it.
        </div>
      )}
    </div>
  )
}

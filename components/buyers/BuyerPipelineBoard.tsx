/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useCallback, useEffect, useState } from 'react'
import { useToast } from '@/components/ui/Toast'
import { authenticatedFetch } from '@/lib/authenticatedFetch'
import { STAGE_META, heatBand, BUYER_STAGES, type BuyerStage } from '@/lib/buyerPipelineCore'

// =============================================================================
// BuyerPipelineBoard — the buyer CRM kanban for a listing.
// -----------------------------------------------------------------------------
// Columns = pipeline stages (New → Contacted → NDA → Qualified → Data Room →
// LOI → Negotiation → Closed/Lost). Cards show buyer + heat badge + last
// activity. Moves are one-click (← / →) and auto-log to the deal timeline.
// Also: NQA one-click qualification, buyer 360 drawer, and a funnel strip.
// =============================================================================

interface BoardBuyer {
  id: string
  buyer_name: string | null
  buyer_email: string | null
  buyer_phone: string | null
  buyer_type: string | null
  nda_signed: boolean
  nda_signed_at: string | null
  financial_qualified: boolean
  is_primary_buyer: boolean
  pipeline_stage: BuyerStage
  stage_entered_at: string | null
  heat_score: number
  competitive_consent: boolean
  created_at: string
  recent_events: Array<{ from_stage: string | null; to_stage: string; note: string | null; created_at: string }>
  offers_count: number
}

const COMPACT_STAGES: BuyerStage[] = ['new', 'contacted', 'nda_sent', 'nda_signed', 'qualified', 'data_room', 'loi', 'negotiation', 'closed', 'lost']

export default function BuyerPipelineBoard({ listingId, onBuyersChange }: { listingId: string; onBuyersChange?: (count: number) => void }) {
  const toast = useToast()
  const [buyers, setBuyers] = useState<BoardBuyer[]>([])
  const [funnel, setFunnel] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [moving, setMoving] = useState<string | null>(null)
  const [selected, setSelected] = useState<BoardBuyer | null>(null)
  const [nqa, setNqa] = useState<Record<string, string>>({})
  const [nqaBusy, setNqaBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await authenticatedFetch(`/api/buyers/pipeline?listingId=${encodeURIComponent(listingId)}`, { headers: {} })
      const j = await res.json()
      if (j.ok && j.board) {
        setBuyers(j.board.buyers || [])
        setFunnel(j.board.funnel || {})
        onBuyersChange?.(j.board.buyers?.length || 0)
      }
    } catch { /* non-fatal */ }
    finally { setLoading(false) }
  }, [listingId, onBuyersChange])

  useEffect(() => { load() }, [load])

  const move = async (b: BoardBuyer, dir: 1 | -1) => {
    const idx = COMPACT_STAGES.indexOf(b.pipeline_stage)
    const next = COMPACT_STAGES[idx + dir]
    if (!next) return
    setMoving(b.id)
    try {
      const res = await authenticatedFetch('/api/buyers/pipeline', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json',  },
        body: JSON.stringify({ buyerListId: b.id, listingId, toStage: next }),
      })
      const j = await res.json()
      if (!res.ok || !j.ok) throw new Error(j.error || 'Move failed')
      toast(`${b.buyer_name || 'Buyer'} → ${STAGE_META[next].icon} ${STAGE_META[next].label}`, 'success')
      load()
    } catch (e: any) {
      toast(e.message || 'Move failed', 'error')
    } finally {
      setMoving(null)
    }
  }

  const runNqa = async (b: BoardBuyer) => {
    setNqaBusy(true)
    try {
      const res = await authenticatedFetch('/api/buyers/pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json',  },
        body: JSON.stringify({ action: 'nqa', listingId, buyerListId: b.id, answers: nqa }),
      })
      const j = await res.json()
      if (!res.ok || !j.ok) throw new Error(j.error || 'NQA failed')
      toast(`NQA ${j.score}/100 — ${j.label}`, 'success')
      setSelected(null)
      setNqa({})
      load()
    } catch (e: any) {
      toast(e.message || 'NQA failed', 'error')
    } finally {
      setNqaBusy(false)
    }
  }

  const activeCount = buyers.filter((b) => b.pipeline_stage !== 'closed' && b.pipeline_stage !== 'lost').length
  const hotCount = buyers.filter((b) => b.heat_score >= 70).length

  return (
    <div>
      {/* Funnel strip */}
      <div className="pipeline-funnel-strip" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--navy)' }}>📊 Pipeline:</span>
        {COMPACT_STAGES.filter((s) => s !== 'lost').map((s) => (
          <span key={s} style={{ fontSize: 11.5, padding: '3px 10px', borderRadius: 99, background: (funnel[s] || 0) > 0 ? 'var(--navy)' : '#eef1f5', color: (funnel[s] || 0) > 0 ? '#fff' : 'var(--muted)', fontWeight: 700 }}>
            {STAGE_META[s].icon} {funnel[s] || 0}
          </span>
        ))}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{activeCount} active · {hotCount} 🔥 hot</span>
      </div>

      {loading ? (
        <div style={{ padding: 30, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Loading pipeline…</div>
      ) : buyers.length === 0 ? (
        <div style={{ padding: 20, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Add buyers above — they land in 🆕 New and you move them down the pipeline.</div>
      ) : (
        <div className="pipeline-board-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(10, minmax(120px, 1fr))', gap: 8, overflowX: 'auto', paddingBottom: 6 }}>
          {COMPACT_STAGES.map((stage) => {
            const inStage = buyers.filter((b) => b.pipeline_stage === stage)
            return (
              <div key={stage} style={{ minWidth: 120, background: '#f7f9fb', border: '1px solid #e7edf4', borderRadius: 10, padding: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--navy)', marginBottom: 6, whiteSpace: 'nowrap' }}>
                  {STAGE_META[stage].icon} {STAGE_META[stage].label} <span style={{ color: 'var(--muted)' }}>({inStage.length})</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {inStage.map((b) => {
                    const band = heatBand(b.heat_score)
                    const idx = COMPACT_STAGES.indexOf(stage)
                    return (
                      <div key={b.id} style={{ background: '#fff', border: b.is_primary_buyer ? '1.5px solid #c9a84c' : '1px solid #e7edf4', borderRadius: 8, padding: 8, cursor: 'pointer' }} onClick={() => setSelected(b)}>
                        <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--navy)', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.buyer_name || 'Unnamed'}</span>
                          {b.is_primary_buyer && <span title="Primary buyer">★</span>}
                        </div>
                        <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 2 }}>{b.buyer_type} · {b.offers_count > 0 ? `${b.offers_count} offer${b.offers_count > 1 ? 's' : ''}` : 'no offers'}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                          <span style={{ fontSize: 10.5, fontWeight: 800, color: band.color }}>{band.label}</span>
                          <span style={{ flex: 1 }} />
                          {idx > 0 && (
                            <button
                              onClick={(e) => { e.stopPropagation(); move(b, -1) }}
                              disabled={moving === b.id}
                              title="Move back"
                              style={{ width: 22, height: 22, borderRadius: 6, border: '1px solid #d8dee6', background: '#fff', cursor: 'pointer', fontSize: 11, lineHeight: '20px', padding: 0 }}
                            >←</button>
                          )}
                          {idx < COMPACT_STAGES.length - 1 && (
                            <button
                              onClick={(e) => { e.stopPropagation(); move(b, 1) }}
                              disabled={moving === b.id}
                              title="Advance"
                              style={{ width: 22, height: 22, borderRadius: 6, border: '1px solid #c9a84c', background: '#fff', cursor: 'pointer', fontSize: 11, lineHeight: '20px', padding: 0, color: '#8a6d1f' }}
                            >→</button>
                          )}
                        </div>
                        {b.nda_signed && <div style={{ fontSize: 10, color: '#166534', marginTop: 4 }}>✓ NDA</div>}
                        {b.financial_qualified && !b.nda_signed && <div style={{ fontSize: 10, color: '#166534', marginTop: 4 }}>✓ Qualified</div>}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Buyer 360 drawer */}
      {selected && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,15,30,0.45)', zIndex: 60, display: 'flex', justifyContent: 'flex-end' }} onClick={() => setSelected(null)}>
          <div style={{ width: 430, maxWidth: '94vw', background: '#fff', height: '100%', overflowY: 'auto', padding: 22, boxShadow: '-12px 0 40px rgba(0,0,0,0.18)' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <span style={{ fontSize: 26 }}>👤</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 17, fontWeight: 800, fontFamily: 'Georgia, serif', color: 'var(--navy)' }}>
                  {selected.buyer_name || 'Unnamed buyer'} {selected.is_primary_buyer && <span style={{ fontSize: 10.5, background: '#c9a84c', color: '#0b1f3a', padding: '2px 8px', borderRadius: 12, marginLeft: 6 }}>PRIMARY</span>}
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 3 }}>
                  {selected.buyer_email || 'no email'} · {selected.buyer_phone || 'no phone'} · {selected.buyer_type}
                </div>
              </div>
              <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--muted)' }}>✕</button>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, padding: '5px 12px', borderRadius: 99, background: '#f0f4f9', fontWeight: 700, color: 'var(--navy)' }}>
                {STAGE_META[selected.pipeline_stage].icon} {STAGE_META[selected.pipeline_stage].label}
              </span>
              <span style={{ fontSize: 12, padding: '5px 12px', borderRadius: 99, background: '#fef3e2', fontWeight: 700, color: heatBand(selected.heat_score).color }}>
                {heatBand(selected.heat_score).label} · {selected.heat_score}/100
              </span>
              {selected.nda_signed && <span style={{ fontSize: 12, padding: '5px 12px', borderRadius: 99, background: '#e8f5ee', fontWeight: 700, color: '#166534' }}>✓ NDA signed</span>}
              {selected.financial_qualified && <span style={{ fontSize: 12, padding: '5px 12px', borderRadius: 99, background: '#e8f5ee', fontWeight: 700, color: '#166534' }}>✓ Qualified</span>}
            </div>

            {/* Timeline of this buyer's stage changes */}
            {selected.recent_events.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--navy)', marginBottom: 8 }}>Activity</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {selected.recent_events.map((e, i) => (
                    <div key={i} style={{ fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.5 }}>
                      <span style={{ fontWeight: 700, color: 'var(--navy)' }}>
                        {e.from_stage ? `${STAGE_META[e.from_stage as BuyerStage]?.label || e.from_stage} → ${STAGE_META[e.to_stage as BuyerStage]?.label || e.to_stage}` : STAGE_META[e.to_stage as BuyerStage]?.label || e.to_stage}
                      </span>
                      {e.note && <span> — {e.note}</span>}
                      <span style={{ display: 'block', fontSize: 10.5, color: '#9aa4b2' }}>{new Date(e.created_at).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Quick NQA qualification */}
            <div style={{ marginTop: 18, borderTop: '1px solid #e7edf4', paddingTop: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--navy)', marginBottom: 8 }}>📋 Quick qualify (NQA)</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  { key: 'budget', label: 'Budget range' },
                  { key: 'funds', label: 'Funds / financing ready?' },
                  { key: 'timeline', label: 'Timeline' },
                  { key: 'industry', label: 'Target industries' },
                ].map((f) => (
                  <input
                    key={f.key}
                    value={nqa[f.key] || ''}
                    onChange={(e) => setNqa({ ...nqa, [f.key]: e.target.value })}
                    placeholder={f.label}
                    style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid #d8dee6', fontSize: 12.5, fontFamily: 'inherit' }}
                  />
                ))}
              </div>
              <button
                onClick={() => runNqa(selected)}
                disabled={nqaBusy}
                style={{ width: '100%', marginTop: 10, padding: '10px', borderRadius: 8, background: 'var(--navy)', color: '#fff', border: 'none', fontWeight: 800, fontSize: 12.5, cursor: nqaBusy ? 'wait' : 'pointer' }}
              >
                {nqaBusy ? 'Scoring…' : 'Score & auto-qualify'}
              </button>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8, lineHeight: 1.5 }}>
                Score ≥70 auto-marks financially qualified and advances the buyer. Scores are saved to the deal record.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

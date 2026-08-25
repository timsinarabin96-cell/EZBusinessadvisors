'use client'

import { useCallback, useEffect, useState } from 'react'
import { fetchDealQualifications, sendDealToLender, type LenderQualification } from '@/lib/lenderQualify'
import { fetchPublicProfessionals, type DealProfessional } from '@/lib/professionals'
import { useToast } from '@/components/ui/Toast'

// =============================================================================
// DealLenderPanel — "Send to Lender" + qualification status in the deal drawer.
// Agent picks an SBA lender from the directory → lender gets a secure link with
// the deal's files → lender marks prequalified/declined → status shows here.
// =============================================================================

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  requested:   { label: 'Requested', color: '#64748b', bg: 'rgba(100,116,139,0.12)' },
  sent:        { label: 'Sent to lender', color: '#1d4ed8', bg: 'rgba(59,130,246,0.12)' },
  viewed:      { label: 'Lender viewing', color: '#b45309', bg: 'rgba(245,158,11,0.14)' },
  prequalified: { label: '🏦 PREQUALIFIED', color: '#15803d', bg: 'rgba(34,197,94,0.14)' },
  declined:    { label: 'Declined', color: '#b91c1c', bg: 'rgba(220,38,38,0.1)' },
}

const money = (n: number | null | undefined) => (n != null ? '$' + Math.round(n).toLocaleString() : '—')

export default function DealLenderPanel({ dealId }: { dealId: string }) {
  const toast = useToast()
  const [quals, setQuals] = useState<LenderQualification[]>([])
  const [lenders, setLenders] = useState<DealProfessional[]>([])
  const [selected, setSelected] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const qs = await fetchDealQualifications(dealId)
    setQuals(qs)
    setLoading(false)
  }, [dealId])

  useEffect(() => { load() }, [load])

  // Load SBA lenders (public directory, lender type only).
  useEffect(() => {
    fetchPublicProfessionals({ type: 'lender' }).then(setLenders).catch(() => setLenders([]))
  }, [])

  const send = async () => {
    if (!selected) return
    setSending(true)
    const res = await sendDealToLender(dealId, selected)
    setSending(false)
    if (res.ok) {
      toast('Deal sent to lender — they got a secure qualification link 📩', 'success')
      setSelected('')
      load()
    } else {
      toast(res.error || 'Could not send to lender', 'error')
    }
  }

  const prequalified = quals.find((q) => q.status === 'prequalified')

  return (
    <div style={{ marginBottom: '20px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
        <span style={sectionLabel}>🏦 SBA Lender Qualification</span>
        {prequalified && (
          <span style={{ fontSize: 11.5, fontWeight: 800, color: '#15803d', background: 'rgba(34,197,94,0.14)', padding: '3px 10px', borderRadius: 999 }}>
            ✅ Prequalified {prequalified.max_loan_amount ? `up to ${money(prequalified.max_loan_amount)}` : ''}
          </span>
        )}
      </div>

      {/* Status list */}
      {quals.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
          {quals.map((q) => {
            const meta = STATUS_META[q.status] || STATUS_META.requested
            return (
              <div key={q.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
                <span style={{ fontWeight: 700, color: meta.color, background: meta.bg, padding: '3px 10px', borderRadius: 999 }}>{meta.label}</span>
                <span style={{ color: '#334155', fontWeight: 600, flex: 1 }}>{q.lenders?.name || 'Lender'}</span>
                {q.lenders?.firm && <span style={{ color: '#94a3b8' }}>{q.lenders.firm}</span>}
                {q.max_loan_amount && <span style={{ color: '#15803d', fontWeight: 700 }}>{money(q.max_loan_amount)}</span>}
              </div>
            )
          })}
        </div>
      )}

      {/* Send form */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          style={{ flex: 1, minWidth: 180, padding: '9px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, background: '#fff', color: '#334155' }}
        >
          <option value="">Choose an SBA lender…</option>
          {lenders.map((l) => (
            <option key={l.id} value={l.id}>{l.name}{l.firm ? ` — ${l.firm}` : ''}</option>
          ))}
        </select>
        <button
          onClick={send}
          disabled={sending || !selected}
          style={{
            padding: '9px 16px', borderRadius: 8, background: sending || !selected ? '#cbd5e1' : '#1a1a2e',
            color: '#fff', border: 'none', fontWeight: 800, cursor: sending || !selected ? 'not-allowed' : 'pointer', fontFamily: 'Georgia, serif', fontSize: 13,
          }}
        >
          {sending ? 'Sending…' : 'Send to Lender →'}
        </button>
      </div>
      {lenders.length === 0 && (
        <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 6 }}>
          No SBA lenders in the directory yet — lenders can add themselves at /join.
        </div>
      )}
    </div>
  )
}

const sectionLabel: React.CSSProperties = {
  fontSize: '12px', color: '#94a3b8', textTransform: 'uppercase',
  letterSpacing: '0.05em', fontWeight: 700,
}

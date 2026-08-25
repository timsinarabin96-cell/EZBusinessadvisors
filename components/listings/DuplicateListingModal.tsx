'use client'

import { useRouter } from 'next/navigation'
import type { ListingMatch } from '@/lib/listingDedup'

// =============================================================================
// DuplicateListingModal — "this looks like it matches an existing listing."
// Shown before creating a new listing when the dedup engine finds a likely
// twin. The broker can open the existing listing or continue anyway.
// =============================================================================

const LEVEL_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  high: { label: 'Likely duplicate', color: '#b91c1c', bg: '#fee2e2' },
  medium: { label: 'Possible match', color: '#b45309', bg: '#fdf3e3' },
  low: { label: 'Weak match', color: '#64748b', bg: '#f1f5f9' },
}

const fmt$ = (n: number | null | undefined) => (n != null ? '$' + Math.round(n).toLocaleString() : '—')

export default function DuplicateListingModal({
  matches,
  onContinue,
  onClose,
}: {
  matches: ListingMatch[]
  onContinue: () => void
  onClose: () => void
}) {
  const router = useRouter()

  const open = (id: string) => {
    router.push(`/dashboard/listings/${id}/workflow`)
    onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(26,26,46,0.55)', zIndex: 1200, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '48px 20px', overflowY: 'auto' }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 14, maxWidth: 560, width: '100%', boxShadow: '0 24px 70px rgba(26,26,46,0.4)', padding: 26 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <h2 style={{ margin: 0, fontSize: 20, color: 'var(--navy)' }}>⚠️ Existing listing matches</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--muted)' }}>✕</button>
        </div>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--muted)', lineHeight: 1.55 }}>
          The system found {matches.length} existing listing{matches.length === 1 ? '' : 's'} that may be the same business. Creating a twin splits your data — open the existing listing first if it&apos;s the same deal.
        </p>

        {matches.slice(0, 4).map((m) => {
          const st = LEVEL_STYLE[m.level] || LEVEL_STYLE.low
          return (
            <div key={m.candidate.id} style={{ border: '1px solid #eef1f4', borderRadius: 10, padding: '12px 14px', marginBottom: 10, background: '#fffdf7' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--navy)' }}>
                  {m.candidate.business_name || 'Unnamed listing'}
                </span>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: st.color, background: st.bg, padding: '3px 10px', borderRadius: 999 }}>
                  {st.label} · {m.score}
                </span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>
                {m.candidate.listing_ref ? `${m.candidate.listing_ref} · ` : ''}
                {[m.candidate.industry, m.candidate.location_general, m.candidate.asking_price != null ? fmt$(m.candidate.asking_price) : ''].filter(Boolean).join(' · ') || '—'}
                {m.candidate.status ? ` · ${m.candidate.status}` : ''}
              </div>
              <div style={{ fontSize: 12, color: '#92400e', marginTop: 6 }}>
                {m.reasons.join(' · ')}
              </div>
              <div style={{ marginTop: 10 }}>
                <button className="btn btn-navy" style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => open(m.candidate.id)}>
                  Open existing listing
                </button>
              </div>
            </div>
          )
        })}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 18 }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={onContinue}>Continue anyway — create new</button>
        </div>
      </div>
    </div>
  )
}

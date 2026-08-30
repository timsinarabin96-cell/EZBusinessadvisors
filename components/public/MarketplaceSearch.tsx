/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

// =============================================================================
// MarketplaceSearch — glassmorphism hero search with live suggestions.
// Click/tap to expand; suggestions (industries, locations, popular searches)
// appear instantly. Enter or picking a suggestion goes straight to the
// listings page with filters applied.
// =============================================================================

interface Props {
  industries: string[]
  locations: string[]
}

const POPULAR = [
  { label: '🏪 Convenience & Gas', q: 'convenience' },
  { label: '🏠 Home Care', q: 'home care' },
  { label: '🍝 Restaurants', q: 'restaurant' },
  { label: '🛍️ Retail', q: 'retail' },
  { label: '🚚 Trucking / Logistics', q: 'trucking' },
  { label: '💻 E-commerce', q: 'e-commerce' },
]

export default function MarketplaceSearch({ industries, locations }: Props) {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const wrapRef = useRef<HTMLDivElement | null>(null)

  const lower = q.trim().toLowerCase()
  const indMatches = lower ? industries.filter((i) => i.toLowerCase().includes(lower)).slice(0, 4) : industries.slice(0, 4)
  const locMatches = lower ? locations.filter((l) => l.toLowerCase().includes(lower)).slice(0, 3) : []
  const showSuggest = open && (q.trim() === '' || indMatches.length > 0 || locMatches.length > 0)

  const go = (query: string, industry?: string) => {
    const params = new URLSearchParams()
    if (query) params.set('q', query)
    if (industry) params.set('industry', industry)
    const qs = params.toString()
    router.push(`/marketplace/listings${qs ? `?${qs}` : ''}`)
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); go(q.trim()); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, sugCount() - 1)); return }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); return }
    if (e.key === 'Escape') setOpen(false)
  }

  const sugCount = () => {
    let n = 0
    if (q.trim() === '') n += POPULAR.length
    else n += indMatches.length
    if (locMatches.length) n += locMatches.length
    return Math.max(n, 1)
  }

  const pick = (i: number) => {
    if (q.trim() === '') {
      const pop = POPULAR[i]
      if (pop) { setQ(pop.q); go(pop.q) }
      return
    }
    if (i < indMatches.length) {
      const ind = indMatches[i]
      go('', ind)
      return
    }
    const loc = locMatches[i - indMatches.length]
    if (loc) go(loc, '')
  }

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%', maxWidth: 640 }}>
      {/* Glass bar */}
      <div
        onClick={() => setOpen(true)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
          border: open ? '1.5px solid rgba(201,168,76,0.7)' : '1px solid rgba(255,255,255,0.28)',
          borderRadius: 14, padding: '6px 6px 6px 16px',
          boxShadow: open ? '0 12px 40px rgba(201,168,76,0.25), inset 0 1px 0 rgba(255,255,255,0.15)' : '0 8px 30px rgba(0,0,0,0.25)',
          transition: 'border-color .15s ease, box-shadow .15s ease',
        }}
      >
        <span style={{ color: '#c9a84c', fontSize: 16 }}>🔍</span>
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(0) }}
          onKeyDown={onKey}
          onFocus={() => setOpen(true)}
          placeholder="Search by keyword, industry, or location…"
          style={{
            flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#fff',
            fontSize: 15, fontFamily: 'inherit', padding: '10px 0',
          }}
        />
        <button
          onClick={() => go(q.trim())}
          style={{
            background: 'linear-gradient(135deg,#c9a84c,#a8862a)', color: '#0f1023', border: 'none',
            borderRadius: 10, padding: '11px 20px', fontWeight: 800, fontSize: 13.5, cursor: 'pointer',
            fontFamily: 'Georgia, serif', whiteSpace: 'nowrap', boxShadow: '0 6px 18px rgba(201,168,76,0.4)',
          }}
        >
          Search →
        </button>
      </div>

      {/* Suggestions dropdown */}
      {showSuggest && (
        <div
          style={{
            position: 'absolute', top: 'calc(100% + 8px)', left: 0, right: 0, zIndex: 40,
            background: 'rgba(15,16,35,0.92)', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)',
            border: '1px solid rgba(201,168,76,0.4)', borderRadius: 14, padding: 8, overflow: 'hidden',
            boxShadow: '0 24px 70px rgba(0,0,0,0.55)',
          }}
        >
          {q.trim() === '' && (
            <>
              <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.14em', fontWeight: 800, padding: '6px 10px 4px' }}>Popular searches</div>
              {POPULAR.map((p, i) => (
                <Suggestion key={p.label} active={active === i} onClick={() => pick(i)} onHover={() => setActive(i)}>{p.label}</Suggestion>
              ))}
            </>
          )}
          {q.trim() !== '' && indMatches.length === 0 && locMatches.length === 0 && (
            <div style={{ padding: '10px 12px', fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>
              Press <b style={{ color: '#c9a84c' }}>Enter</b> to search “{q}”
            </div>
          )}
          {q.trim() !== '' && indMatches.length > 0 && (
            <>
              <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.14em', fontWeight: 800, padding: '6px 10px 4px' }}>Industries</div>
              {indMatches.map((ind, i) => (
                <Suggestion key={ind} active={active === i} onClick={() => pick(i)} onHover={() => setActive(i)}>{ind} <span style={{ color: '#c9a84c' }}>→</span></Suggestion>
              ))}
            </>
          )}
          {locMatches.length > 0 && (
            <>
              <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.14em', fontWeight: 800, padding: '6px 10px 4px' }}>Locations</div>
              {locMatches.map((loc, i) => {
                const idx = indMatches.length + i
                return (
                  <Suggestion key={loc} active={active === idx} onClick={() => pick(idx)} onHover={() => setActive(idx)}>📍 {loc}</Suggestion>
                )
              })}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function Suggestion({ children, active, onClick, onHover }: { children: React.ReactNode; active: boolean; onClick: () => void; onHover: () => void }) {
  return (
    <div
      onClick={onClick}
      onMouseEnter={onHover}
      style={{
        padding: '9px 12px', borderRadius: 9, cursor: 'pointer', fontSize: 13.5,
        background: active ? 'rgba(201,168,76,0.18)' : 'transparent',
        color: active ? '#f5d97a' : 'rgba(255,255,255,0.85)', fontWeight: active ? 800 : 600,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}
    >
      {children}
    </div>
  )
}

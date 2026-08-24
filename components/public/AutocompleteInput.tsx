'use client'

// =============================================================================
// AutocompleteInput — "type H → pick Houston", "type R → Retail" search input.
// Fetches suggestions from /api/search/suggest (location or category) with a
// debounce, shows a dropdown, and calls onPick when the user selects.
// Used on the public marketplace + CRM search.
// =============================================================================

import { useEffect, useRef, useState } from 'react'

interface AutocompleteInputProps {
  type: 'location' | 'category'
  value: string
  onChange: (v: string) => void
  onPick?: (v: string) => void
  placeholder?: string
  style?: React.CSSProperties
  minChars?: number
}

export default function AutocompleteInput({
  type, value, onChange, onPick, placeholder, style, minChars = 1,
}: AutocompleteInputProps) {
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const q = value.trim()
    if (q.length < minChars) { setSuggestions([]); setOpen(false); return }
    let active = true
    setLoading(true)
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search/suggest?q=${encodeURIComponent(q)}&type=${type}&limit=8`)
        const j = await res.json()
        if (active && j.ok) {
          setSuggestions(j.suggestions || [])
          setOpen((j.suggestions || []).length > 0)
        }
      } catch { if (active) setSuggestions([]) } finally { if (active) setLoading(false) }
    }, 180)
    return () => { active = false; clearTimeout(t) }
  }, [value, type, minChars])

  // Close on outside click.
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  return (
    <div ref={boxRef} style={{ position: 'relative', minWidth: 0 }}>
      <input
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => { if (suggestions.length) setOpen(true) }}
        placeholder={placeholder || (type === 'location' ? 'City, county, or state…' : 'Category (e.g. Retail)…')}
        style={style}
      />
      {open && suggestions.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
          background: '#fff', border: '1px solid #d8d2c2', borderRadius: 8,
          boxShadow: '0 12px 40px rgba(26,26,46,0.15)', marginTop: 4, overflow: 'hidden',
        }}>
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => { onChange(s); onPick?.(s); setOpen(false) }}
              style={{
                display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px',
                border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13.5,
                color: '#1a1a2e', borderBottom: '1px solid #f0ecdf',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#faf9f4')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              {type === 'location' ? '📍 ' : '🏷️ '}{s}
            </button>
          ))}
        </div>
      )}
      {loading && <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: '#aaa' }}>…</span>}
    </div>
  )
}

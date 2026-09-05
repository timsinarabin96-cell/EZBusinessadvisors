/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useEffect, useRef, useState } from 'react'

// =============================================================================
// SuggestionInput — debounced autocomplete for listing fields.
//   type="category"  → industries / sub-industries from the marketplace
//   type="location"  → cities / counties / states from the US locations table
// Backed by /api/search/suggest (instant, zero AI tokens).
// =============================================================================

export default function SuggestionInput({
  value,
  onChange,
  type,
  placeholder,
  inputStyle,
}: {
  value: string
  onChange: (v: string) => void
  type: 'location' | 'category'
  placeholder?: string
  inputStyle?: React.CSSProperties
}) {
  const [options, setOptions] = useState<string[]>([])
  const [open, setOpen] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const stillFocused = () => document.activeElement === inputRef.current

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    const q = value.trim()
    if (!q) { setOptions([]); return }
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search/suggest?q=${encodeURIComponent(q)}&type=${type}&limit=8`)
        const data = await res.json()
        const list = (data.suggestions || []).map((s: any) => (typeof s === 'string' ? s : s.display)).filter(Boolean)
        setOptions(list)
        // Only auto-open while the user is still in this field — a late fetch
        // resolving after blur must not pop the dropdown open again (it
        // rendered as ghost duplicate rows under the filled field).
        if (stillFocused()) setOpen(list.length > 0)
      } catch {
        setOptions([])
        setOpen(false)
      }
    }, 250)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [value, type])

  return (
    <div style={{ position: 'relative' }}>
      <input
        ref={inputRef}
        className="input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => { if (options.length) setOpen(true) }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        style={inputStyle}
      />
      {open && options.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 30, background: '#fff', border: '1px solid var(--line)', borderRadius: 10, boxShadow: '0 8px 24px rgba(15,52,96,.14)', marginTop: 4, maxHeight: 220, overflowY: 'auto' }}>
          {options.map((o) => (
            <button
              key={o}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); onChange(o); setOpen(false) }}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13.5, color: 'var(--text)' }}
            >
              {o}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

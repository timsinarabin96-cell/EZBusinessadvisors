/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

// =============================================================================
// CommandPalette — Cmd+K / Ctrl+K quick launcher for the CRM.
// Reaches every nav destination (50+) without stuffing them all in the
// sidebar. Keyboard-first: ↑/↓ to move, Enter to go, Esc to close.
// =============================================================================

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { NavRole } from '@/components/layout/navConfig'

interface PaletteItem {
  href: string
  label: string
  icon: string
  group?: string
  keywords?: string
}

export default function CommandPalette({
  items,
  role,
  onNavigate,
}: {
  items: PaletteItem[]
  role: NavRole
  onNavigate?: (href: string) => void
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter((i) =>
      `${i.label} ${i.group || ''} ${i.keywords || ''}`.toLowerCase().includes(q),
    )
  }, [query, items])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => {
          const next = !o
          if (next) setQuery('')
          return next
        })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Reset cursor whenever the result list changes.
  useEffect(() => setCursor(0), [query, open])

  // Keep the active row in view.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>('[data-active="true"]')
    el?.scrollIntoView({ block: 'nearest' })
  }, [cursor])

  const go = (href: string) => {
    onNavigate?.(href)
    setOpen(false)
    router.push(href)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setCursor((c) => Math.min(c + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setCursor((c) => Math.max(c - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const target = results[cursor]
      if (target) go(target.href)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
    }
  }

  if (!open) return null

  return (
    <div
      onClick={() => setOpen(false)}
      style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        background: 'rgba(10,10,25,0.55)', backdropFilter: 'blur(2px)',
        display: 'flex', justifyContent: 'center', alignItems: 'flex-start',
        paddingTop: '12vh',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 560, background: '#fff', borderRadius: 14,
          boxShadow: '0 24px 64px rgba(0,0,0,0.35)', overflow: 'hidden',
          fontFamily: 'Georgia, serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 18px', borderBottom: '1px solid var(--line)' }}>
          <span style={{ fontSize: 17, opacity: 0.7 }}>🔍</span>
          <input
            ref={inputRef}
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={`Search ${items.length} tools… (${role} view)`}
            style={{
              flex: 1, border: 'none', outline: 'none', fontSize: 16,
              fontFamily: 'Georgia, serif', background: 'transparent', color: '#1a1a2e',
            }}
          />
          <kbd style={{ fontSize: 11, color: '#888', border: '1px solid #ddd', borderRadius: 5, padding: '2px 7px', background: '#f7f7f7' }}>ESC</kbd>
        </div>

        <div ref={listRef} style={{ maxHeight: 380, overflowY: 'auto', padding: '8px' }}>
          {results.length === 0 && (
            <div style={{ padding: '26px 18px', textAlign: 'center', color: '#999', fontSize: 14 }}>
              No tools match “{query}”
            </div>
          )}
          {results.slice(0, 14).map((item, idx) => {
            const active = idx === cursor
            return (
              <button
                key={item.href}
                data-active={active}
                onMouseEnter={() => setCursor(idx)}
                onClick={() => go(item.href)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, width: '100%',
                  padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                  border: 'none', textAlign: 'left', fontSize: 14.5,
                  fontFamily: 'Georgia, serif',
                  background: active ? 'rgba(26,26,46,0.06)' : 'transparent',
                  color: '#1a1a2e',
                }}
              >
                <span style={{ fontSize: 16, width: 22, textAlign: 'center' }}>{item.icon}</span>
                <span style={{ flex: 1 }}>{item.label}</span>
                {item.group && (
                  <span style={{ fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#999', background: '#f2f2f2', borderRadius: 99, padding: '2px 8px' }}>
                    {item.group}
                  </span>
                )}
                <span style={{ fontSize: 11, color: '#bbb' }}>↵</span>
              </button>
            )
          })}
        </div>

        <div style={{ padding: '9px 16px', borderTop: '1px solid var(--line)', fontSize: 11.5, color: '#999', display: 'flex', gap: 14, background: '#fafafa' }}>
          <span><b style={{ color: '#666' }}>↑↓</b> navigate</span>
          <span><b style={{ color: '#666' }}>↵</b> open</span>
          <span><b style={{ color: '#666' }}>esc</b> close</span>
          <span style={{ marginLeft: 'auto' }}>{results.length} tools</span>
        </div>
      </div>
    </div>
  )
}

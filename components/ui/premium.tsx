/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

// =============================================================================
// Premium UI kit — the "billion-dollar" layer for every dashboard page.
// Shared building blocks: PageHero, StatCard, PCard, Chip, Skeleton,
// EmptyState, TableShell. Visual-only — zero business logic. Drop these into
// any page for instant consistency (navy + gold, soft depth, glass chrome).
// =============================================================================

import type { CSSProperties, Dispatch, ReactNode, SetStateAction } from 'react'

// ---------------------------------------------------------------------------
// PageHero — gradient navy header band with eyebrow + title + subtitle.
// ---------------------------------------------------------------------------
export function PageHero({
  eyebrow,
  title,
  sub,
  actions,
  icon,
}: {
  eyebrow?: string
  title: string
  sub?: string
  actions?: ReactNode
  icon?: string
}) {
  return (
    <div className="ph-hero">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 0 }}>
          {icon && (
            <div style={{
              width: 54, height: 54, borderRadius: 16, flexShrink: 0,
              background: 'linear-gradient(135deg, rgba(201,168,76,0.9), rgba(176,141,53,0.7))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 26, boxShadow: '0 8px 22px rgba(201,168,76,0.35), inset 0 1px 0 rgba(255,255,255,0.4)',
            }}>
              {icon}
            </div>
          )}
          <div style={{ minWidth: 0 }}>
            {eyebrow && <div className="ph-eyebrow">{eyebrow}</div>}
            <h1 className="ph-title" style={{ margin: eyebrow ? '6px 0 0' : 0 }}>{title}</h1>
            {sub && <p className="ph-sub">{sub}</p>}
            <div className="ph-rule" />
          </div>
        </div>
        {actions && <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', zIndex: 2 }}>{actions}</div>}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// StatCard — stat tile with optional dark variant.
// ---------------------------------------------------------------------------
export function StatCard({
  label, value, sub, dark, accent,
}: {
  label: string
  value: ReactNode
  sub?: string
  dark?: boolean
  accent?: string
}) {
  return (
    <div className={`stat-tile ${dark ? 'stat-tile-dark' : ''}`} style={{ borderTop: accent ? `3px solid ${accent}` : undefined }}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// PCard — premium card shell with optional hover lift + header.
// ---------------------------------------------------------------------------
export function PCard({
  children, title, actions, hover, pad = true, style,
}: {
  children: ReactNode
  title?: ReactNode
  actions?: ReactNode
  hover?: boolean
  pad?: boolean
  style?: CSSProperties
}) {
  return (
    <div className={`p-card ${hover ? 'p-card-hover' : ''}`} style={style}>
      {title !== undefined && (
        <div className="p-card-head">
          <div className="p-card-title">{title}</div>
          {actions}
        </div>
      )}
      <div className={pad ? 'p-card-pad' : ''}>{children}</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Chip — soft status badge.
// ---------------------------------------------------------------------------
const CHIP_TONES = ['green', 'gold', 'blue', 'purple', 'red', 'gray', 'navy'] as const
export type ChipTone = (typeof CHIP_TONES)[number]

export function Chip({ tone = 'gray', children, dot }: { tone?: ChipTone; children: ReactNode; dot?: boolean }) {
  return (
    <span className={`chip chip-${tone}`}>
      {dot && <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} />}
      {children}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Skeleton — shimmer placeholder blocks.
// ---------------------------------------------------------------------------
export function Skeleton({ w = '100%', h = 16, style }: { w?: number | string; h?: number | string; style?: CSSProperties }) {
  return <div className="sk" style={{ width: w, height: h, ...style }} />
}

export function SkeletonRows({ rows = 3, h = 16 }: { rows?: number; h?: number }) {
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {Array.from({ length: rows }).map((_, i) => <Skeleton key={i} h={h} />)}
    </div>
  )
}

// ---------------------------------------------------------------------------
// EmptyState — illustration-style empty state.
// ---------------------------------------------------------------------------
export function EmptyState({
  icon = '📂', title, sub, action,
}: {
  icon?: string
  title: string
  sub?: string
  action?: ReactNode
}) {
  return (
    <div style={{ textAlign: 'center', padding: '44px 24px' }}>
      <div className="empty-ill">{icon}</div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: 'var(--navy)' }}>{title}</div>
      {sub && <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 6, maxWidth: 380, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.55 }}>{sub}</div>}
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// TableShell — premium table wrapper with scroll + optional header.
// ---------------------------------------------------------------------------
export function TableShell({
  children, head,
}: {
  children: ReactNode
  head?: ReactNode
}) {
  return (
    <div className="p-card" style={{ overflow: 'hidden' }}>
      {head && <div className="p-card-head">{head}</div>}
      <div style={{ overflowX: 'auto' }}>
        <table className="p-table">{children}</table>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// GoldButton / SoftButton — premium action buttons.
// ---------------------------------------------------------------------------
export function GoldButton({
  children, onClick, disabled, style, type = 'button',
}: {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  style?: CSSProperties
  type?: 'button' | 'submit'
}) {
  return (
    <button type={type} onClick={onClick} disabled={disabled} className="btn btn-gold" style={style}>
      {children}
    </button>
  )
}

export function SoftButton({
  children, onClick, disabled, style, type = 'button',
}: {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  style?: CSSProperties
  type?: 'button' | 'submit'
}) {
  return (
    <button type={type} onClick={onClick} disabled={disabled} className="btn btn-soft" style={style}>
      {children}
    </button>
  )
}

// ---------------------------------------------------------------------------
// SectionTitle — gold eyebrow + heading combo for card groups.
// ---------------------------------------------------------------------------
export function SectionTitle({ eyebrow, title, right }: { eyebrow?: string; title: string; right?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
      <div>
        {eyebrow && <div className="eyebrow" style={{ marginBottom: 4 }}>{eyebrow}</div>}
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 19, fontWeight: 700, color: 'var(--navy)', margin: 0, letterSpacing: '-0.02em' }}>{title}</h2>
      </div>
      {right}
    </div>
  )
}

// ---------------------------------------------------------------------------
// PremiumTabs — segmented control used across every dashboard hub page.
// ---------------------------------------------------------------------------
export function PremiumTabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: readonly { key: T; label: string; hint?: string }[]
  active: T
  onChange: Dispatch<SetStateAction<T>>
}) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: `repeat(${tabs.length}, minmax(140px, 1fr))`, gap: 8,
      background: 'rgba(255,255,255,0.75)', border: '1px solid rgba(15,23,42,0.08)',
      borderRadius: 16, padding: 8, marginBottom: 22, backdropFilter: 'blur(12px)',
      boxShadow: '0 4px 16px rgba(15,23,42,0.05)',
    }}>
      {tabs.map((t) => {
        const isActive = active === t.key
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            style={{
              textAlign: 'left', padding: '12px 16px', borderRadius: 12, cursor: 'pointer', border: 'none',
              background: isActive ? 'linear-gradient(135deg, #1a1a2e, #0f3460)' : 'transparent',
              color: isActive ? '#fff' : 'var(--navy)',
              boxShadow: isActive ? '0 6px 18px rgba(15,52,96,0.35)' : 'none',
              transition: 'all 0.18s ease',
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 800 }}>{t.label}</div>
            {t.hint && <div style={{ fontSize: 12, opacity: isActive ? 0.7 : 0.55, marginTop: 2 }}>{t.hint}</div>}
          </button>
        )
      })}
    </div>
  )
}

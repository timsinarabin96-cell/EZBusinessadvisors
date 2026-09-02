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

import { useId, useMemo, useState } from 'react'
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

export function PremiumSelect({ label, value, onChange, children, disabled }: { label: string; value: string; onChange: (value: string) => void; children: ReactNode; disabled?: boolean }) {
  return (
    <label style={{ display: 'grid', gap: 5, minWidth: 0 }}>
      <span style={{ color: 'var(--muted)', fontSize: 11, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase' }}>{label}</span>
      <span style={{ position: 'relative', display: 'block' }}>
        <select value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} style={{ width: '100%', appearance: 'none', border: '1px solid rgba(15,52,96,.14)', borderRadius: 12, padding: '10px 34px 10px 12px', background: disabled ? '#f8fafc' : '#fff', color: 'var(--navy)', fontSize: 13, fontWeight: 700, outline: 0, boxShadow: '0 4px 12px rgba(15,23,42,.04)' }}>{children}</select>
        <span aria-hidden="true" style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#c9a84c', pointerEvents: 'none' }}>⌄</span>
      </span>
    </label>
  )
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
  return <label style={{ display: 'inline-flex', alignItems: 'center', gap: 9, cursor: 'pointer', color: 'var(--muted)', fontSize: 12.5 }}><input className="sr-only" type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><span aria-hidden="true" style={{ width: 38, height: 22, borderRadius: 999, padding: 3, display: 'flex', justifyContent: checked ? 'flex-end' : 'flex-start', background: checked ? '#0f3460' : '#cbd5e1', transition: 'all .2s' }}><span style={{ width: 16, height: 16, borderRadius: 999, background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,.2)' }} /></span>{label}</label>
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

export function ProgressRing({
  value,
  size = 112,
  stroke = 10,
  label = 'complete',
}: {
  value: number
  size?: number
  stroke?: number
  label?: string
}) {
  const normalized = Math.max(0, Math.min(100, Math.round(value || 0)))
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }} role="img" aria-label={`${normalized}% ${label}`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(15,52,96,.09)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="url(#progress-ring-gradient)"
          strokeLinecap="round"
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - normalized / 100)}
          style={{ transition: 'stroke-dashoffset .35s ease' }}
        />
        <defs>
          <linearGradient id="progress-ring-gradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#c9a84c" />
            <stop offset="1" stopColor="#0f3460" />
          </linearGradient>
        </defs>
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeContent: 'center', textAlign: 'center' }}>
        <strong style={{ color: 'var(--navy)', fontFamily: 'var(--font-display)', fontSize: size * .22, lineHeight: 1 }}>{normalized}%</strong>
        <span style={{ color: 'var(--muted)', fontSize: Math.max(9, size * .09), marginTop: 4 }}>{label}</span>
      </div>
    </div>
  )
}

export type StageState = 'done' | 'active' | 'pending' | 'overdue'
export interface StageStep {
  key: string
  label: string
  state: StageState
  count?: number
}

export function StageStepper({ stages, active, onChange }: { stages: StageStep[]; active?: string; onChange?: (key: string) => void }) {
  return (
    <div role="tablist" aria-label="Closing stages" style={{ display: 'flex', overflowX: 'auto', padding: '6px 2px 12px' }}>
      {stages.map((stage, index) => {
        const selected = active === stage.key
        const colors = stage.state === 'done' ? ['#15803d', '#dcfce7'] : stage.state === 'overdue' ? ['#b91c1c', '#fee2e2'] : stage.state === 'active' ? ['#0f3460', '#dbeafe'] : ['#64748b', '#f1f5f9']
        return (
          <div key={stage.key} style={{ display: 'flex', alignItems: 'flex-start', flex: '1 0 112px' }}>
            <button
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onChange?.(stage.key)}
              style={{ border: 0, background: 'transparent', padding: 0, cursor: onChange ? 'pointer' : 'default', minWidth: 82, color: colors[0], textAlign: 'center' }}
            >
              <span className={stage.state === 'overdue' ? 'animate-pulse' : ''} style={{ width: 32, height: 32, borderRadius: 999, display: 'grid', placeItems: 'center', margin: '0 auto', background: colors[1], border: `2px solid ${colors[0]}`, boxShadow: selected ? '0 0 0 4px rgba(201,168,76,.22)' : 'none', fontWeight: 900, fontSize: 12 }}>
                {stage.state === 'done' ? '✓' : stage.count ?? index + 1}
              </span>
              <span style={{ display: 'block', fontSize: 11, fontWeight: selected ? 900 : 700, marginTop: 7, whiteSpace: 'nowrap' }}>{stage.label}</span>
            </button>
            {index < stages.length - 1 && <span aria-hidden="true" style={{ height: 2, flex: 1, minWidth: 18, background: stage.state === 'done' ? '#86efac' : '#e2e8f0', marginTop: 15 }} />}
          </div>
        )
      })}
    </div>
  )
}

export interface TimelineItem {
  id: string
  title: string
  category?: string
  dueLabel?: string
  completed?: boolean
  overdue?: boolean
  attention?: boolean
  notes?: string | null
}

export function VerticalTimeline({ items, onToggle, onDelete }: { items: TimelineItem[]; onToggle?: (id: string) => void; onDelete?: (id: string) => void }) {
  const [openNotes, setOpenNotes] = useState<string | null>(null)
  const tones = ['#c9a84c', '#0f3460', '#7c3aed', '#0284c7', '#15803d', '#be123c']
  return (
    <div style={{ display: 'grid' }}>
      {items.map((item, index) => (
        <div key={item.id} style={{ position: 'relative', display: 'grid', gridTemplateColumns: '34px minmax(0,1fr)', gap: 12, paddingBottom: index === items.length - 1 ? 0 : 20 }}>
          {index < items.length - 1 && <span aria-hidden="true" style={{ position: 'absolute', left: 15, top: 27, bottom: -2, width: 2, background: '#e2e8f0' }} />}
          <button type="button" onClick={() => onToggle?.(item.id)} aria-label={`${item.completed ? 'Reopen' : 'Complete'} ${item.title}`} style={{ zIndex: 1, width: 32, height: 32, borderRadius: 999, border: `2px solid ${item.overdue ? '#dc2626' : item.completed ? '#15803d' : tones[index % tones.length]}`, background: item.completed ? '#dcfce7' : item.overdue ? '#fee2e2' : '#fff', color: item.completed ? '#15803d' : item.overdue ? '#dc2626' : tones[index % tones.length], fontWeight: 900, cursor: 'pointer' }}>{item.completed ? '✓' : index + 1}</button>
          <div className="group" style={{ minWidth: 0, border: '1px solid rgba(15,23,42,.08)', borderRadius: 14, padding: '12px 14px', background: item.completed ? 'rgba(248,250,252,.8)' : '#fff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: item.completed ? '#94a3b8' : 'var(--navy)', textDecoration: item.completed ? 'line-through' : 'none', fontWeight: 800, fontSize: 14 }}>{item.title}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginTop: 6 }}>
                  {item.category && <Chip tone="navy">{item.category.replaceAll('_', ' ')}</Chip>}
                  {item.dueLabel && <span style={{ fontSize: 12, color: 'var(--muted)' }}>Due {item.dueLabel}</span>}
                  {item.overdue && <Chip tone="red">Overdue</Chip>}
                  {item.attention && <Chip tone="gold">Attention</Chip>}
                  {item.notes && <button type="button" onClick={() => setOpenNotes(openNotes === item.id ? null : item.id)} style={{ border: 0, background: 'transparent', color: '#0f3460', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>{openNotes === item.id ? 'Hide notes' : 'View notes'}</button>}
                </div>
              </div>
              {onDelete && <button type="button" onClick={() => onDelete(item.id)} aria-label={`Delete ${item.title}`} className="opacity-0 group-hover:opacity-100 focus:opacity-100" style={{ border: 0, background: 'transparent', color: '#94a3b8', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>⋯</button>}
            </div>
            {item.notes && openNotes === item.id && <div style={{ marginTop: 10, padding: 10, borderRadius: 10, background: '#f8fafc', color: '#475569', fontSize: 13, lineHeight: 1.5 }}>{item.notes}</div>}
          </div>
        </div>
      ))}
    </div>
  )
}

export interface DealCommandOption {
  id: string
  name: string
  askingPrice?: number | null
  progress?: number
  tracked?: boolean
}

export function DealCommandBar({ options, value, onChange, formatMoney = (amount) => amount == null ? 'Price not set' : `$${amount.toLocaleString()}` }: { options: DealCommandOption[]; value?: string; onChange: (id: string) => void; formatMoney?: (amount?: number | null) => string }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const listId = useId()
  const selected = options.find((option) => option.id === value)
  const filtered = useMemo(() => options.filter((option) => option.name.toLowerCase().includes(query.toLowerCase())), [options, query])
  return (
    <div style={{ position: 'relative' }}>
      <label htmlFor={`${listId}-input`} className="sr-only">Search deals</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, border: '1px solid rgba(15,52,96,.16)', borderRadius: 15, padding: '11px 14px', background: '#fff', boxShadow: open ? '0 0 0 4px rgba(201,168,76,.15)' : '0 8px 22px rgba(15,23,42,.06)' }}>
        <span aria-hidden="true">⌕</span>
        <input id={`${listId}-input`} role="combobox" aria-expanded={open} aria-controls={listId} value={open ? query : selected?.name || query} onFocus={() => { setOpen(true); setQuery('') }} onChange={(event) => { setQuery(event.target.value); setOpen(true) }} onKeyDown={(event) => { if (event.key === 'Escape') setOpen(false); if (event.key === 'Enter' && filtered[0]) { onChange(filtered[0].id); setOpen(false) } }} placeholder="Search by business name…" style={{ border: 0, outline: 0, flex: 1, minWidth: 0, fontSize: 14, fontWeight: 700, color: 'var(--navy)', background: 'transparent' }} />
        <span style={{ color: 'var(--muted)', fontSize: 12 }}>{options.length} deals</span>
      </div>
      {open && <div id={listId} role="listbox" style={{ position: 'absolute', zIndex: 30, top: 'calc(100% + 8px)', left: 0, right: 0, maxHeight: 360, overflowY: 'auto', padding: 8, border: '1px solid rgba(15,23,42,.1)', borderRadius: 16, background: '#fff', boxShadow: '0 20px 50px rgba(15,23,42,.18)' }}>
        {filtered.length ? filtered.map((option) => <button key={option.id} type="button" role="option" aria-selected={option.id === value} onClick={() => { onChange(option.id); setOpen(false); setQuery('') }} style={{ width: '100%', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 12, alignItems: 'center', padding: '11px 12px', border: 0, borderRadius: 12, background: option.id === value ? '#f8f4e8' : 'transparent', cursor: 'pointer', textAlign: 'left' }}>
          <span style={{ minWidth: 0 }}><strong style={{ display: 'block', color: 'var(--navy)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{option.name}</strong><small style={{ color: 'var(--muted)' }}>{formatMoney(option.askingPrice)}{option.tracked ? ' · active tracker' : ''}</small></span>
          <ProgressRing value={option.progress || 0} size={48} stroke={5} label="" />
        </button>) : <EmptyState icon="⌕" title="No matching deals" sub="Try a different business name." />}
      </div>}
    </div>
  )
}

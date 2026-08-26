/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

// =============================================================================
// MoneyInput — number input that formats with commas as you type (120,000).
// Stores the formatted string; downstream parsers strip $ , before Number().
// Feels natural: users type digits, commas appear automatically.
// =============================================================================

/** Strip currency formatting → plain numeric string. */
export function stripMoney(s: string): string {
  return (s || '').replace(/[$,]/g, '').trim()
}

/** Parse a formatted money string → number (or null when blank/invalid). */
export function moneyToNumber(s: string): number | null {
  const clean = stripMoney(s)
  if (!clean) return null
  const n = Number(clean)
  return Number.isFinite(n) ? n : null
}

/** Add thousands separators to a raw digits string. */
export function formatWithCommas(digits: string): string {
  const clean = digits.replace(/[^0-9.]/g, '')
  const [int, dec] = clean.split('.')
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return dec !== undefined ? `${grouped}.${dec}` : grouped
}

/** Format a numeric value (number or numeric string) with commas. */
export function fmtNumber(n: number | string | null | undefined): string {
  if (n === null || n === undefined || n === '') return ''
  const num = typeof n === 'string' ? moneyToNumber(n) : n
  if (num === null || !Number.isFinite(num)) return String(n ?? '')
  return num.toLocaleString('en-US', { maximumFractionDigits: 2 })
}

export default function MoneyInput({
  value,
  onChange,
  placeholder,
  style,
  prefix = '$',
}: {
  value: string
  onChange: (formatted: string) => void
  placeholder?: string
  style?: React.CSSProperties
  prefix?: string
}) {
  return (
    <div style={{ position: 'relative', ...(style || {}) }}>
      <span style={{ position: 'absolute', left: 12, top: 11, color: 'var(--muted)', fontSize: 14, pointerEvents: 'none' }}>{prefix}</span>
      <input
        className="input"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(formatWithCommas(e.target.value))}
        placeholder={placeholder || '0'}
        style={{ paddingLeft: 27, ...(style || {}) }}
      />
    </div>
  )
}

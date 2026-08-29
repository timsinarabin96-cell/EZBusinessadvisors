/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Money input helpers — live thousands separators while typing.
// -----------------------------------------------------------------------------
// Text inputs that show 900,000,000 as you type (instead of raw 900000000) and
// still parse cleanly for math. State stores the RAW digits (no commas); the
// display layer formats. One decimal point is allowed; everything else is
// stripped so pasted "900,000,000" and "900000000" behave identically.
// =============================================================================

/** Keep only digits + a single decimal point. */
export function stripMoney(raw: string): string {
  const cleaned = String(raw ?? '').replace(/[^\d.]/g, '')
  const parts = cleaned.split('.')
  if (parts.length > 2) return parts[0] + '.' + parts.slice(1).join('')
  return cleaned
}

/** Format raw digits with thousands separators: 900000000 → 900,000,000. */
export function formatMoneyInput(raw: string): string {
  const cleaned = stripMoney(raw)
  const [intPart, decPart] = cleaned.split('.')
  const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return decPart !== undefined ? withCommas + '.' + decPart : withCommas
}

/** Parse a formatted/raw money string into a number (null when empty/invalid). */
export function parseMoneyInput(raw: string): number | null {
  const cleaned = stripMoney(raw)
  if (!cleaned) return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

/** onChange handler adapter: keeps raw digits in state, formats on display. */
export function moneyChange(setter: (v: string) => void) {
  return (e: { target: { value: string } }) => setter(stripMoney(e.target.value))
}

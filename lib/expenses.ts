/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Expenses — advanced platform cost tracking.
// Covers AI/API usage, domains, hosting, SMS/phone, email, tools, marketing,
// subscriptions, and other costs. Includes monthly costing analytics:
// totals, category breakdown, vendor breakdown, and per-month trend.
// =============================================================================


export type ExpenseCategory = 'ai_api' | 'hosting' | 'domain' | 'sms_phone' | 'email' | 'tools' | 'marketing' | 'subscriptions' | 'other'

export const EXPENSE_CATEGORIES: { id: ExpenseCategory; label: string; icon: string }[] = [
  { id: 'ai_api', label: 'AI / API Costs', icon: '🤖' },
  { id: 'hosting', label: 'Hosting & Infra', icon: '☁️' },
  { id: 'domain', label: 'Domains', icon: '🌐' },
  { id: 'sms_phone', label: 'SMS / Phone', icon: '📱' },
  { id: 'email', label: 'Email', icon: '📧' },
  { id: 'tools', label: 'Tools & SaaS', icon: '🧰' },
  { id: 'marketing', label: 'Marketing', icon: '📣' },
  { id: 'subscriptions', label: 'Subscriptions', icon: '🔁' },
  { id: 'other', label: 'Other', icon: '📦' },
]

export const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(EXPENSE_CATEGORIES.map((c) => [c.id, c.label]))

export interface Expense {
  id: string
  agency_id: string | null
  category: ExpenseCategory
  vendor: string
  description: string | null
  amount_cents: number
  currency: string
  expense_date: string
  recurring: boolean
  paid: boolean
  payment_method: string | null
  payment_reference: string | null
  receipt_url: string | null
  notes: string | null
  created_at?: string | null
}

export interface ExpenseInput {
  category: ExpenseCategory
  vendor: string
  description?: string
  amount_cents: number
  expense_date?: string
  recurring?: boolean
  paid?: boolean
  payment_method?: string
  payment_reference?: string
  receipt_url?: string
  notes?: string
}

export interface ExpenseSummary {
  totalCents: number
  monthCents: number
  monthLabel: string
  recurringCents: number
  byCategory: { category: string; label: string; icon: string; cents: number; share: number }[]
  byVendor: { vendor: string; cents: number; share: number }[]
  byMonth: { month: string; cents: number }[]
}

const money = (cents: number) => '$' + (cents / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })

// ---------------------------------------------------------------------------
// Fetch expenses (admin: all; member: own agency only).
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// Costing analytics.
// ---------------------------------------------------------------------------
export function summarizeExpenses(rows: Expense[], month: string): ExpenseSummary {
  const now = new Date()
  const monthLabel = month
    ? new Date(month + '-01T12:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  const totalCents = rows.reduce((s, r) => s + (r.amount_cents || 0), 0)
  const monthCents = rows
    .filter((r) => (r.expense_date || '').startsWith(month || now.toISOString().slice(0, 7)))
    .reduce((s, r) => s + (r.amount_cents || 0), 0)
  const recurringCents = rows.filter((r) => r.recurring).reduce((s, r) => s + (r.amount_cents || 0), 0)

  // Category breakdown
  const catMap = new Map<string, number>()
  for (const r of rows) catMap.set(r.category, (catMap.get(r.category) || 0) + (r.amount_cents || 0))
  const byCategory = Array.from(catMap.entries())
    .map(([category, cents]) => ({
      category,
      label: CATEGORY_LABEL[category] || category,
      icon: EXPENSE_CATEGORIES.find((c) => c.id === category)?.icon || '📦',
      cents,
      share: totalCents ? cents / totalCents : 0,
    }))
    .sort((a, b) => b.cents - a.cents)

  // Vendor breakdown
  const vendorMap = new Map<string, number>()
  for (const r of rows) {
    const key = r.vendor || 'Other'
    vendorMap.set(key, (vendorMap.get(key) || 0) + (r.amount_cents || 0))
  }
  const byVendor = Array.from(vendorMap.entries())
    .map(([vendor, cents]) => ({ vendor, cents, share: totalCents ? cents / totalCents : 0 }))
    .sort((a, b) => b.cents - a.cents)
    .slice(0, 12)

  // Per-month trend (last 6 months incl. current)
  const byMonth: { month: string; cents: number }[] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const cents = rows.filter((r) => (r.expense_date || '').startsWith(key)).reduce((s, r) => s + (r.amount_cents || 0), 0)
    byMonth.push({ month: d.toLocaleDateString('en-US', { month: 'short' }), cents })
  }

  return { totalCents, monthCents, monthLabel, recurringCents, byCategory, byVendor, byMonth }
}

export { money as fmtExpense }

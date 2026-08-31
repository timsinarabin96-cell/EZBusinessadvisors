/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Expense CSV import — server-side parser + AI categorization.
// Handles common bank/card statement formats (date, description, amount;
// optionally vendor/category columns). Negative amounts = expenses; positive
// rows (credits/payments) are skipped. Every imported line is AI-categorized
// into the platform's cost categories and deduped before insert.
// =============================================================================

import { complete } from '@/lib/claude/client'

export const IMPORT_CATEGORIES = ['ai_api', 'hosting', 'domain', 'sms_phone', 'email', 'tools', 'marketing', 'subscriptions', 'other']

export interface ParsedExpense {
  expense_date: string // YYYY-MM-DD
  vendor: string
  description: string
  amount_cents: number
  currency: string
}

// ---- Tiny CSV parser (handles quoted fields, commas, newlines) ---------------
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false
  const src = text.replace(/^\uFEFF/, '') // strip BOM
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++ } else inQuotes = false
      } else cell += ch
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      row.push(cell); cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      row.push(cell); cell = ''
      if (row.some((c) => c.trim() !== '')) rows.push(row)
      row = []
    } else {
      cell += ch
    }
  }
  row.push(cell)
  if (row.some((c) => c.trim() !== '')) rows.push(row)
  return rows
}

// ---- Column detection from header row -----------------------------------------
function detectColumns(header: string[]): { date: number; desc: number; amount: number; vendor: number; category: number } {
  const h = header.map((x) => x.toLowerCase().trim())
  const find = (keys: string[]) => h.findIndex((x) => keys.some((k) => x.includes(k)))
  return {
    date: find(['date', 'posted', 'transaction date', 'trans date', 'time']),
    desc: find(['description', 'memo', 'details', 'transaction', 'payee', 'name', 'merchant']),
    amount: find(['amount', 'debit', 'charge', 'withdrawal', 'spend']),
    vendor: find(['vendor', 'merchant', 'payee', 'company']),
    category: find(['category', 'type', 'kind']),
  }
}

function parseDate(v: string): string | null {
  const s = v.trim()
  if (!s) return null
  // YYYY-MM-DD
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  // MM/DD/YYYY or MM/DD/YY
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/)
  if (m) {
    let y = m[3]
    if (y.length === 2) y = '20' + y
    return `${y}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`
  }
  // M/D/YYYY with spaces, or "Aug 25, 2026"
  m = s.match(/^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})/)
  if (m) {
    const months: Record<string, string> = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' }
    const mo = months[m[1].slice(0, 3).toLowerCase()]
    if (mo) return `${m[3]}-${mo}-${m[2].padStart(2, '0')}`
  }
  return null
}

function parseAmount(v: string): number | null {
  const s = v.trim().replace(/[$,\s]/g, '')
  if (!s) return null
  const n = parseFloat(s)
  if (isNaN(n)) return null
  // Debit columns are positive; credit/payment columns negative. Bank statements
  // often use parentheses for debits: (12.34) = expense.
  const paren = /\(.*\)/.test(v.trim())
  const isCredit = /credit|payment|deposit/i.test(v.trim())
  if (paren) return Math.abs(n) * 100
  if (isCredit) return -Math.abs(n) * 100
  return Math.round(n * 100)
}

/** Parse CSV text into normalized expense rows (credits excluded). */
export function parseExpenseCsv(text: string): ParsedExpense[] {
  const rows = parseCsv(text)
  if (rows.length < 2) return []
  const cols = detectColumns(rows[0])
  if (cols.amount < 0 || (cols.desc < 0 && cols.vendor < 0)) return []

  const out: ParsedExpense[] = []
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    const amount = cols.amount >= 0 ? parseAmount(r[cols.amount] || '') : null
    if (amount === null || amount <= 0) continue // skip credits / non-expenses
    const descRaw = (cols.desc >= 0 ? r[cols.desc] : '') || ''
    const vendorRaw = (cols.vendor >= 0 ? r[cols.vendor] : '') || ''
    const dateRaw = cols.date >= 0 ? r[cols.date] : ''
    const date = parseDate(dateRaw) || new Date().toISOString().slice(0, 10)
    // Vendor: prefer explicit vendor col, else first token of description.
    const vendor = (vendorRaw.trim() || descRaw.trim().split(/\s+/).slice(0, 2).join(' ') || 'Unknown').slice(0, 80)
    const description = (descRaw.trim() || `${vendorRaw.trim()} expense`).slice(0, 300)
    out.push({ expense_date: date, vendor, description, amount_cents: amount, currency: 'USD' })
  }
  return out
}

/** AI categorize a vendor+description into a platform cost category. */
export async function aiCategorizeExpense(vendor: string, description: string): Promise<string> {
  try {
    const res = await complete({
      context: { kind: 'support', entityId: `${vendor} ${description}`, text: `Vendor: ${vendor}. Description: ${description}` },
      system:
        'You are a meticulous accountant. Classify this business expense into exactly one category. ' +
        `Allowed categories: ${IMPORT_CATEGORIES.join(', ')}. ` +
        'Rules: OpenAI/DeepSeek/Anthropic/Claude/Gemini API usage = ai_api; Vercel/Netlify/Render/AWS/Cloudflare/Railway/Supabase = hosting; ' +
        'Namecheap/GoDaddy/Cloudflare Domains/registrar renewals = domain; Twilio/Vonage/phone/SMS = sms_phone; ' +
        'SendGrid/Postmark/Resend/email = email; Figma/Notion/Zapier/Linear/GitHub/Microsoft/Google Workspace = tools; ' +
        'Meta/Google Ads/SEO/marketing = marketing; Stripe/SaaS subscriptions = subscriptions; otherwise other. ' +
        'Reply with ONLY the category word, nothing else.',
      message: 'Classify this expense into exactly one category word.',
      maxTokens: 10,
    })
    const cat = String(res.text || '').trim().toLowerCase()
    return IMPORT_CATEGORIES.includes(cat) ? cat : 'other'
  } catch {
    return 'other'
  }
}

/** Guess vendor from a raw description (strip card suffixes, order numbers, dates). */
export function guessVendor(description: string): string {
  let d = description.replace(/\b(?:XX+|\d{4,})\b/g, '').replace(/[^a-zA-Z0-9 .&'-]/g, ' ').trim()
  d = d.replace(/\b(?:DEBIT|PURCHASE|PAYMENT|POS|ONLINE|CARD|ACH|WEB)\b/gi, '').trim()
  if (!d) return 'Unknown'
  const words = d.split(/\s+/)
  return words.slice(0, 3).join(' ').slice(0, 60)
}

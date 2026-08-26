/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Provider cost sync — automatically pull real usage costs from the services
// the platform depends on (Twilio, Anthropic, DeepSeek, Supabase, Vercel).
// Each provider returns a cost line that gets recorded into `expenses` with
// the right category, so the books stay current with ZERO manual entry.
// =============================================================================

export interface ProviderCost {
  provider: string
  vendor: string
  category: 'ai_api' | 'sms_phone' | 'hosting' | 'email' | 'other'
  description: string
  amountCents: number
  expenseDate: string // YYYY-MM-DD
  currency: string
}

const today = () => new Date().toISOString().slice(0, 10)

/** 1) Twilio — real usage cost for the current month (usage records API). */
async function twilioCost(): Promise<ProviderCost | null> {
  const sid = process.env.TWILIO_ACCOUNT_SID
  const auth = process.env.TWILIO_AUTH_TOKEN
  if (!sid || !auth) return null
  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Usage/Records.json?Category=totalprice&PageSize=1`,
      { headers: { Authorization: 'Basic ' + Buffer.from(`${sid}:${auth}`).toString('base64') } },
    )
    if (!res.ok) return null
    const j = await res.json()
    const rec = j?.usage_records?.[0]
    if (!rec) return null
    const amount = parseFloat(rec.price) || 0
    if (amount <= 0) return null
    return {
      provider: 'twilio', vendor: 'Twilio', category: 'sms_phone',
      description: `Twilio usage — ${rec.description || 'SMS/Voice'} (${rec.count || ''} units)`,
      amountCents: Math.round(amount * 100),
      expenseDate: today(), currency: 'USD',
    }
  } catch {
    return null
  }
}

/** 2) DeepSeek — balance-based spend estimate (delta since last sync stored in env-agnostic way: use current balance as a snapshot; caller decides). */
async function deepseekCost(): Promise<ProviderCost | null> {
  const key = process.env.DEEPSEEK_API_KEY
  if (!key) return null
  try {
    const res = await fetch('https://api.deepseek.com/user/balance', {
      headers: { Authorization: `Bearer ${key}` },
    })
    if (!res.ok) return null
    const j = await res.json()
    // DeepSeek returns total_balance & currency; snapshot is informational.
    const bal = j?.balance_infos?.[0]
    if (!bal) return null
    // We record a $0.00 snapshot line as a sync marker (real spend tracked via
    // balance delta in a future version; prevents double-counting today).
    return {
      provider: 'deepseek', vendor: 'DeepSeek', category: 'ai_api',
      description: `DeepSeek balance snapshot — ${bal.total_balance || '—'} ${bal.currency || 'USD'}`,
      amountCents: 0, expenseDate: today(), currency: bal.currency || 'USD',
    }
  } catch {
    return null
  }
}

/** 3) Anthropic — usage report (admin key). */
async function anthropicCost(): Promise<ProviderCost | null> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return null
  try {
    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    const end = now.toISOString()
    const res = await fetch(
      `https://api.anthropic.com/v1/organizations/usage_report?starting_at=${encodeURIComponent(start)}&ending_at=${encodeURIComponent(end)}`,
      { headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' } },
    )
    if (!res.ok) return null
    const j = await res.json()
    const total = j?.usage_report?.[0]?.total_cost ?? j?.total_cost
    const amount = parseFloat(total) || 0
    if (amount <= 0) return null
    return {
      provider: 'anthropic', vendor: 'Anthropic', category: 'ai_api',
      description: `Anthropic API usage — current month`,
      amountCents: Math.round(amount * 100), expenseDate: today(), currency: 'USD',
    }
  } catch {
    return null
  }
}

async function openaiCost(): Promise<ProviderCost | null> {
  // OpenAI usage API requires an admin key (sk-admin-...) or org owner key.
  // Regular project keys will 401/403 → we return null and skip (no crash).
  const key = process.env.OPENAI_API_KEY || process.env.OPENAI_ADMIN_KEY
  if (!key) return null
  try {
    const now = new Date()
    const start = Math.floor(new Date(now.getFullYear(), now.getMonth(), 1).getTime() / 1000)
    const end = Math.floor(now.getTime() / 1000)
    const res = await fetch(
      `https://api.openai.com/v1/organization/usage/completions?start_time=${start}&end_time=${end}&bucket_width=1d`,
      { headers: { Authorization: `Bearer ${key}` } },
    )
    if (!res.ok) return null
    const j = await res.json()
    const buckets = j?.data || []
    let total = 0
    for (const b of buckets) {
      for (const r of b?.results || []) total += parseFloat(r?.amount) || 0
    }
    if (total <= 0) return null
    return {
      provider: 'openai', vendor: 'OpenAI', category: 'ai_api',
      description: 'OpenAI API usage — current month',
      amountCents: Math.round(total * 100), expenseDate: today(), currency: 'USD',
    }
  } catch {
    return null
  }
}

/** 4) Supabase — project usage via management API (needs SUPABASE_MGMT_TOKEN). */
async function supabaseCost(): Promise<ProviderCost | null> {
  const token = process.env.SUPABASE_MGMT_TOKEN
  const ref = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').match(/https:\/\/([^.]+)\.supabase\.co/)?.[1]
  if (!token || !ref) return null
  try {
    const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/usage`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return null
    const j = await res.json()
    // usage API returns arrays; find the spend-ish entries.
    const items = Array.isArray(j) ? j : (j?.usage || [])
    const spend = items.find((i: any) => /spend|cost|billing/i.test(String(i?.metric || i?.name || '')))
    const amount = spend ? parseFloat(spend?.cost ?? spend?.usage ?? spend?.value ?? 0) : NaN
    if (!amount || isNaN(amount) || amount <= 0) return null
    return {
      provider: 'supabase', vendor: 'Supabase', category: 'hosting',
      description: `Supabase usage — ${spend?.metric || 'project'}`,
      amountCents: Math.round(amount * 100), expenseDate: today(), currency: 'USD',
    }
  } catch {
    return null
  }
}

/** 5) Vercel — deployment/usage cost (needs VERCEL_TOKEN). */
async function vercelCost(): Promise<ProviderCost | null> {
  const token = process.env.VERCEL_TOKEN
  if (!token) return null
  try {
    const res = await fetch('https://api.vercel.com/v2/usage', {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return null
    const j = await res.json()
    const amount = parseFloat(j?.total?.amount ?? j?.amount ?? 0) || 0
    if (amount <= 0) return null
    return {
      provider: 'vercel', vendor: 'Vercel', category: 'hosting',
      description: `Vercel usage — current month`,
      amountCents: Math.round(amount * 100), expenseDate: today(), currency: 'USD',
    }
  } catch {
    return null
  }
}

/** Run every enabled provider and return the costs found (>=0 cents). */
export async function syncProviderCosts(): Promise<ProviderCost[]> {
  const results = await Promise.allSettled([
    twilioCost(), deepseekCost(), anthropicCost(), openaiCost(), supabaseCost(), vercelCost(),
  ])
  return results
    .filter((r): r is PromiseFulfilledResult<ProviderCost | null> => r.status === 'fulfilled' && r.value !== null)
    .map((r) => r.value as ProviderCost)
    .filter((c) => c.amountCents > 0) // drop $0 markers from the books
}

/**
 * Pull provider costs and record them into `expenses` (dedupe by
 * vendor + description + amount + date). Shared by the admin Sync button
 * and the daily /api/cron/provider-costs job so both use one code path.
 */
export async function recordProviderCosts(): Promise<{
  added: unknown[]
  skipped: unknown[]
  providerLines: number
}> {
  const { createServerClient } = await import('@/lib/supabase/server')
  const db = createServerClient()
  if (!db) return { added: [], skipped: [{ error: 'not configured' }], providerLines: 0 }

  const costs = await syncProviderCosts()
  const added: unknown[] = []
  const skipped: unknown[] = []
  for (const c of costs) {
    const { data: existing } = await db
      .from('expenses')
      .select('id')
      .eq('vendor', c.vendor)
      .eq('description', c.description)
      .eq('amount_cents', c.amountCents)
      .eq('expense_date', c.expenseDate)
      .maybeSingle()
    if (existing) {
      skipped.push({ vendor: c.vendor, amountCents: c.amountCents, reason: 'duplicate' })
      continue
    }
    const { data: row, error } = await db
      .from('expenses')
      .insert({
        category: c.category, vendor: c.vendor, description: c.description,
        amount_cents: c.amountCents, currency: c.currency,
        expense_date: c.expenseDate, recurring: false, paid: true,
        notes: 'Auto-synced from provider API',
      })
      .select()
      .single()
    if (error) {
      skipped.push({ vendor: c.vendor, error: error.message })
      continue
    }
    added.push(row)
  }
  return { added, skipped, providerLines: costs.length }
}

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { isPlatformAdmin } from '@/lib/platform'
import { parseExpenseCsv, aiCategorizeExpense, guessVendor } from '@/lib/expenseImport'

export const runtime = 'nodejs'

// =============================================================================
// POST /api/admin/expenses/import — CSV statement upload.
// Accepts raw CSV text (any bank/card format), parses rows, AI-categorizes
// every expense, dedupes against existing entries, and inserts the new ones.
// Body: { csv: string } — the file contents.
// =============================================================================

export async function POST(req: NextRequest) {
  if (!(await isPlatformAdmin(req))) {
    return NextResponse.json({ ok: false, error: 'Platform admin access only' }, { status: 403 })
  }
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  const body = await req.json().catch(() => ({}))
  const csv = String(body.csv || '').trim()
  if (!csv) return NextResponse.json({ ok: false, error: 'CSV content is required' }, { status: 400 })
  if (csv.length > 2_000_000) return NextResponse.json({ ok: false, error: 'CSV too large (max 2MB)' }, { status: 400 })

  const parsed = parseExpenseCsv(csv)
  if (parsed.length === 0) {
    return NextResponse.json({ ok: false, error: 'No expense rows found. Expected a header row with Date / Description / Amount columns.' }, { status: 422 })
  }

  const added: unknown[] = []
  const skipped: unknown[] = []
  let categorized = 0

  for (const line of parsed) {
    // Normalize vendor with a light heuristic if it looks generic.
    const vendor = line.vendor === 'Unknown' ? guessVendor(line.description) : line.vendor

    // Dedupe: same vendor + amount + date (+ description prefix).
    const { data: existing } = await db
      .from('expenses')
      .select('id')
      .eq('vendor', vendor)
      .eq('amount_cents', line.amount_cents)
      .eq('expense_date', line.expense_date)
      .limit(1)
    if (existing && existing.length > 0) {
      skipped.push({ vendor, amountCents: line.amount_cents, date: line.expense_date, reason: 'duplicate' })
      continue
    }

    // AI categorization.
    const category = await aiCategorizeExpense(vendor, line.description)
    if (category !== 'other') categorized++

    const { data: row, error } = await db
      .from('expenses')
      .insert({
        category,
        vendor,
        description: line.description,
        amount_cents: line.amount_cents,
        currency: line.currency,
        expense_date: line.expense_date,
        recurring: false,
        paid: true,
        notes: 'Imported from statement CSV',
      })
      .select()
      .single()
    if (error) {
      skipped.push({ vendor, amountCents: line.amount_cents, error: error.message })
      continue
    }
    added.push(row)
  }

  return NextResponse.json({
    ok: true,
    summary: {
      parsed: parsed.length,
      added: added.length,
      skipped: skipped.length,
      aiCategorized: categorized,
    },
    added,
    skipped,
  })
}

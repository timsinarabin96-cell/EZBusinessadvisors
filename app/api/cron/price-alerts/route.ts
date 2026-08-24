import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email'

export const runtime = 'nodejs'

/**
 * GET /api/cron/price-alerts?secret=CRON_SECRET
 * Checks watched listings for price drops and emails watchers.
 */
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret')
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  const { data: watchers } = await db.from('price_watchers').select('*, listings(asking_price, business_name)')
  if (!watchers?.length) return NextResponse.json({ ok: true, notified: 0 })

  let notified = 0
  for (const w of watchers as any[]) {
    const listing = w.listings
    const current = listing?.asking_price ?? null
    const last = w.last_price ?? null
    if (current != null && last != null && current < last) {
      await sendEmail({
        to: w.email,
        subject: `💰 Price drop: ${listing?.business_name || 'a listing you watch'} is now $${Number(current).toLocaleString()}`,
        html: `<h2>Price drop alert 🎉</h2><p><strong>${listing?.business_name || 'A listing you watch'}</strong> just dropped from <s>$${Number(last).toLocaleString()}</s> to <strong style="color:#1e7e34;">$${Number(current).toLocaleString()}</strong>.</p><p><a href="https://concord-deal-platform.vercel.app/marketplace/listings" style="display:inline-block;padding:12px 22px;background:#0e7490;color:#fff;border-radius:8px;text-decoration:none;font-weight:700;">View it now →</a></p>`,
        kind: 'generic',
      }).catch(() => {})
      await db.from('price_watchers').update({ last_price: current }).eq('id', w.id)
      notified++
    } else if (current != null && last == null) {
      await db.from('price_watchers').update({ last_price: current }).eq('id', w.id)
    }
  }
  return NextResponse.json({ ok: true, notified })
}

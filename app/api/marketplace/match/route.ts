import { NextRequest, NextResponse } from 'next/server'
import { runMatchingForListing } from '@/lib/buyerMatching'
import { sendEmail } from '@/lib/email'
import { createClient } from '@supabase/supabase-js'
import { authenticateProfileRequest, unauthorizedResponse } from '@/lib/supabase/auth'

export const runtime = 'nodejs'

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const svc =
  SUPABASE_URL && SERVICE_KEY
    ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
    : null

/**
 * POST /api/marketplace/match
 * body: { listingId }
 * Runs the buyer match engine for a listing and queues notifications for
 * pending matches. Server-side only (service role); call from the listing
 * publish flow or a scheduled job.
 */
export async function POST(req: NextRequest) {
  // Broker/admin session required — this fires buyer-match email blasts.
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()
  const svcClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    { auth: { persistSession: false } },
  )
  try {
    const body = await req.json().catch(() => ({}))
    const listingId = String(body.listingId || '')
    if (!listingId) {
      return NextResponse.json({ error: 'listingId is required' }, { status: 400 })
    }
    // Verify the listing belongs to the caller's agency (cross-tenant guard).
    const { data: listingRow } = await svcClient.from('listings').select('agency_id').eq('id', listingId).maybeSingle()
    const listingAgency = (listingRow as { agency_id?: string | null } | null)?.agency_id
    if (!listingAgency) return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
    if (!auth.memberships.some((m) => m.agency_id === listingAgency)) {
      return NextResponse.json({ error: 'Not a member of this listing\'s agency' }, { status: 403 })
    }

    const matches = await runMatchingForListing(listingId)
    if (matches.length === 0) {
      return NextResponse.json({ matched: 0, notified: 0 })
    }

    // Load buyer emails + listing title for notification
    const buyerIds = matches.map((m) => m.buyer_profile_id)
    const { data: buyers } = await svc!
      .from('buyer_search_profiles')
      .select('id, email, name, notification_email')
      .in('id', buyerIds)

    const { data: listing } = await svc!
      .from('listings')
      .select('business_name, industry, asking_price, location_general')
      .eq('id', listingId)
      .maybeSingle()

    let notified = 0
    const byEmail = new Map((buyers || []).map((b: any) => [b.id, b]))

    for (const m of matches) {
      const buyer = byEmail.get(m.buyer_profile_id)
      if (!buyer || buyer.notification_email === false) continue

      const title = listing?.business_name || 'a new business'
      const price = listing?.asking_price
        ? `$${Number(listing.asking_price).toLocaleString()}`
        : 'price on request'
      const loc = listing?.location_general || ''
      const ind = listing?.industry || ''

      await sendEmail({
        to: buyer.email,
        subject: `New match: ${title}${loc ? ` in ${loc}` : ''}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px;">
            <h2 style="color: #102a43; margin-top: 0;">We found a match for you 🎯</h2>
            <p style="color: #334155;">A business that fits your criteria just went live:</p>
            <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
              <tr><td style="padding: 8px; color: #64748b;">Business</td><td style="padding: 8px; font-weight: 600;">${title}</td></tr>
              ${ind ? `<tr><td style="padding: 8px; color: #64748b;">Industry</td><td style="padding: 8px;">${ind}</td></tr>` : ''}
              ${loc ? `<tr><td style="padding: 8px; color: #64748b;">Location</td><td style="padding: 8px;">${loc}</td></tr>` : ''}
              <tr><td style="padding: 8px; color: #64748b;">Asking price</td><td style="padding: 8px; font-weight: 600;">${price}</td></tr>
            </table>
            <p style="color: #334155;">Match score: <strong>${m.match_score}/100</strong></p>
            <p style="color: #64748b; font-size: 13px;">You're receiving this because you saved this search profile with us. Reply to this email or log in to your dashboard to arrange a viewing.</p>
          </div>`,
      }).catch(() => {})

      await svc!
        .from('buyer_match_events')
        .update({ status: 'notified', notified_at: new Date().toISOString(), notification_channel: 'email' })
        .eq('id', m.buyer_profile_id)
        .eq('listing_id', m.listing_id)
      notified++
    }

    return NextResponse.json({ matched: matches.length, notified })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Match failed' }, { status: 500 })
  }
}

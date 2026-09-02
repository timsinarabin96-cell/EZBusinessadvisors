import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { EMPTY_DIGEST_ACTIVITY, renderHourlyDigest, shouldSendHourlyDigest, type DigestActivity, type DigestRow } from '@/lib/notificationV2'
import { sendEmail } from '@/lib/email'

export const runtime = 'nodejs'
export const maxDuration = 300

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const BOSS_EMAIL = process.env.VOICE_AGENT_BROKER_EMAIL || process.env.ADMIN_EMAIL || 'rtimsina@ezbusinessadvisors.com'
const PLATFORM_NAME = process.env.PLATFORM_DIGEST_NAME || 'EZ Business Advisors'
const SEND_QUIET_HOURS = process.env.HOURLY_DIGEST_QUIET_HOURS !== 'false'
const pause = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds))

type Db = any

async function rows(query: PromiseLike<{ data: unknown[] | null; error: { message?: string } | null }>, label: string): Promise<DigestRow[]> {
  const result = await query
  if (result.error) console.warn(`[hourly-digest] ${label}: ${result.error.message || 'query failed'}`)
  return (result.data || []) as DigestRow[]
}

async function collectActivity(db: Db, since: string, agencyId?: string): Promise<DigestActivity> {
  const listingIds = agencyId
    ? (await rows(db.from('listings').select('id, agency_id').eq('agency_id', agencyId).limit(1000) as never, 'listing ids')).map((row) => String(row.id))
    : []
  const direct = (table: string, select: string, timeColumn: string, label: string) => {
    let query = db.from(table).select(select).gte(timeColumn, since).limit(100)
    if (agencyId) query = query.eq('agency_id', agencyId)
    return rows(query as never, label)
  }
  const byListing = (table: string, select: string, timeColumn: string, label: string) => {
    let query = db.from(table).select(select).gte(timeColumn, since).limit(100)
    if (agencyId) {
      if (!listingIds.length) return Promise.resolve([])
      query = query.in('listing_id', listingIds)
    }
    return rows(query as never, label)
  }

  const [newListings, publishedListings, editedListings, buyerLeads, ndaSignings, ndaRequests, sellerIntakes, deals, offers, lois, milestones, appointments, calls, commissions, agentActivity] = await Promise.all([
    direct('listings', 'id, agency_id, business_name, status, asking_price, created_at, updated_at', 'created_at', 'new listings'),
    direct('listings', 'id, agency_id, business_name, status, asking_price, created_at, updated_at', 'updated_at', 'published listings').then((items) => items.filter((row) => row.status === 'active')),
    direct('listings', 'id, agency_id, business_name, status, asking_price, created_at, updated_at', 'updated_at', 'edited listings'),
    direct('buyer_leads', 'id, agency_id, full_name, email, phone, company, target_industry, budget_range, message, created_at', 'created_at', 'buyer leads'),
    byListing('listing_nda_signatures', 'id, listing_id, buyer_name, buyer_email, signed_at, listings(business_name, agency_id)', 'signed_at', 'nda signings'),
    direct('data_room_access_requests', 'id, agency_id, listing_id, requester_name, requester_email, status, nda_signed_at, created_at, listings(business_name, agency_id)', 'created_at', 'nda requests'),
    direct('seller_listing_orders', 'id, agency_id, business_name, status, amount_cents, created_at', 'created_at', 'seller intakes'),
    direct('deals', 'id, agency_id, title, status, created_at, updated_at', 'updated_at', 'deals'),
    byListing('deal_offers', 'id, listing_id, purchase_price, status, created_at, listings(business_name, agency_id)', 'created_at', 'offers'),
    direct('letters_of_intent', 'id, agency_id, listing_id, status, created_at, listings(business_name, agency_id)', 'created_at', 'lois'),
    direct('deal_milestones', 'id, agency_id, title, name, status, completed_at, updated_at, created_at', 'updated_at', 'milestones'),
    direct('appointments', 'id, agency_id, title, appointment_type, status, starts_at, created_at', 'created_at', 'appointments'),
    direct('call_sessions', 'id, agency_id, purpose, status, started_at, created_at', 'started_at', 'calls'),
    direct('commission_records', 'id, agency_id, amount, status, created_at', 'created_at', 'commissions'),
    direct('activity_log', 'id, agency_id, action, event_type, kind, summary, description, created_at', 'created_at', 'agent activity'),
  ])
  return { ...EMPTY_DIGEST_ACTIVITY, newListings, publishedListings, editedListings, buyerLeads, ndaSignings, ndaRequests, sellerIntakes, deals, offers, lois, milestones, appointments, calls, commissions, agentActivity }
}

async function agencyRecipients(db: Db, agencyId: string): Promise<Array<{ id: string; email: string; enabled: boolean }>> {
  const { data: members } = await db.from('agency_members').select('profile_id, role, is_owner').eq('agency_id', agencyId)
  const ids = (members || []).filter((member) => member.is_owner || member.role === 'admin' || member.role === 'owner').map((member) => member.profile_id)
  if (!ids.length) return []
  let { data: profiles, error } = await db.from('profiles').select('id, email, email_digest_hourly').in('id', ids)
  if (error) ({ data: profiles } = await db.from('profiles').select('id, email').in('id', ids))
  return (profiles || []).filter((profile) => profile.email).map((profile) => ({ id: profile.id, email: profile.email, enabled: (profile as { email_digest_hourly?: boolean }).email_digest_hourly !== false }))
}

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.get('x-cron-secret') !== secret) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  if (!SUPABASE_URL || !SERVICE_KEY) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
  const windowEnd = new Date()
  const windowStart = new Date(windowEnd.getTime() - 60 * 60 * 1000)
  const preferredAgencies = await db.from('agencies').select('id, name, notifications_hourly_digest').eq('is_active', true).order('name')
  const fallbackAgencies = preferredAgencies.error
    ? await db.from('agencies').select('id, name').eq('is_active', true).order('name')
    : null
  const agencies = (preferredAgencies.error ? fallbackAgencies?.data : preferredAgencies.data) as Array<{ id: string; name: string; notifications_hourly_digest?: boolean }> | null

  const report = { agencies: agencies?.length || 0, recipients: 0, sent: 0, skipped: 0, failed: 0 }
  for (const agency of agencies || []) {
    const agencyEnabled = (agency as { notifications_hourly_digest?: boolean }).notifications_hourly_digest !== false
    const recipients = await agencyRecipients(db, agency.id)
    const optedIn = recipients.filter((recipient) => shouldSendHourlyDigest(agencyEnabled, recipient.enabled))
    report.recipients += recipients.length
    report.skipped += recipients.length - optedIn.length
    if (!optedIn.length) continue

    const activity = await collectActivity(db, windowStart.toISOString(), agency.id)
    const rendered = renderHourlyDigest({ agencyName: agency.name || 'Your Brokerage', activity, windowStart: windowStart.toISOString(), windowEnd: windowEnd.toISOString() })
    if (!SEND_QUIET_HOURS && Object.values(activity).every((items) => items.length === 0)) continue
    for (const recipient of optedIn) {
      const result = await sendEmail({ to: recipient.email, subject: rendered.subject, html: rendered.html, kind: 'hourly_digest', fromName: agency.name || 'Your Brokerage', meta: { agency_id: agency.id, digest_window_start: windowStart.toISOString(), digest_window_end: windowEnd.toISOString() } })
      result.ok ? report.sent++ : report.failed++
      await db.from('app_notifications').insert({ agency_id: agency.id, profile_id: recipient.id, title: 'Hourly activity digest ready', body: rendered.subject, kind: 'info', link: '/dashboard' }).then(() => undefined)
      await pause(125)
    }
  }

  const platformActivity = await collectActivity(db, windowStart.toISOString())
  const platformDigest = renderHourlyDigest({ agencyName: PLATFORM_NAME, activity: platformActivity, windowStart: windowStart.toISOString(), windowEnd: windowEnd.toISOString(), platformRollup: true })
  const platformResult = await sendEmail({ to: BOSS_EMAIL, subject: platformDigest.subject, html: platformDigest.html, kind: 'hourly_digest', fromName: PLATFORM_NAME, meta: { platform_rollup: true, digest_window_start: windowStart.toISOString(), digest_window_end: windowEnd.toISOString() } })
  platformResult.ok ? report.sent++ : report.failed++

  return NextResponse.json({ ok: report.failed === 0, ...report, windowStart: windowStart.toISOString(), windowEnd: windowEnd.toISOString() })
}

export async function GET(req: Request) { return POST(req) }

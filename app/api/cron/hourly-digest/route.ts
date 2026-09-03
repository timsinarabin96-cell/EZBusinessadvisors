import { isCronAuthorized } from '@/lib/cronAuth'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { EMPTY_DIGEST_ACTIVITY, renderHourlyDigest, shouldSendHourlyDigest, type AgencySummaryRow, type DigestActivity, type DigestRow } from '@/lib/notificationV2'
import { buildFinanceStatement, emptyFinanceRaw, type FinanceRaw } from '@/lib/digestFinance'
import { sendEmail } from '@/lib/email'

export const runtime = 'nodejs'
export const maxDuration = 300

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const BOSS_EMAIL = process.env.VOICE_AGENT_BROKER_EMAIL || process.env.ADMIN_EMAIL || 'rtimsina@ezbusinessadvisors.com'
const PLATFORM_NAME = process.env.PLATFORM_DIGEST_NAME || 'Concord Deal Platform'
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

// ── Finance (P&L) collection ────────────────────────────────────────────────
// Recognized money-in statuses vs obvious non-revenue states. Sums are reduced
// in JS (best-effort, never throws) mirroring the money-digest approach.
const MONEY_IN = new Set(['paid', 'active', 'completed', 'fulfilled', 'succeeded', 'released', 'processing'])
const MONEY_SKIP = new Set(['pending', 'failed', 'cancelled', 'refunded', 'draft', 'expired', 'void'])
const isRecognized = (status: unknown) => status == null || (!MONEY_SKIP.has(String(status)) && (MONEY_IN.has(String(status)) || true))

async function collectFinance(db: Db, since: string, agencyId?: string): Promise<FinanceRaw> {
  const out = emptyFinanceRaw()
  const applyAgency = (query: any, tableHasAgency: boolean) => (agencyId && tableHasAgency ? query.eq('agency_id', agencyId) : query)
  const sumRows = (rowsData: unknown[], cents: boolean, col: string, centsCol?: string) =>
    (rowsData as Array<Record<string, unknown>>).reduce((sum, row) => {
      const amount = cents ? Number(row[centsCol || col] || 0) : Number(row[col] || 0)
      return sum + (cents ? amount / 100 : amount)
    }, 0)

  const fetchAll = async (table: string, select: string, timeCol: string, tableHasAgency: boolean) => {
    let query = db.from(table).select(select).gte(timeCol, since).limit(500)
    query = applyAgency(query, tableHasAgency)
    const r = await query
    return (r.data || []) as Array<Record<string, unknown>>
  }

  try {
    const orders = await fetchAll('seller_listing_orders', 'amount_cents,status,created_at', 'created_at', true)
    out.ordersPaidCents += sumRows(orders.filter((r) => isRecognized(r.status)), true, '', 'amount_cents')
    const valuations = await fetchAll('valuation_reports', 'amount_cents,status,created_at', 'created_at', true)
    out.valuationsPaidCents += sumRows(valuations.filter((r) => isRecognized(r.status)), true, '', 'amount_cents')
    const featured = await fetchAll('featured_slots', 'amount_cents,status,created_at', 'created_at', true)
    out.featuredPaidCents += sumRows(featured.filter((r) => isRecognized(r.status)), true, '', 'amount_cents')
    const store = await fetchAll('store_orders', 'profit,status,created_at', 'created_at', true)
    out.storeProfit += sumRows(store.filter((r) => isRecognized(r.status)), false, 'profit')
    const commissions = await fetchAll('commission_records', 'amount,status,created_at', 'created_at', true)
    out.commissionsPaid += sumRows(commissions.filter((r) => isRecognized(r.status)), false, 'amount')
    const expenses = await fetchAll('expenses', 'amount_cents,paid,created_at', 'created_at', true)
    out.expensesCents += sumRows(expenses.filter((r) => r.paid !== false), true, '', 'amount_cents')
    const contractor = await fetchAll('contractor_payments', 'amount,created_at', 'created_at', true)
    out.contractorPaid += sumRows(contractor, false, 'amount')
    // Invoices carry no agency_id — platform roll-up only (agency digests omit them).
    if (!agencyId) {
      const invoices = await fetchAll('invoices', 'amount,status,paid_at,created_at', 'created_at', false)
      out.invoicesPaid += sumRows(invoices.filter((r) => isRecognized(r.status)), false, 'amount')
    }
    out.paidCount += orders.length + valuations.length + featured.length + commissions.length
  } catch (error) {
    console.warn('[hourly-digest] finance collection failed:', error instanceof Error ? error.message : String(error))
  }
  return out
}

/** ET midnight (start of "today") as a UTC ISO string — P&L window label. */
function etStartOfTodayUtc(): string {
  const nowUtc = new Date()
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(nowUtc)
  const get = (t: string) => parts.find((p) => p.type === t)?.value || '1'
  const offsetMin = (nowUtc.getTime() - new Date(nowUtc.toLocaleString('en-US', { timeZone: 'America/New_York' })).getTime()) / 60000
  return new Date(Date.UTC(Number(get('year')), Number(get('month')) - 1, Number(get('day'))) + offsetMin * 60000).toISOString()
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
  if (!isCronAuthorized(req)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  if (!SUPABASE_URL || !SERVICE_KEY) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  // ── Twice-daily schedule (9 AM / 9 PM ET) ────────────────────────────────
  // Vercel cron fires at 01:00/02:00/13:00/14:00 UTC to cover both DST states;
  // this gate ensures we only run on the true 9:00 and 21:00 ET windows.
  const etHour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23' }).format(new Date()))
  if (etHour !== 9 && etHour !== 21) {
    return NextResponse.json({ ok: true, skipped: 'outside 9AM/9PM ET digest window', etHour })
  }

  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
  const windowEnd = new Date()
  // Covers the full span since the previous digest (12h apart at 9AM/9PM ET).
  const windowStart = new Date(windowEnd.getTime() - 12 * 60 * 60 * 1000)
  const preferredAgencies = await db.from('agencies').select('id, name, brand_color, accent_color, logo_url, notifications_hourly_digest').eq('is_active', true).order('name')
  const fallbackAgencies = preferredAgencies.error
    ? await db.from('agencies').select('id, name, notifications_hourly_digest').eq('is_active', true).order('name')
    : null
  const agencies = (preferredAgencies.error ? fallbackAgencies?.data : preferredAgencies.data) as Array<{ id: string; name: string; brand_color?: string | null; accent_color?: string | null; logo_url?: string | null; notifications_hourly_digest?: boolean }> | null

  const report = { agencies: agencies?.length || 0, recipients: 0, sent: 0, skipped: 0, failed: 0 }
  const agencySummaries: AgencySummaryRow[] = []
  const financeSince = etStartOfTodayUtc()
  for (const agency of agencies || []) {
    const agencyEnabled = (agency as { notifications_hourly_digest?: boolean }).notifications_hourly_digest !== false
    const recipients = await agencyRecipients(db, agency.id)
    const optedIn = recipients.filter((recipient) => shouldSendHourlyDigest(agencyEnabled, recipient.enabled))
    report.recipients += recipients.length
    report.skipped += recipients.length - optedIn.length
    if (!optedIn.length) continue

    const activity = await collectActivity(db, windowStart.toISOString(), agency.id)
    const finance = buildFinanceStatement(await collectFinance(db, financeSince, agency.id))
    const rendered = renderHourlyDigest({
      agencyName: agency.name || 'Your Brokerage',
      activity,
      windowStart: windowStart.toISOString(),
      windowEnd: windowEnd.toISOString(),
      brand: { name: agency.name || 'Your Brokerage', logoUrl: agency.logo_url, brandColor: agency.brand_color, accentColor: agency.accent_color },
      finance: { statement: finance, windowLabel: 'today (ET)' },
    })
    if (!SEND_QUIET_HOURS && Object.values(activity).every((items) => items.length === 0)) continue
    agencySummaries.push({
      name: agency.name || 'Your Brokerage',
      listings: activity.newListings.length + activity.publishedListings.length + activity.editedListings.length,
      leads: activity.buyerLeads.length,
      ndas: activity.ndaSignings.length + activity.ndaRequests.length,
      intakes: activity.sellerIntakes.length,
      revenue: activity.sellerIntakes.filter((row) => row.status === 'paid' || row.status === 'active').reduce((sum, row) => sum + (Number(row.amount_cents) || 0), 0) / 100,
      commissions: activity.commissions.reduce((sum, row) => sum + (Number(row.amount) || 0), 0),
    })
    for (const recipient of optedIn) {
      const result = await sendEmail({ to: recipient.email, subject: rendered.subject, html: rendered.html, kind: 'hourly_digest', fromName: agency.name || 'Your Brokerage', meta: { agency_id: agency.id, digest_window_start: windowStart.toISOString(), digest_window_end: windowEnd.toISOString() } })
      result.ok ? report.sent++ : report.failed++
      await db.from('app_notifications').insert({ agency_id: agency.id, profile_id: recipient.id, title: 'Activity digest ready', body: rendered.subject, kind: 'info', link: '/dashboard' }).then(() => undefined)
      await pause(125)
    }
  }

  const platformActivity = await collectActivity(db, windowStart.toISOString())
  const platformFinance = buildFinanceStatement(await collectFinance(db, financeSince))
  const platformDigest = renderHourlyDigest({
    agencyName: PLATFORM_NAME,
    activity: platformActivity,
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
    platformRollup: true,
    brand: { name: PLATFORM_NAME },
    agencySummaries,
    finance: { statement: platformFinance, windowLabel: 'today (ET)' },
  })
  const platformResult = await sendEmail({ to: BOSS_EMAIL, subject: platformDigest.subject, html: platformDigest.html, kind: 'hourly_digest', fromName: PLATFORM_NAME, meta: { platform_rollup: true, digest_window_start: windowStart.toISOString(), digest_window_end: windowEnd.toISOString() } })
  platformResult.ok ? report.sent++ : report.failed++

  return NextResponse.json({ ok: report.failed === 0, ...report, windowStart: windowStart.toISOString(), windowEnd: windowEnd.toISOString() })
}

export async function GET(req: Request) { return POST(req) }

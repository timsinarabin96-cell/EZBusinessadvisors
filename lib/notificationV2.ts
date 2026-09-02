import type { FinanceStatement } from '@/lib/digestFinance'

export type DigestRow = Record<string, unknown> & { agency_id?: string | null; listings?: { agency_id?: string | null } | Array<{ agency_id?: string | null }> | null }

export type DigestActivity = {
  newListings: DigestRow[]
  publishedListings: DigestRow[]
  editedListings: DigestRow[]
  buyerLeads: DigestRow[]
  ndaSignings: DigestRow[]
  ndaRequests: DigestRow[]
  sellerIntakes: DigestRow[]
  deals: DigestRow[]
  offers: DigestRow[]
  lois: DigestRow[]
  milestones: DigestRow[]
  appointments: DigestRow[]
  calls: DigestRow[]
  commissions: DigestRow[]
  agentActivity: DigestRow[]
}

export const EMPTY_DIGEST_ACTIVITY: DigestActivity = {
  newListings: [], publishedListings: [], editedListings: [], buyerLeads: [], ndaSignings: [], ndaRequests: [],
  sellerIntakes: [], deals: [], offers: [], lois: [], milestones: [], appointments: [], calls: [], commissions: [], agentActivity: [],
}

/** Agency brand surface used by the premium email header. */
export interface DigestBrand {
  name: string
  logoUrl?: string | null
  brandColor?: string | null
  accentColor?: string | null
}

/** One row of the platform admin's per-agency comparison table. */
export interface AgencySummaryRow {
  name: string
  listings: number
  leads: number
  ndas: number
  intakes: number
  revenue: number
  commissions: number
}

const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] || character))
const money = (value: unknown) => `$${Math.round(Number(value) || 0).toLocaleString()}`
const time = (value: unknown) => value ? new Date(String(value)).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }) : '—'
const listingName = (row: DigestRow) => {
  const listing = Array.isArray(row.listings) ? row.listings[0] : row.listings
  return esc(row.business_name || row.title || (listing as Record<string, unknown> | null)?.business_name || 'Untitled')
}

export function rowAgencyId(row: DigestRow): string | null {
  if (row.agency_id) return row.agency_id
  const listing = Array.isArray(row.listings) ? row.listings[0] : row.listings
  return listing?.agency_id || null
}

export function scopeDigestActivity(activity: DigestActivity, agencyId: string): DigestActivity {
  return Object.fromEntries(Object.entries(activity).map(([key, rows]) => [key, rows.filter((row) => rowAgencyId(row) === agencyId)])) as DigestActivity
}

export function shouldSendHourlyDigest(agencyEnabled: boolean | null | undefined, profileEnabled: boolean | null | undefined): boolean {
  return agencyEnabled !== false && profileEnabled !== false
}

export function digestActivityCount(activity: DigestActivity): number {
  return Object.values(activity).reduce((total, rows) => total + rows.length, 0)
}

// ---------------------------------------------------------------------------
// Premium email design system — "billion-dollar" executive brief.
// Email-safe: tables + inline styles only. No JS, no external assets, ~700px.
// Palette: ink navy #0d1321 · gold #c9a84c · ivory #f7f4ee · paper #ffffff.
// ---------------------------------------------------------------------------

const FONT_HEAD = `Georgia,'Times New Roman',serif`
const FONT_BODY = `-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif`

const escHead = (value: unknown) => esc(value)

/** Monogram tile — gold serif initial on navy. Always renders (no broken image). */
function monogram(name: string, accent: string): string {
  const initial = (String(name || 'C').trim().charAt(0) || 'C').toUpperCase()
  return `<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="width:52px;height:52px;background:${accent};border-radius:12px;text-align:center;vertical-align:middle"><span style="font:700 26px/1 ${FONT_HEAD};color:#0d1321">${esc(initial)}</span></td></tr></table>`
}

/** KPI stat cell. */
function kpi(label: string, value: string, sub?: string): string {
  return `<td style="padding:16px 18px;vertical-align:top;border-right:1px solid #efe9dd"><div style="font:11px/1.2 ${FONT_BODY};letter-spacing:.14em;text-transform:uppercase;color:#8b7d5c;margin-bottom:8px">${escHead(label)}</div><div style="font:700 26px/1.05 ${FONT_HEAD};color:#0d1321">${value}</div>${sub ? `<div style="font:12px/1.3 ${FONT_BODY};color:#8a8f98;margin-top:5px">${esc(sub)}</div>` : ''}</td>`
}

/** Email-safe horizontal bar row (pure tables). */
function barRow(label: string, count: number, max: number, accent: string): string {
  const pct = max > 0 ? Math.max(2, Math.round((count / max) * 100)) : 0
  return `<tr><td style="padding:5px 0;vertical-align:middle"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    <td style="width:34%;font:600 12px/1 ${FONT_BODY};color:#3c4350;padding-right:12px">${escHead(label)}</td>
    <td style="width:46%;padding-right:14px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="background:#ece7da;border-radius:4px;height:8px;font-size:0;line-height:0"><table role="presentation" width="${pct}%" cellpadding="0" cellspacing="0"><tr><td style="background:${accent};border-radius:4px;height:8px;font-size:0;line-height:0"></td></tr></table></td>
    </tr></table></td>
    <td style="width:20%;text-align:right;font:700 13px/1 ${FONT_BODY};color:#0d1321">${count}</td>
  </tr></table></td></tr>`
}

/** Section shell: kicker + serif title + count chip, hairline rule. */
function section(title: string, rows: DigestRow[], render: (row: DigestRow) => string): string {
  if (!rows.length) return ''
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 30px"><tr><td style="padding:0 0 10px;border-bottom:1px solid #e7e0d2"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    <td style="font:700 15px/1.3 ${FONT_HEAD};color:#0d1321">${escHead(title)}</td>
    <td style="text-align:right"><span style="display:inline-block;background:#f3e9c8;color:#8a6d1a;font:700 11px/1 ${FONT_BODY};padding:4px 10px;border-radius:999px">${rows.length}</span></td>
  </tr></table></td></tr>
  <tr><td style="padding:0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows.map((row) => `<tr><td style="padding:11px 2px;border-bottom:1px solid #f2eee5;font:13.5px/1.5 ${FONT_BODY};color:#343a46">${render(row)}</td></tr>`).join('')}</table></td></tr></table>`
}

function linkify(value: unknown): string {
  const text = String(value ?? '')
  if (/^[\d().\-\s+]{7,}$/.test(text.trim())) {
    return `<a href="tel:${esc(text.replace(/[^+\d]/g, ''))}" style="color:#0d1321;text-decoration:none;font-weight:600">${esc(text.trim())}</a>`
  }
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text.trim())) {
    return `<a href="mailto:${esc(text.trim())}" style="color:#0d1321;text-decoration:none;font-weight:600">${esc(text.trim())}</a>`
  }
  return esc(text)
}

function agentTile(name: string, accent: string): string {
  const initial = (String(name || 'A').trim().charAt(0) || 'A').toUpperCase()
  return `<span style="display:inline-block;width:26px;height:26px;line-height:26px;text-align:center;background:${accent};color:#0d1321;border-radius:50%;font:700 12px/26px ${FONT_HEAD};margin-right:8px">${esc(initial)}</span>`
}

/** P&L statement block — premium revenue/expense/net lines (email-safe tables). */
const fmtUsd = (value: number) =>
  '$' + value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function plRows(lines: Array<{ label: string; amount: number }>, accent: string, emptyText: string): string {
  if (!lines.length) {
    return `<tr><td style="padding:9px 2px;border-bottom:1px solid #f2eee5;font:12.5px/1.4 ${FONT_BODY};color:#9aa1ad;font-style:italic">${escHead(emptyText)}</td></tr>`
  }
  return lines.map((line) => `<tr><td style="padding:8px 2px;border-bottom:1px solid #f2eee5;font:13px/1.4 ${FONT_BODY};color:#3c4350">${escHead(line.label)}</td><td style="padding:8px 2px;border-bottom:1px solid #f2eee5;text-align:right;font:600 13px/1.4 ${FONT_BODY};color:#0d1321">${fmtUsd(line.amount)}</td></tr>`).join('')
}

function financeStatementSection(stmt: FinanceStatement, accent: string, windowLabel: string): string {
  const quiet = stmt.activityCount === 0 && stmt.revenueTotal === 0 && stmt.expenseTotal === 0
  const netColor = stmt.net >= 0 ? '#1e7e34' : '#b42318'
  const rows = quiet
    ? `<tr><td style="padding:18px 4px;font:13px/1.5 ${FONT_BODY};color:#8a8f98">No revenue or expenses recorded in the ${escHead(windowLabel)} window — net $0.00. Every paid order, subscription, commission, expense, and contractor payout will appear here.</td></tr>`
    : `${plRows(stmt.revenueLines, accent, 'No revenue recorded in this window')}
      <tr><td style="padding:8px 2px;font:11px/1 ${FONT_BODY};letter-spacing:.12em;text-transform:uppercase;color:#8b7d5c">Total revenue</td><td style="padding:8px 2px;text-align:right;font:700 14px/1 ${FONT_HEAD};color:#0d1321">${fmtUsd(stmt.revenueTotal)}</td></tr>
      ${plRows(stmt.expenseLines, accent, 'No expenses recorded in this window')}
      <tr><td style="padding:8px 2px;font:11px/1 ${FONT_BODY};letter-spacing:.12em;text-transform:uppercase;color:#8b7d5c">Total expenses</td><td style="padding:8px 2px;text-align:right;font:700 14px/1 ${FONT_HEAD};color:#0d1321">${fmtUsd(stmt.expenseTotal)}</td></tr>`
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 30px">
  <tr><td style="background:#0d1321;border-radius:14px 14px 0 0;padding:18px 20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    <td style="font:700 16px/1.3 ${FONT_HEAD};color:#ffffff">Profit &amp; Loss</td>
    <td style="text-align:right"><span style="font:10px/1 ${FONT_BODY};letter-spacing:.14em;text-transform:uppercase;color:${accent};border:1px solid ${accent};padding:4px 10px;border-radius:999px">${escHead(windowLabel)}</span></td>
  </tr></table></td></tr>
  <tr><td style="border:1px solid #e7e0d2;border-top:none;border-radius:0 0 14px 14px;padding:14px 20px 18px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}
    <tr><td style="padding:14px 2px 2px;border-top:2px solid #0d1321"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="font:700 13px/1 ${FONT_BODY};letter-spacing:.1em;text-transform:uppercase;color:#0d1321">Net income</td>
      <td style="text-align:right;font:700 20px/1 ${FONT_HEAD};color:${netColor}">${fmtUsd(stmt.net)}</td>
    </tr></table></td></tr>
  </table></td></tr></table>`
}

export function renderHourlyDigest(input: {
  agencyName: string
  activity: DigestActivity
  windowStart: string
  windowEnd: string
  platformRollup?: boolean
  brand?: DigestBrand
  agencySummaries?: AgencySummaryRow[]
  finance?: { statement: FinanceStatement; windowLabel: string } | null
}): { subject: string; html: string } {
  const { agencyName, activity } = input
  const platform = !!input.platformRollup
  const count = digestActivityCount(activity)
  const brand: DigestBrand = input.brand || { name: agencyName }
  const ink = '#0d1321'
  const accent = brand.accentColor || '#c9a84c'
  const logoUrl = brand.logoUrl && /^https:\/\//i.test(String(brand.logoUrl)) ? String(brand.logoUrl) : null

  // KPIs
  const totalRevenue = activity.sellerIntakes.filter((row) => row.status === 'paid' || row.status === 'active').reduce((sum, row) => sum + (Number(row.amount_cents) || 0), 0) / 100
  const totalCommission = activity.commissions.reduce((sum, row) => sum + (Number(row.amount) || 0), 0)
  const newLeads = activity.buyerLeads.length
  const ndaCount = activity.ndaSignings.length + activity.ndaRequests.length
  const offerCount = activity.deals.length + activity.offers.length + activity.lois.length
  const liveListings = activity.newListings.length + activity.publishedListings.length + activity.editedListings.length

  // Body sections (agency + platform share these)
  const bodySections = [
    section('Listing activity', [...activity.newListings, ...activity.publishedListings, ...activity.editedListings], (row) => `<strong style="color:#0d1321">${listingName(row)}</strong> &nbsp;<span style="font:11px/1 ${FONT_BODY};color:#8a6d1a;background:#f3e9c8;padding:2px 8px;border-radius:999px;text-transform:capitalize">${esc(row.status || 'updated')}</span>${row.asking_price ? ` &nbsp;<strong style="color:#8a6d1a">${money(row.asking_price)}</strong>` : ''}<div style="font:11.5px/1.4 ${FONT_BODY};color:#8a8f98;margin-top:3px">${time(row.created_at || row.updated_at)}</div>`),
    section('Buyer leads & inquiries', activity.buyerLeads, (row) => `<strong style="color:#0d1321">${esc(row.full_name || row.name || 'Buyer')}</strong>${row.phone ? ` &nbsp;·&nbsp; ${linkify(row.phone)}` : ''}${row.email ? ` &nbsp;·&nbsp; ${linkify(row.email)}` : ''}<div style="font:11.5px/1.4 ${FONT_BODY};color:#8a8f98;margin-top:3px">${esc(row.target_industry || row.message || 'General inquiry')} · ${time(row.created_at)}</div>`),
    section('NDA & data-room activity', [...activity.ndaSignings, ...activity.ndaRequests], (row) => `<strong style="color:#0d1321">${esc(row.buyer_name || row.requester_name || row.requester_email || 'Buyer')}</strong> · ${listingName(row)}<div style="font:11.5px/1.4 ${FONT_BODY};color:#8a8f98;margin-top:3px"><span style="text-transform:capitalize">${esc(row.status || 'signed')}</span> · ${time(row.signed_at || row.nda_signed_at || row.created_at)}</div>`),
    section('Seller intakes', activity.sellerIntakes, (row) => `<strong style="color:#0d1321">${listingName(row)}</strong>${row.amount_cents ? ` &nbsp;<strong style="color:#8a6d1a">${money(Number(row.amount_cents) / 100)}</strong>` : ''}<div style="font:11.5px/1.4 ${FONT_BODY};color:#8a8f98;margin-top:3px"><span style="text-transform:capitalize">${esc(row.status || 'new')}</span> · ${time(row.created_at)}</div>`),
    section('Deals, offers & LOIs', [...activity.deals, ...activity.offers, ...activity.lois], (row) => `<strong style="color:#0d1321">${listingName(row)}</strong>${row.purchase_price ? ` &nbsp;<strong style="color:#8a6d1a">${money(row.purchase_price)}</strong>` : ''}<div style="font:11.5px/1.4 ${FONT_BODY};color:#8a8f98;margin-top:3px"><span style="text-transform:capitalize">${esc(row.status || 'updated')}</span> · ${time(row.created_at || row.updated_at)}</div>`),
    section('Milestones & escrow', activity.milestones, (row) => `<strong style="color:#0d1321">${esc(row.title || row.name || 'Milestone')}</strong><div style="font:11.5px/1.4 ${FONT_BODY};color:#8a8f98;margin-top:3px"><span style="text-transform:capitalize">${esc(row.status || 'updated')}</span> · ${time(row.completed_at || row.updated_at || row.created_at)}</div>`),
    section('Calls & appointments', [...activity.appointments, ...activity.calls], (row) => `<strong style="color:#0d1321">${esc(row.title || row.purpose || row.appointment_type || 'Client activity')}</strong><div style="font:11.5px/1.4 ${FONT_BODY};color:#8a8f98;margin-top:3px"><span style="text-transform:capitalize">${esc(row.status || '')}</span> · ${time(row.starts_at || row.started_at || row.created_at)}</div>`),
    section('Commissions & revenue', activity.commissions, (row) => `<strong style="color:#8a6d1a">${money(row.amount)}</strong> · <span style="text-transform:capitalize">${esc(row.status || 'recorded')}</span><div style="font:11.5px/1.4 ${FONT_BODY};color:#8a8f98;margin-top:3px">${time(row.created_at)}</div>`),
    section('Agent activity', activity.agentActivity, (row) => {
      const action = String(row.action || row.event_type || row.kind || 'Activity')
      const agentName = String(row.agent_name || row.broker_name || row.actor_name || row.performed_by || '').trim()
      return `${agentName ? agentTile(agentName, accent) : ''}<strong style="color:#0d1321">${esc(action)}</strong><div style="font:11.5px/1.4 ${FONT_BODY};color:#8a8f98;margin-top:3px">${esc(row.summary || row.description || '')}${agentName ? ` · ${esc(agentName)}` : ''} · ${time(row.created_at)}</div>`
    }),
  ].join('')

  // Platform admin: per-agency comparison chart.
  let agencyChart = ''
  if (platform && input.agencySummaries?.length) {
    const summaries = input.agencySummaries
    const maxListings = Math.max(1, ...summaries.map((s) => s.listings))
    const rowsHtml = summaries.map((s) => barRow(s.name, s.listings, maxListings, accent)).join('')
    agencyChart = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 30px"><tr><td style="padding:0 0 10px;border-bottom:1px solid #e7e0d2"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="font:700 15px/1.3 ${FONT_HEAD};color:#0d1321">Activity by agency</td><td style="text-align:right;font:11px/1 ${FONT_BODY};letter-spacing:.1em;text-transform:uppercase;color:#8b7d5c">listings this hour</td></tr></table></td></tr><tr><td style="padding:12px 0 0">${rowsHtml}</td></tr></table>`
  }

  // Activity mix bars (leads / listings / NDAs / offers / intakes).
  const mixMax = Math.max(1, newLeads, liveListings, ndaCount, offerCount, activity.sellerIntakes.length)
  const mixChart = count === 0 ? '' : `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 30px"><tr><td style="padding:0 0 10px;border-bottom:1px solid #e7e0d2"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="font:700 15px/1.3 ${FONT_HEAD};color:#0d1321">Deal-desk mix</td><td style="text-align:right;font:11px/1 ${FONT_BODY};letter-spacing:.1em;text-transform:uppercase;color:#8b7d5c">this hour</td></tr></table></td></tr><tr><td style="padding:12px 0 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${barRow('Buyer leads', newLeads, mixMax, accent)}${barRow('Listing activity', liveListings, mixMax, accent)}${barRow('NDA & data-room', ndaCount, mixMax, accent)}${barRow('Offers / LOIs', offerCount, mixMax, accent)}${barRow('Seller intakes', activity.sellerIntakes.length, mixMax, accent)}</table></td></tr></table>`

  const kpiCells = [
    kpi('Activity updates', String(count)),
    kpi('New revenue', money(totalRevenue)),
    kpi('Commissions', money(totalCommission)),
    kpi('Buyer leads', String(newLeads), `${ndaCount} NDA · ${offerCount} offers`),
  ].join('')

  const quiet = count === 0
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:34px 24px;text-align:center;background:#fbf9f3;border:1px solid #e7e0d2;border-radius:14px"><div style="font:700 40px/1 ${FONT_HEAD};color:#c9a84c">✓</div><div style="font:700 17px/1.4 ${FONT_HEAD};color:#0d1321;margin-top:10px">A quiet hour on the desk</div><div style="font:13px/1.5 ${FONT_BODY};color:#8a8f98;margin-top:6px">No new listings, leads, NDAs, offers, or calls this window.<br/>Everything is operating normally.</div></td></tr></table>`
    : ''

  const financeHtml = input.finance
    ? financeStatementSection(input.finance.statement, accent, input.finance.windowLabel)
    : ''

  const subject = platform
    ? `🛰️ Platform Admin Update — hourly · all agencies (${count})`
    : `📊 ${agencyName} — Hourly Deal Desk Digest (${count})`

  const headerBrand = logoUrl
    ? `<img src="${esc(logoUrl)}" alt="" width="46" height="46" style="display:block;border-radius:10px" />`
    : monogram(brand.name, accent)

  const html = `<!doctype html><html><body style="margin:0;background:#efece4;padding:0">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#efece4"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:700px;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 18px 50px rgba(13,19,33,.12)">
  <!-- Masthead -->
  <tr><td style="background:${ink};padding:26px 34px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="vertical-align:middle">${headerBrand}</td>
      <td style="vertical-align:middle;padding-left:16px">
        <div style="font:11px/1 ${FONT_BODY};letter-spacing:.22em;text-transform:uppercase;color:${accent};margin-bottom:6px">${platform ? 'Concord Deal Platform' : escHead(brand.name)}</div>
        <div style="font:700 24px/1.15 ${FONT_HEAD};color:#ffffff">${platform ? 'Platform Admin Update' : 'Hourly Deal Desk Digest'}</div>
        <div style="font:12px/1.5 ${FONT_BODY};color:#9aa3b5;margin-top:6px">${time(input.windowStart)} – ${time(input.windowEnd)} ET${platform ? ' · all agencies' : ''}</div>
      </td>
      <td style="text-align:right;vertical-align:middle"><div style="display:inline-block;border:1px solid ${accent};color:${accent};font:700 10px/1 ${FONT_BODY};letter-spacing:.16em;text-transform:uppercase;padding:7px 12px;border-radius:999px">Executive Brief</div></td>
    </tr></table>
  </td></tr>
  <!-- KPI band -->
  <tr><td style="background:#fbf9f3;border-bottom:1px solid #efe9dd;border-top:1px solid rgba(201,168,76,.35)"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${kpiCells}</tr></table></td></tr>
  <!-- Body -->
  <tr><td style="padding:30px 34px">
    ${quiet}
    ${financeHtml}
    ${mixChart}
    ${agencyChart}
    ${bodySections}
  </td></tr>
  <!-- Footer -->
  <tr><td style="background:#f7f4ee;padding:20px 34px;border-top:1px solid #e7e0d2">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="font:11.5px/1.6 ${FONT_BODY};color:#8a8f98">Generated ${time(new Date().toISOString())} ET · One complete ${platform ? 'platform' : 'agency'} summary per hour.<br/>Immediate buyer, NDA, offer, and 🚨 critical alerts are delivered separately.</td>
      <td style="text-align:right;font:11px/1.6 ${FONT_BODY};color:#8a8f98;white-space:nowrap">${platform ? 'Concord Deal Platform' : escHead(brand.name)}<br/>Adjust preferences in Settings → Notifications</td>
    </tr></table>
  </td></tr>
</table>
</td></tr></table>
</body></html>`

  return { subject, html }
}

export function resolveImmediateProfileIds(listingAgentId: string | null | undefined, members: Array<{ profile_id: string; role?: string | null; is_owner?: boolean | null }>, includeOwners: boolean): string[] {
  const ids = new Set<string>()
  if (listingAgentId) ids.add(listingAgentId)
  if (includeOwners) members.filter((member) => member.is_owner || member.role === 'admin' || member.role === 'owner').forEach((member) => ids.add(member.profile_id))
  return [...ids]
}

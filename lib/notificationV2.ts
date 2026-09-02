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

function section(title: string, rows: DigestRow[], render: (row: DigestRow) => string): string {
  if (!rows.length) return ''
  return `<section style="margin:0 0 22px"><h2 style="font:700 16px/1.3 Arial,sans-serif;color:#172033;margin:0 0 10px">${title} <span style="color:#8b6b18">(${rows.length})</span></h2><div style="border:1px solid #e6e2d8;border-radius:12px;overflow:hidden">${rows.map((row) => `<div style="padding:11px 14px;border-bottom:1px solid #eeeae1;font:14px/1.45 Arial,sans-serif;color:#343a46">${render(row)}</div>`).join('')}</div></section>`
}

export function renderHourlyDigest(input: { agencyName: string; activity: DigestActivity; windowStart: string; windowEnd: string; platformRollup?: boolean }): { subject: string; html: string } {
  const { agencyName, activity } = input
  const count = digestActivityCount(activity)
  const totalRevenue = activity.sellerIntakes.filter((row) => row.status === 'paid' || row.status === 'active').reduce((sum, row) => sum + (Number(row.amount_cents) || 0), 0) / 100
  const totalCommission = activity.commissions.reduce((sum, row) => sum + (Number(row.amount) || 0), 0)
  const body = [
    section('🆕 Listing activity', [...activity.newListings, ...activity.publishedListings, ...activity.editedListings], (row) => `<strong>${listingName(row)}</strong> · ${esc(row.status || 'updated')} · ${row.asking_price ? money(row.asking_price) : 'Price not set'} · ${time(row.created_at || row.updated_at)}`),
    section('🤝 Buyer leads & inquiries', activity.buyerLeads, (row) => `<strong>${esc(row.full_name || row.name || 'Buyer')}</strong>${row.phone ? ` · <a href="tel:${esc(row.phone)}">${esc(row.phone)}</a>` : ''}${row.email ? ` · ${esc(row.email)}` : ''} · ${esc(row.target_industry || row.message || 'General inquiry')} · ${time(row.created_at)}`),
    section('🛡️ NDA & data-room activity', [...activity.ndaSignings, ...activity.ndaRequests], (row) => `<strong>${esc(row.buyer_name || row.requester_name || row.requester_email || 'Buyer')}</strong> · ${listingName(row)} · ${esc(row.status || 'signed')} · ${time(row.signed_at || row.nda_signed_at || row.created_at)}`),
    section('🏷️ Seller intakes', activity.sellerIntakes, (row) => `<strong>${listingName(row)}</strong> · ${esc(row.status || 'new')} · ${row.amount_cents ? money(Number(row.amount_cents) / 100) : 'No payment'} · ${time(row.created_at)}`),
    section('💼 Deals, offers & LOIs', [...activity.deals, ...activity.offers, ...activity.lois], (row) => `<strong>${listingName(row)}</strong> · ${row.purchase_price ? money(row.purchase_price) : esc(row.status || 'updated')} · ${time(row.created_at || row.updated_at)}`),
    section('✅ Milestones & escrow', activity.milestones, (row) => `<strong>${esc(row.title || row.name || 'Milestone')}</strong> · ${esc(row.status || 'updated')} · ${time(row.completed_at || row.updated_at || row.created_at)}`),
    section('📞 Calls & appointments', [...activity.appointments, ...activity.calls], (row) => `<strong>${esc(row.title || row.purpose || row.appointment_type || 'Client activity')}</strong> · ${esc(row.status || '')} · ${time(row.starts_at || row.started_at || row.created_at)}`),
    section('💰 Commissions & revenue', activity.commissions, (row) => `<strong>${money(row.amount)}</strong> · ${esc(row.status || 'recorded')} · ${time(row.created_at)}`),
    section('👥 Agent activity', activity.agentActivity, (row) => `<strong>${esc(row.action || row.event_type || row.kind || 'Activity')}</strong> · ${esc(row.summary || row.description || '')} · ${time(row.created_at)}`),
  ].join('')
  const quiet = count === 0 ? `<div style="padding:24px;border:1px solid #d9e8df;background:#f3faf6;border-radius:14px;color:#24553b;font:600 14px/1.5 Arial,sans-serif">✓ Quiet hour — no new activity. Everything is operating normally.</div>` : ''
  const subject = `${agencyName} — Hourly activity digest (${count} ${count === 1 ? 'update' : 'updates'})`
  const html = `<!doctype html><html><body style="margin:0;background:#f4f2ed;padding:24px"><div style="max-width:720px;margin:auto;background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 10px 35px rgba(23,32,51,.08)"><header style="padding:28px 32px;background:#172033;color:#fff"><div style="font:700 12px/1 Arial,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#d8b85b">${esc(agencyName)}</div><h1 style="font:700 25px/1.2 Georgia,serif;margin:9px 0 5px">Hourly Deal Desk Digest</h1><div style="font:13px Arial,sans-serif;color:#cbd2df">${time(input.windowStart)} – ${time(input.windowEnd)} ET${input.platformRollup ? ' · All agencies' : ''}</div></header><main style="padding:28px 32px"><div style="display:flex;gap:12px;margin-bottom:24px"><div style="flex:1;padding:14px;background:#faf8f2;border-radius:12px"><b style="font:22px Georgia,serif">${count}</b><br><span style="font:12px Arial;color:#6b7280">activity updates</span></div><div style="flex:1;padding:14px;background:#faf8f2;border-radius:12px"><b style="font:22px Georgia,serif">${money(totalRevenue)}</b><br><span style="font:12px Arial;color:#6b7280">revenue</span></div><div style="flex:1;padding:14px;background:#faf8f2;border-radius:12px"><b style="font:22px Georgia,serif">${money(totalCommission)}</b><br><span style="font:12px Arial;color:#6b7280">commissions</span></div></div>${quiet}${body}</main><footer style="padding:18px 32px;background:#faf8f2;color:#777;font:12px/1.5 Arial,sans-serif">One complete hourly summary from ${esc(agencyName)}. Immediate buyer, NDA, offer, and critical alerts are delivered separately.</footer></div></body></html>`
  return { subject, html }
}

export function resolveImmediateProfileIds(listingAgentId: string | null | undefined, members: Array<{ profile_id: string; role?: string | null; is_owner?: boolean | null }>, includeOwners: boolean): string[] {
  const ids = new Set<string>()
  if (listingAgentId) ids.add(listingAgentId)
  if (includeOwners) members.filter((member) => member.is_owner || member.role === 'admin' || member.role === 'owner').forEach((member) => ids.add(member.profile_id))
  return [...ids]
}

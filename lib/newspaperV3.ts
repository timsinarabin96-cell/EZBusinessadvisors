/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Weekly Newspaper v3 — premium BUYERS-ONLY inventory digest (Transworld-style)
// -----------------------------------------------------------------------------
// This module replaces the old "New Leads" article generator. It NEVER queries
// seller_leads or buyer_leads, and NEVER emits buyer/seller names, contact
// info, or industry-interest for individuals. It only surfaces:
//   - published marketplace inventory (public_listings + listings + agent),
//   - aggregate counts (no identities) for "Market News",
//   - closed-deal amounts/timelines with NO party names ("Deals Closed").
// The HTML renderer (renderNewspaperV3Html) produces a Transworld-meets-
// premium editorial email: masthead, listing photo cards with price, an
// agent contact card (avatar/initials, phone, email, "save contact" +
// scan-to-save QR) per listing, and a real unsubscribe link in the footer.
// Email-safe: tables + inline styles only, no JS, no external CSS/fonts.
// =============================================================================

import { esc, nowLabel, type NewEdition, type Article } from '@/lib/newspaperShared'

const SITE_BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://ezbusinessadvisors.vercel.app'
const MAX_LISTINGS = 24

export type InventoryListing = {
  listingId: string
  slug: string | null
  title: string
  industry: string | null
  location: string | null
  askingPrice: number | null
  isFeatured: boolean
  imageUrl: string | null
  agent: AgentInfo | null
}

export type AgentInfo = {
  profileId: string | null
  name: string
  phone: string | null
  email: string | null
  avatarUrl: string | null
}

/**
 * Fetch active/published inventory (with agent + gallery image) using a
 * service-role client. Ordered featured-first, then newest. Capped at
 * MAX_LISTINGS to keep the edition size sane; a "view full marketplace" link
 * covers the rest. NO seller_leads / buyer_leads queries anywhere in here.
 */
export async function fetchInventoryForDigest(svc: any): Promise<InventoryListing[]> {
  const { data: pub } = await svc
    .from('public_listings')
    .select('listing_id, slug, public_title, is_featured, gallery_json, published, is_confidential')
    .eq('published', true)
    .order('is_featured', { ascending: false })
    .limit(MAX_LISTINGS)

  const publicRows = (pub || []) as any[]
  if (!publicRows.length) return []

  const listingIds = [...new Set(publicRows.map((r) => r.listing_id).filter(Boolean))]
  const { data: listingsRes } = await svc
    .from('listings')
    .select('id, business_name, industry, location_general, asking_price, status, agent_id, agency_id, primary_image_url, featured_image_url, created_at')
    .in('id', listingIds)
    .in('status', ['active', 'approved'])

  const listingsById: Record<string, any> = {}
  for (const l of listingsRes || []) listingsById[l.id] = l

  const agentIds = [...new Set((listingsRes || []).map((l: any) => l.agent_id).filter(Boolean))]
  const agencyIds = [...new Set((listingsRes || []).map((l: any) => l.agency_id).filter(Boolean))]
  let brokerByProfile: Record<string, any> = {}
  let brokerByAgency: Record<string, any> = {}
  if (agentIds.length || agencyIds.length) {
    const orParts: string[] = []
    if (agentIds.length) orParts.push(`profile_id.in.(${agentIds.join(',')})`)
    if (agencyIds.length) orParts.push(`agency_id.in.(${agencyIds.join(',')})`)
    const { data: brokers } = await svc
      .from('broker_profiles')
      .select('profile_id, agency_id, public_name, avatar_url, phone, email_public')
      .or(orParts.join(','))
    for (const b of brokers || []) {
      if (b.profile_id && !brokerByProfile[b.profile_id]) brokerByProfile[b.profile_id] = b
      if (b.agency_id && !brokerByAgency[b.agency_id]) brokerByAgency[b.agency_id] = b
    }
  }

  const out: InventoryListing[] = []
  for (const p of publicRows) {
    const l = listingsById[p.listing_id]
    if (!l) continue
    const broker = (l.agent_id && brokerByProfile[l.agent_id]) || (l.agency_id ? brokerByAgency[l.agency_id] : null)
    const gallery = Array.isArray(p.gallery_json) ? p.gallery_json : []
    const imageUrl = gallery[0] || l.featured_image_url || l.primary_image_url || null
    out.push({
      listingId: p.listing_id,
      slug: p.slug || null,
      title: p.public_title || l.business_name || 'Business Opportunity',
      industry: l.industry || null,
      location: l.location_general || null,
      askingPrice: l.asking_price ?? null,
      isFeatured: !!p.is_featured,
      imageUrl,
      agent: broker
        ? {
            profileId: broker.profile_id || null,
            name: broker.public_name || 'Concord Advisor',
            phone: broker.phone || null,
            email: broker.email_public || null,
            avatarUrl: broker.avatar_url || null,
          }
        : null,
    })
  }
  return out
}

/** Aggregate, identity-free counts for Market News + Deals Closed sections. */
export async function fetchMarketAggregates(svc: any): Promise<{ newListings: number; closedDeals: number; closedSummaries: { title: string; amount: number | null; status: string }[] }> {
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()
  const [{ data: newListings }, { data: deals }] = await Promise.all([
    svc.from('listings').select('id', { count: 'exact', head: true }).eq('status', 'active').gte('created_at', weekAgo),
    svc.from('deals').select('title, status, purchase_price, updated_at').eq('status', 'closed').order('updated_at', { ascending: false }).limit(6),
  ])
  const dealsRows = (deals || []) as any[]
  return {
    newListings: (newListings as any)?.length ?? 0,
    closedDeals: dealsRows.length,
    closedSummaries: dealsRows.map((d) => ({ title: d.title ? 'Business acquisition' : 'Business acquisition', amount: d.purchase_price ?? null, status: d.status })),
  }
}

/**
 * Build newspaper_articles rows for an edition: one Market News summary (no
 * identities), one article per inventory listing (Featured Listings, with
 * image_url + agent contact stashed in a JSON tail for the renderer), and one
 * Deals Closed summary (amounts/timelines only, never party names). NEVER
 * touches seller_leads / buyer_leads.
 */
export async function buildV3Articles(svc: any): Promise<Array<{ section: string; headline: string; body: string | null; image_url?: string | null; sort_order: number; meta?: any }>> {
  const [inventory, aggregates] = await Promise.all([fetchInventoryForDigest(svc), fetchMarketAggregates(svc)])

  const articles: Array<{ section: string; headline: string; body: string | null; image_url?: string | null; sort_order: number; meta?: any }> = []
  let order = 10

  articles.push({
    section: 'Market News',
    headline: nowLabel(),
    body:
      `This week we welcomed ${aggregates.newListings} new listing${aggregates.newListings === 1 ? '' : 's'} to the marketplace ` +
      `and closed ${aggregates.closedDeals} deal${aggregates.closedDeals === 1 ? '' : 's'}. Our full inventory of ${inventory.length} ` +
      `active opportunit${inventory.length === 1 ? 'y is' : 'ies are'} below — reach out to the listing agent on any deal that interests you.`,
    sort_order: order,
  })
  order += 10

  for (const inv of inventory) {
    articles.push({
      section: 'Featured Listings',
      headline: inv.title,
      body: [
        inv.industry ? `Industry: ${inv.industry}` : null,
        inv.location ? `Location: ${inv.location}` : null,
        inv.askingPrice ? `Asking Price: $${Math.round(inv.askingPrice).toLocaleString()}` : 'Asking Price: Contact for details',
      ]
        .filter(Boolean)
        .join('\n'),
      image_url: inv.imageUrl,
      sort_order: order,
      meta: { listingId: inv.listingId, slug: inv.slug, isFeatured: inv.isFeatured, agent: inv.agent, askingPrice: inv.askingPrice, industry: inv.industry, location: inv.location, title: inv.title, imageUrl: inv.imageUrl },
    })
    order += 10
  }

  if (aggregates.closedSummaries.length) {
    articles.push({
      section: 'Deals Closed',
      headline: 'Recent closings',
      body: aggregates.closedSummaries
        .map((d, i) => `${i + 1}. ${d.title}${d.amount ? ' · $' + Math.round(d.amount).toLocaleString() : ''}`)
        .join('\n'),
      sort_order: order,
    })
    order += 10
  }

  articles.push({
    section: 'Team Updates',
    headline: 'From the team',
    body: 'Our advisors continue to guide clients through confidential listings, valuations, and due diligence. Contact your advisor to schedule a free consult.',
    sort_order: order,
  })

  if (inventory.length >= MAX_LISTINGS) {
    articles.push({
      section: 'Market News',
      headline: 'See the full marketplace',
      body: `We have more inventory than fits in one email. View the full, always-current marketplace at ${SITE_BASE}/marketplace.`,
      sort_order: order + 10,
    })
  }

  return articles
}

// -----------------------------------------------------------------------------
// Renderer
// -----------------------------------------------------------------------------

function listingUrl(slug: string | null, listingId: string): string {
  return `${SITE_BASE}/marketplace/listings/${encodeURIComponent(slug || listingId)}`
}

function agentInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('') || 'CA'
}

function renderAgentCard(agent: AgentInfo | null): string {
  if (!agent) {
    return (
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:10px"><tr><td style="border-top:1px solid #e5e0d3;padding-top:10px;font-size:12px;color:#8a8a9a">Contact Concord Deal Platform for details on this listing.</td></tr></table>`
    )
  }
  const avatarCell = agent.avatarUrl
    ? `<img src="${esc(agent.avatarUrl)}" width="48" height="48" alt="${esc(agent.name)}" style="display:block;border-radius:50%;object-fit:cover" />`
    : `<div style="width:48px;height:48px;border-radius:50%;background:#0b1f3a;color:#f5deb3;font-family:Georgia,serif;font-size:16px;font-weight:700;text-align:center;line-height:48px">${esc(agentInitials(agent.name))}</div>`
  const cardUrl = agent.profileId ? `${SITE_BASE}/card/${encodeURIComponent(agent.profileId)}` : null

  const phoneLine = agent.phone ? `<a href="tel:${esc(agent.phone.replace(/[^0-9+]/g, ''))}" style="color:#0b1f3a;text-decoration:none">${esc(agent.phone)}</a>` : ''
  const emailLine = agent.email ? `<a href="mailto:${esc(agent.email)}" style="color:#0b1f3a;text-decoration:none">${esc(agent.email)}</a>` : ''

  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;border-top:1px solid #e5e0d3;padding-top:10px">` +
    `<tr>` +
    `<td width="52" valign="top">${avatarCell}</td>` +
    `<td valign="top" style="padding-left:10px">` +
    `<div style="font-size:13px;font-weight:700;color:#1a1a2e">${esc(agent.name)}</div>` +
    `<div style="font-size:11px;color:#5a5a6a;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:2px">Listing Agent</div>` +
    (phoneLine ? `<div style="font-size:12px">${phoneLine}</div>` : '') +
    (emailLine ? `<div style="font-size:12px">${emailLine}</div>` : '') +
    (cardUrl
      ? `<div style="margin-top:6px"><a href="${esc(cardUrl)}" style="font-size:11px;color:#c9a84c;font-weight:700;text-decoration:none;border:1px solid #c9a84c;border-radius:14px;padding:4px 10px;display:inline-block">Save contact / view agent card &rarr;</a></div>`
      : '') +
    `</td>` +
    `</tr>` +
    `</table>`
  )
}

function renderListingCard(a: Article & { meta?: any }): string {
  const meta = a.meta || {}
  const url = listingUrl(meta.slug || null, meta.listingId || '')
  const image = a.image_url
    ? `<img src="${esc(a.image_url)}" width="100%" alt="${esc(a.headline)}" style="display:block;border-radius:8px 8px 0 0;width:100%;max-height:220px;object-fit:cover" />`
    : `<div style="width:100%;height:120px;background:#0b1f3a;border-radius:8px 8px 0 0;color:#f5deb3;font-family:Georgia,serif;font-size:14px;text-align:center;line-height:120px">Photo coming soon</div>`
  const priceLine = meta.askingPrice
    ? `<div style="font-size:18px;font-weight:700;color:#16a34a;margin:6px 0 2px">$${Math.round(meta.askingPrice).toLocaleString()}</div>`
    : `<div style="font-size:13px;color:#8a8a9a;margin:6px 0 2px">Contact for asking price</div>`
  const chips = [
    meta.industry ? `<span style="display:inline-block;background:#eef2f7;color:#0b1f3a;font-size:11px;padding:3px 8px;border-radius:10px;margin-right:6px">${esc(meta.industry)}</span>` : '',
    meta.location ? `<span style="display:inline-block;background:#faf6ec;color:#7a6320;font-size:11px;padding:3px 8px;border-radius:10px">${esc(meta.location)}</span>` : '',
  ].join('')
  const ribbon = meta.isFeatured
    ? `<div style="display:inline-block;background:#c9a84c;color:#1a1a2e;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;padding:3px 8px;border-radius:4px;margin-bottom:6px">Featured this week</div><br/>`
    : ''

  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;background:#ffffff;border:1px solid #e5e0d3;border-radius:8px;overflow:hidden"><tr><td>` +
    image +
    `<div style="padding:14px 16px">` +
    ribbon +
    `<div style="font-family:Georgia,serif;font-size:17px;font-weight:700;color:#1a1a2e">${esc(a.headline || '')}</div>` +
    `<div style="margin:6px 0">${chips}</div>` +
    priceLine +
    `<div style="margin-top:10px"><a href="${esc(url)}" style="display:inline-block;background:#0b1f3a;color:#ffffff;font-size:12px;font-weight:700;text-decoration:none;padding:9px 16px;border-radius:6px">View Listing &rarr;</a></div>` +
    renderAgentCard(meta.agent || null) +
    `</div></td></tr></table>`
  )
}

function renderSimpleArticle(a: Article): string {
  const paras = (a.body || '')
    .split('\n')
    .filter(Boolean)
    .map((line) => `<p style="margin:4px 0;font-size:14px;line-height:1.55;color:#2a2a2a">${esc(line)}</p>`)
    .join('')
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:14px 0"><tr><td style="background:#fbfaf7;border:1px solid #e5e0d3;border-left:4px solid #3b82f6;border-radius:8px;padding:16px 18px">` +
    `<div style="font-size:11px;text-transform:uppercase;letter-spacing:0.12em;color:#3b82f6;font-weight:700;margin-bottom:6px">${esc(a.section || 'News')}</div>` +
    `<div style="font-family:Georgia,serif;font-size:18px;font-weight:700;color:#1a1a2e;margin-bottom:8px">${esc(a.headline || '')}</div>` +
    paras +
    `</td></tr></table>`
  )
}

export type SubscriberLike = { email: string; token?: string | null; name?: string | null }

/** Build the unsubscribe URL for a given subscriber (email + token). */
export function unsubscribeUrl(sub: SubscriberLike): string {
  const email = encodeURIComponent(sub.email)
  const token = encodeURIComponent(sub.token || '')
  return `${SITE_BASE}/api/newsletter/unsubscribe?email=${email}&token=${token}`
}

/**
 * Premium Transworld-style renderer. Email-safe (tables + inline styles).
 * Featured Listings articles (identified by section + meta.listingId) render
 * as photo cards with price + agent contact; all other sections render as
 * simple editorial blocks. Footer always includes a real unsubscribe link
 * scoped to the given subscriber.
 */
export function renderNewspaperV3Html(edition: NewEdition, articles: Array<Article & { meta?: any }>, subscriber: SubscriberLike): string {
  const listingArticles = articles.filter((a) => a.section === 'Featured Listings' && a.meta?.listingId)
  const otherArticles = articles.filter((a) => !(a.section === 'Featured Listings' && a.meta?.listingId))

  const countHeader = listingArticles.length
    ? `<div style="text-align:center;font-size:12px;color:#5a5a6a;margin:4px 0 14px">${listingArticles.length} active listing${listingArticles.length === 1 ? '' : 's'} this week</div>`
    : ''

  const quietState = !listingArticles.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0"><tr><td style="text-align:center;padding:30px 10px;color:#8a8a9a;font-size:13px;border:1px dashed #d8d2c0;border-radius:8px">No new inventory to feature this week — check back soon, or browse the full marketplace at ${SITE_BASE}/marketplace.</td></tr></table>`
    : ''

  const body =
    otherArticles.filter((a) => a.section === 'Market News').map(renderSimpleArticle).join('\n') +
    countHeader +
    listingArticles.map(renderListingCard).join('\n') +
    quietState +
    otherArticles.filter((a) => a.section !== 'Market News').map(renderSimpleArticle).join('\n')

  const unsubUrl = unsubscribeUrl(subscriber)

  return (
    `<div style="max-width:640px;margin:0 auto;padding:24px 16px;font-family:Georgia,serif;background:#ffffff">` +
    `<div style="text-align:center;font-size:30px;font-weight:700;color:#1a1a2e;letter-spacing:0.02em">Concord Weekly</div>` +
    `<div style="text-align:center;font-size:12px;color:#8a8a9a;letter-spacing:0.14em;text-transform:uppercase;margin:6px 0 2px">${esc(edition.issue_label || '')}</div>` +
    `<div style="width:56px;height:2px;background:#c9a84c;margin:12px auto"></div>` +
    (edition.summary ? `<p style="font-size:13px;color:#6a6a7a;text-align:center;font-style:italic;margin:8px 0 0">${esc(edition.summary)}</p>` : '') +
    body +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;border-top:1px solid #e5e0d3;padding-top:14px"><tr><td style="text-align:center">` +
    `<div style="font-size:11px;color:#b0b0bd">CONCORD Deal Platform · Weekly inventory briefing for buyers</div>` +
    `<div style="font-size:11px;margin-top:8px"><a href="${esc(unsubUrl)}" style="color:#8a8a9a;text-decoration:underline">Unsubscribe from the weekly</a></div>` +
    `</td></tr></table>` +
    `</div>`
  )
}

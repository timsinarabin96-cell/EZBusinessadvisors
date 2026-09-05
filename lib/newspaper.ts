/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

// =============================================================================
// Weekly Newspaper System — service
// -----------------------------------------------------------------------------
// Auto-generates a weekly edition from live platform activity (new listings,
// deals closed, new leads, social highlights), lets editors refine it, manages
// subscriptions, and renders the branded newspaper email (built on the shared
// email shell in lib/email.ts).
//
// All reads/writes go through the anon client under RLS (team only). Runs
// client-side for the dashboard; publishing/delivery also has a server route
// (app/api/newspaper/publish/route.ts) so the email queue is written with the
// service role.
// =============================================================================

import { supabase } from '@/lib/supabase/client'

// -- Types & pure helpers (server-safe) ----------------------------------------
// Types, nowLabel, makeUnsubToken, renderNewspaperHtml, esc etc. live in
// lib/newspaperShared.ts so server routes can import them (this module is
// 'use client' and Next.js forbids calling its exports from server code).
import { SECTIONS, nowLabel, makeUnsubToken, renderNewspaperHtml, type NewEdition, type Article, type Subscription } from './newspaperShared'
export { SECTIONS, nowLabel, makeUnsubToken, renderNewspaperHtml }
export type { NewEdition, Article, Subscription }

// -- Editions -----------------------------------------------------------------
export async function fetchEditions(): Promise<NewEdition[]> {
  try {
    const { data } = await supabase.from('newspaper_editions').select('*').order('edition_date', { ascending: false }).limit(30)
    return (data || []) as unknown as NewEdition[]
  } catch {
    return []
  }
}

/** Create a new draft edition, auto-generating articles from live data. */
export async function createEdition(): Promise<string | null> {
  try {
    // One-edition-per-week guard: never create a second draft for the same
    // issue label (duplicate drafts/published issues came from double-runs).
    const label = nowLabel()
    const { data: existing } = await supabase
      .from('newspaper_editions')
      .select('id')
      .eq('issue_label', label)
      .limit(1)
    if (existing && existing.length > 0) return existing[0].id
    const { data, error } = await supabase.from('newspaper_editions').insert({
      title: 'Concord Weekly', issue_label: label, status: 'draft',
    }).select().single()
    if (error || !data) return null
    await autoGenerateArticles(data.id)
    return data.id
  } catch {
    return null
  }
}

export async function updateEdition(id: string, patch: Partial<NewEdition>): Promise<boolean> {
  try {
    const { error } = await supabase.from('newspaper_editions').update(patch).eq('id', id)
    return !error
  } catch {
    return false
  }
}

export async function publishEdition(id: string): Promise<boolean> {
  try {
    const { error } = await supabase.from('newspaper_editions').update({ status: 'published', published_at: new Date().toISOString() }).eq('id', id)
    return !error
  } catch {
    return false
  }
}

export async function deleteEdition(id: string): Promise<boolean> {
  try {
    const { error } = await supabase.from('newspaper_editions').delete().eq('id', id)
    return !error
  } catch {
    return false
  }
}

// -- Articles -----------------------------------------------------------------
export async function fetchArticles(editionId: string): Promise<Article[]> {
  try {
    const { data } = await supabase.from('newspaper_articles').select('*').eq('edition_id', editionId).order('sort_order', { ascending: true })
    return (data || []) as unknown as Article[]
  } catch {
    return []
  }
}

export async function upsertArticle(a: Partial<Article>): Promise<boolean> {
  try {
    const { error } = await supabase.from('newspaper_articles').upsert(a)
    return !error
  } catch {
    return false
  }
}

export async function deleteArticle(id: string): Promise<boolean> {
  try {
    const { error } = await supabase.from('newspaper_articles').delete().eq('id', id)
    return !error
  } catch {
    return false
  }
}

/**
 * Auto-generate editorial content from real platform data:
 *   * Featured Listings — recent active listings (with price)
 *   * Deals Closed — recently closed deals + value (no party names)
 *   * Market News — a short weekly intro paragraph tying it together
 * v3: NEVER queries seller_leads / buyer_leads and NEVER discloses buyer or
 * seller identities — the old "New Leads" section has been removed
 * permanently. The full premium (photos + agent cards) generation lives
 * server-side in lib/newspaperV3.ts; this client-side helper only powers the
 * dashboard's manual "quick draft" preview.
 */
export async function autoGenerateArticles(editionId: string): Promise<boolean> {
  try {
    const [listingsRes, dealsRes] = await Promise.all([
      supabase.from('listings').select('business_name, industry, asking_price, status, created_at').eq('status', 'active')?.order('created_at', { ascending: false }).limit(6),
      supabase.from('deals').select('title, status, purchase_price, created_at').or('status.eq.closed')?.order('updated_at', { ascending: false }).limit(6),
    ])
    const listings = (listingsRes?.data || []) as any[]
    const deals = (dealsRes?.data || []) as any[]

    const articles: Array<Omit<Article, 'id' | 'edition_id'>> = []
    let order = 10

    // Intro / market news — identity-free counts only
    articles.push({
      section: 'Market News',
      headline: nowLabel(),
      body:
        `This week we welcomed ${listings.length} featured listing${listings.length === 1 ? '' : 's'} and ` +
        `closed ${deals.length} deal${deals.length === 1 ? '' : 's'}. The business sale market remains active ` +
        `across our coverage area — reach out to discuss your exit or acquisition goals.`,
      sort_order: order,
    })
    order += 10

    // Featured listings
    if (listings.length) {
      articles.push({
        section: 'Featured Listings',
        headline: 'New businesses for sale this week',
        body: listings.map((l, i) => `${i + 1}. ${l.business_name || 'Business'}${l.industry ? ' — ' + l.industry : ''}${l.asking_price ? ' · $' + Math.round(l.asking_price).toLocaleString() : ''}`).join('\n'),
        sort_order: order,
      })
      order += 10
    }

    // Deals closed — amounts/timelines only, never party names
    if (deals.length) {
      articles.push({
        section: 'Deals Closed',
        headline: 'Recent closings',
        body: deals.map((d, i) => `${i + 1}. Business acquisition${d.purchase_price ? ' · $' + Math.round(d.purchase_price).toLocaleString() : ''} (${d.status})`).join('\n'),
        sort_order: order,
      })
      order += 10
    }

    // Team updates placeholder
    articles.push({
      section: 'Team Updates',
      headline: 'From the team',
      body: 'Our advisors continue to guide clients through confidential listings, valuations, and due diligence. Contact your advisor to schedule a free consult.',
      sort_order: order,
    })

    for (const a of articles) {
      await supabase.from('newspaper_articles').insert({ ...a, edition_id: editionId })
    }
    return true
  } catch {
    return false
  }
}

// -- Subscriptions -------------------------------------------------------------
export async function fetchSubscriptions(): Promise<Subscription[]> {
  try {
    const { data } = await supabase.from('newspaper_subscriptions').select('*').order('created_at', { ascending: false }).limit(200)
    return (data || []) as unknown as Subscription[]
  } catch {
    return []
  }
}

/** Adds a BUYER-audience subscriber (the only audience the weekly digest is
 *  ever sent to). Manual dashboard tool — not user-facing signup. */
export async function addSubscription(email: string, name?: string): Promise<boolean> {
  try {
    const token = makeUnsubToken(email)
    const normalized = email.toLowerCase().trim()
    const { data: existing } = await supabase
      .from('newspaper_subscriptions')
      .select('id')
      .ilike('email', normalized)
      .eq('audience', 'buyer')
      .maybeSingle()
    if (existing) {
      const { error } = await supabase.from('newspaper_subscriptions').update({ status: 'active', name: name || null }).eq('id', existing.id)
      return !error
    }
    const { error } = await supabase.from('newspaper_subscriptions').insert(
      { email: normalized, name: name || null, token, audience: 'buyer', status: 'active' },
    )
    return !error
  } catch {
    return false
  }
}

export async function removeSubscription(id: string): Promise<boolean> {
  try {
    const { error } = await supabase.from('newspaper_subscriptions').delete().eq('id', id)
    return !error
  } catch {
    return false
  }
}

// -- Delivery log --------------------------------------------------------------
export async function fetchDeliveryLog(editionId: string): Promise<any[]> {
  try {
    const { data } = await supabase.from('newspaper_delivery_log').select('*').eq('edition_id', editionId).order('created_at', { ascending: false }).limit(100)
    return (data || []) as any[]
  } catch {
    return []
  }
}

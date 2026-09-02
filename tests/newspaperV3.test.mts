/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Weekly Newspaper v3 — premium buyers-only inventory digest regression tests.
// Covers: no lead/identity disclosure (statically + at runtime), renderer
// output (image/price/agent/unsubscribe), audience-only sending filter, and
// unsubscribe route logic.
// =============================================================================

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

process.env.NEXT_PUBLIC_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://ezbusinessadvisors.vercel.app'

const v3Lib = readFileSync('lib/newspaperV3.ts', 'utf8')
const cronRoute = readFileSync('app/api/cron/weekly-newspaper/route.ts', 'utf8')
const publishRoute = readFileSync('app/api/newspaper/publish/route.ts', 'utf8')
const unsubRoute = readFileSync('app/api/newsletter/unsubscribe/route.ts', 'utf8')
const newsletterRoute = readFileSync('app/api/newsletter/route.ts', 'utf8')
const sharedLib = readFileSync('lib/newspaperShared.ts', 'utf8')
const migration = readFileSync('sql/weekly_newspaper_v3_2026_09_02.sql', 'utf8')

// -- 3. Generation never queries seller_leads/buyer_leads --------------------
test('newspaperV3: generation path never queries seller_leads or buyer_leads', () => {
  // Doc comments are allowed to reference the removed tables by name (for
  // auditability); what must never exist is an actual query against them.
  assert.doesNotMatch(v3Lib, /\.from\(['"]seller_leads['"]\)/)
  assert.doesNotMatch(v3Lib, /\.from\(['"]buyer_leads['"]\)/)
  assert.doesNotMatch(cronRoute, /\.from\(['"]seller_leads['"]\)/)
  assert.doesNotMatch(cronRoute, /\.from\(['"]buyer_leads['"]\)/)
})

test('newspaperShared: SECTIONS constant no longer includes New Leads', () => {
  const sectionsLine = sharedLib.match(/export const SECTIONS = \[[^\]]*\]/)?.[0] || ''
  assert.doesNotMatch(sectionsLine, /New Leads/)
  assert.match(sectionsLine, /Featured Listings/)
})

test('newspaperV3: cron route uses buildV3Articles + renderNewspaperV3Html, not the old renderer', () => {
  assert.match(cronRoute, /buildV3Articles/)
  assert.match(cronRoute, /renderNewspaperV3Html/)
  assert.doesNotMatch(cronRoute, /autoGenerateArticles/)
})

test('newspaperV3: publish route also uses renderNewspaperV3Html', () => {
  assert.match(publishRoute, /renderNewspaperV3Html/)
})

// -- 5. Audience filter: only buyer + active is ever mailed -------------------
test('newspaperV3: cron + publish routes filter status=active AND audience=buyer', () => {
  assert.match(cronRoute, /eq\('status', 'active'\)\.eq\('audience', 'buyer'\)/)
  assert.match(publishRoute, /eq\('status', 'active'\)\.eq\('audience', 'buyer'\)/)
})

// -- Newsletter signup defaults to buyer audience + persists a token ----------
test('newspaperV3: public newsletter signup defaults new subscriptions to audience buyer with a token', () => {
  assert.match(newsletterRoute, /audience: 'buyer'/)
  assert.match(newsletterRoute, /makeUnsubToken/)
})

// -- 4. Unsubscribe route logic ------------------------------------------------
test('newspaperV3: unsubscribe route validates token and flips status to unsubscribed', () => {
  assert.match(unsubRoute, /export async function GET/)
  assert.match(unsubRoute, /status: 'unsubscribed'/)
  assert.match(unsubRoute, /token/i)
})

// -- Migration sanity ----------------------------------------------------------
test('newspaperV3: migration adds audience column + unique(lower(email), audience) + articles.meta', () => {
  assert.match(migration, /add column if not exists audience text/)
  assert.match(migration, /newspaper_subscriptions_email_audience_idx/)
  assert.match(migration, /newspaper_articles[\s\S]*add column if not exists meta jsonb/)
})

// -- Functional renderer tests (import the actual module) --------------------
const { renderNewspaperV3Html, unsubscribeUrl } = await import('../lib/newspaperV3.ts')
const { nowLabel } = await import('../lib/newspaperShared.ts')

function sampleEdition() {
  return {
    id: 'edition-1',
    title: 'Concord Weekly',
    issue_label: nowLabel(),
    edition_date: new Date().toISOString(),
    status: 'published' as const,
    summary: 'Test edition',
  }
}

function sampleArticles() {
  return [
    { id: 'a1', edition_id: 'edition-1', section: 'Market News', headline: 'Weekly update', body: 'We welcomed 3 new listings and closed 1 deal.', sort_order: 10 },
    {
      id: 'a2',
      edition_id: 'edition-1',
      section: 'Featured Listings',
      headline: 'Acme Laundromat',
      body: 'Industry: Laundry\nLocation: Denver, CO\nAsking Price: $450,000',
      image_url: 'https://cdn.example.com/acme.jpg',
      sort_order: 20,
      meta: {
        listingId: 'listing-123',
        slug: 'acme-laundromat',
        isFeatured: true,
        askingPrice: 450000,
        industry: 'Laundry',
        location: 'Denver, CO',
        agent: { profileId: 'agent-1', name: 'Jane Broker', phone: '555-123-4567', email: 'jane@example.com', avatarUrl: null },
      },
    },
  ]
}

const subscriber = { email: 'buyer@example.com', token: 'tok123', name: 'Buyer One' }

test('renderer: output contains listing image, price, agent name/phone/email, unsubscribe link with token', () => {
  const html = renderNewspaperV3Html(sampleEdition() as any, sampleArticles() as any, subscriber)
  assert.match(html, /https:\/\/cdn\.example\.com\/acme\.jpg/)
  assert.match(html, /\$450,000/)
  assert.match(html, /Jane Broker/)
  assert.match(html, /555-123-4567/)
  assert.match(html, /jane@example\.com/)
  assert.match(html, /Unsubscribe from the weekly/)
  assert.match(html, /token=tok123/)
  assert.match(html, /email=buyer%40example\.com/)
})

test('renderer: listing card links to marketplace listing by slug', () => {
  const html = renderNewspaperV3Html(sampleEdition() as any, sampleArticles() as any, subscriber)
  assert.match(html, /marketplace\/listings\/acme-laundromat/)
})

test('renderer: quiet state shown when no featured listings', () => {
  const html = renderNewspaperV3Html(sampleEdition() as any, [sampleArticles()[0]] as any, subscriber)
  assert.match(html, /No new inventory to feature this week/)
})

test('unsubscribeUrl: builds a URL with encoded email + token', () => {
  const url = unsubscribeUrl(subscriber)
  assert.match(url, /\/api\/newsletter\/unsubscribe\?email=buyer%40example\.com&token=tok123/)
})

// -- 2. No buyer/seller identity ever appears in generated output -------------
test('renderer: never emits buyer/seller lead identity fields', () => {
  const html = renderNewspaperV3Html(sampleEdition() as any, sampleArticles() as any, subscriber)
  assert.doesNotMatch(html, /buyer_leads/)
  assert.doesNotMatch(html, /contact_name/)
  assert.doesNotMatch(html, /industry_interest/)
})

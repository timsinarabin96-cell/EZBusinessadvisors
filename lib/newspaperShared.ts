/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Newspaper shared pure helpers — server-safe (no 'use client', no supabase).
// -----------------------------------------------------------------------------
// The main lib/newspaper.ts is a 'use client' module (browser supabase client),
// which Next.js forbids calling from server routes. These pure functions are
// imported by /api/cron/weekly-newspaper, /api/newspaper/publish and
// /api/newsletter (server), and re-exported by lib/newspaper.ts for the
// client-side dashboard panel.
// =============================================================================

export type NewEdition = {
  id: string
  title: string
  issue_label: string | null
  edition_date: string
  status: 'draft' | 'published'
  published_at?: string | null
  summary?: string | null
  created_at?: string
}

export type Article = {
  id: string
  edition_id: string
  section: string
  headline: string
  body: string | null
  image_url?: string | null
  sort_order?: number
}

export type Subscription = {
  id: string
  email: string
  name?: string | null
  status: 'active' | 'unsubscribed' | 'bounced'
  token?: string | null
  created_at?: string
}

// v3: buyer-only inventory digest — 'New Leads' removed permanently. We never
// disclose buyer/seller identities or industry interest in the weekly email.
export const SECTIONS = ['Market News', 'Featured Listings', 'Deals Closed', 'Team Updates']

export function nowLabel(): string {
  return `Week of ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
}

export function makeUnsubToken(email: string): string {
  try {
    const raw = `${email}:${Date.now()}`
    return typeof btoa === 'function' ? btoa(unescape(encodeURIComponent(raw))).replace(/[^a-zA-Z0-9]/g, '').slice(0, 24) : raw.slice(0, 24)
  } catch {
    return `${email}`.replace(/[^a-zA-Z0-9]/g, '').slice(0, 24)
  }
}

// -- Email rendering ------------------------------------------------------------
/** Build the HTML newspaper body from the edition + articles (branded). */
export function renderNewspaperHtml(edition: NewEdition, articles: Article[]): string {
  const rows = articles
    .map((a) => {
      const paras = (a.body || '')
        .split('\n')
        .filter(Boolean)
        .map((line) => `<p style="margin:4px 0;font-size:14px;line-height:1.55;color:#2a2a2a">${esc(line)}</p>`)
        .join('')
      const badge = sectionColor(a.section)
      return (
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:14px 0"><tr><td style="background:#fbfaf7;border:1px solid #e5e0d3;border-left:4px solid ${badge};border-radius:8px;padding:16px 18px">` +
        `<div style="font-size:11px;text-transform:uppercase;letter-spacing:0.12em;color:${badge};font-weight:700;margin-bottom:6px">${esc(a.section || 'News')}</div>` +
        `<div style="font-family:Georgia,serif;font-size:18px;font-weight:700;color:#1a1a2e;margin-bottom:8px">${esc(a.headline || '')}</div>` +
        paras +
        `</td></tr></table>`
      )
    })
    .join('\n')

  return (
    `<div style="max-width:620px;margin:0 auto;padding:24px 16px">` +
    `<div style="font-family:Georgia,serif;font-size:28px;font-weight:700;color:#1a1a2e;text-align:center;letter-spacing:0.02em">Concord Weekly</div>` +
    `<div style="text-align:center;font-size:12px;color:#8a8a9a;letter-spacing:0.14em;text-transform:uppercase;margin:6px 0 2px">${esc(edition.issue_label || '')}</div>` +
    `<div style="width:56px;height:2px;background:#c9a84c;margin:12px auto"></div>` +
    (edition.summary ? `<p style="font-size:13px;color:#6a6a7a;text-align:center;font-style:italic;margin:8px 0 0">${esc(edition.summary)}</p>` : '') +
    rows +
    `<p style="font-size:11px;color:#b0b0bd;text-align:center;margin-top:22px">CONCORD Deal Platform · Confidential weekly briefing</p>` +
    `</div>`
  )
}

function sectionColor(section: string): string {
  switch (section) {
    case 'Featured Listings': return '#0b1f3a'
    case 'Deals Closed': return '#16a34a'
    case 'Team Updates': return '#c9a84c'
    default: return '#3b82f6'
  }
}

export function esc(s: string): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))
}

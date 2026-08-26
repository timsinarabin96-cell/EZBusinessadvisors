/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { createClient } from '@supabase/supabase-js'

// =============================================================================
// Newsletter ad slot — the $150/send sponsored line that rides inside
// marketing emails (deal digests, daily briefs, match alerts, renewals).
//
// Reads the active `newsletter_slot` from ad_slots (same table + RLS as the
// public SponsoredSlot component). When no slot is active, emails go out
// sponsor-free. Lookup is cached ~5 min so per-recipient digest loops don't
// hammer the DB.
// =============================================================================

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const svc =
  SUPABASE_URL && SERVICE_KEY
    ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
    : null

export interface NewsletterSponsor {
  advertiser: string
  body: string
  url: string
}

let cachedSponsor: NewsletterSponsor | null | undefined
let cachedAt = 0
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

/** Active newsletter slot, or null. Cached; never throws. */
export async function fetchNewsletterSponsor(): Promise<NewsletterSponsor | null> {
  const now = Date.now()
  if (cachedSponsor !== undefined && now - cachedAt < CACHE_TTL_MS) return cachedSponsor
  cachedSponsor = null
  cachedAt = now

  if (!svc) return null
  try {
    const today = new Date().toISOString().slice(0, 10)
    const { data } = await svc
      .from('ad_slots')
      .select('advertiser, body, url')
      .eq('slot_key', 'newsletter_slot')
      .eq('active', true)
      .lte('starts_at', today)
      .or(`ends_at.is.null,ends_at.gte.${today}`)
      .maybeSingle()
    if (data?.advertiser && data?.body && data?.url) {
      cachedSponsor = { advertiser: data.advertiser, body: data.body, url: data.url }
    }
  } catch {
    // Non-critical — emails must never fail because of the sponsor lookup.
  }
  return cachedSponsor
}

/** Clear the cache (useful after an admin edits a slot in dev/tests). */
export function resetNewsletterSponsorCache(): void {
  cachedSponsor = undefined
  cachedAt = 0
}

/** Small FTC-labeled sponsored block, styled to match the navy/gold shell. */
export function newsletterSponsorHtml(sponsor: NewsletterSponsor): string {
  const esc = (s: string): string =>
    String(s ?? '').replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string),
    )
  return `<tr><td style="padding:18px 32px;border-top:1px solid #ece8dc;background:#faf9f4;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="font-size:10px;letter-spacing:0.18em;color:#a89a68;text-transform:uppercase;font-weight:700;padding-bottom:6px;">Sponsored</td>
      </tr>
      <tr>
        <td style="font-size:14px;font-weight:700;color:#0b1f3a;font-family:Georgia,serif;">${esc(sponsor.advertiser)}</td>
      </tr>
      <tr>
        <td style="font-size:12.5px;color:#5a5f6b;line-height:1.5;padding-top:3px;">${esc(sponsor.body)}</td>
      </tr>
      <tr>
        <td style="padding-top:10px;">
          <a href="${esc(sponsor.url)}" style="display:inline-block;background:#c9a84c;color:#0b1f3a;text-decoration:none;font-weight:700;font-size:12px;padding:8px 16px;border-radius:6px;">Learn more →</a>
        </td>
      </tr>
    </table>
  </td></tr>`
}

/** Insert the sponsor row just above the email footer row, if the marker exists. */
export function injectNewsletterSponsor(html: string, sponsorHtml: string): string {
  const footerMarker = '<tr><td style="background:#f7f6f2;padding:16px 32px;'
  if (!html.includes(footerMarker)) return html + sponsorHtml
  return html.replace(footerMarker, `${sponsorHtml}\n        ${footerMarker}`)
}

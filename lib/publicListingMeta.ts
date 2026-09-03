/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Public Listing Meta — server-only enrichment for public listing pages.
// -----------------------------------------------------------------------------
// Adds the human-readable listing ID (listing_ref, e.g. "EZB-0142") and the
// assigned agent/broker contact card (name, photo, phone, email) to public
// listings. Runs server-side with the service-role client; the browser never
// sees anything beyond what we explicitly return.
// =============================================================================

import { createServerClient } from '@/lib/supabase/server'

export interface PublicAgentInfo {
  profileId: string
  name: string
  photo: string | null
  phone: string | null
  email: string | null
  bio: string | null
  /** Agency-level fallbacks so every broker card has full contact info. */
  agencyName: string | null
  agencyPhone: string | null
  agencyEmail: string | null
  agencyWebsite: string | null
}

export interface PublicListingMeta {
  listingId: string
  listingRef: string | null
  agent: PublicAgentInfo | null
}

const clean = (s: unknown): string | null => {
  if (s === null || s === undefined) return null
  const v = String(s).trim()
  return v || null
}

/**
 * Resolve "who to hand this agency's lead off to" — the agency's first public
 * broker_profiles row, falling back to agency contact info alone (same
 * precedence as fetchPublicListingsMeta, minus the per-listing agent_id hop).
 * Used by the chat-widget lead handoff to tell a new seller/buyer who their
 * broker is without needing a specific listing_id.
 */
export async function resolveAgencyBroker(agencyId: string): Promise<PublicAgentInfo | null> {
  const db = createServerClient()
  if (!db || !agencyId) return null
  try {
    const { data: broker } = await db
      .from('broker_profiles')
      .select('profile_id, agency_id, public_name, avatar_url, phone, email_public, bio')
      .eq('agency_id', agencyId)
      .eq('is_public', true)
      .limit(1)
      .maybeSingle()

    const { data: agency } = await db
      .from('agencies')
      .select('id, name, phone, email, domain, custom_domain, slug')
      .eq('id', agencyId)
      .maybeSingle()

    const website = agency
      ? agency.custom_domain
        ? `https://${agency.custom_domain}`
        : agency.domain
          ? `https://${agency.domain}`
          : agency.slug
            ? `https://${agency.slug}.concorddeal.com`
            : null
      : null

    if (broker) {
      return {
        profileId: broker.profile_id,
        name: clean(broker.public_name) || clean(broker.email_public)?.split('@')[0] || 'Your Broker',
        photo: clean(broker.avatar_url),
        phone: clean(broker.phone) || clean(agency?.phone),
        email: clean(broker.email_public) || clean(agency?.email),
        bio: clean(broker.bio),
        agencyName: clean(agency?.name),
        agencyPhone: clean(agency?.phone),
        agencyEmail: clean(agency?.email),
        agencyWebsite: website,
      }
    }
    if (agency && (clean(agency.phone) || clean(agency.email) || clean(agency.name))) {
      return {
        profileId: `agency:${agency.id}`,
        name: clean(agency.name) || 'Your Broker',
        photo: null,
        phone: clean(agency.phone),
        email: clean(agency.email),
        bio: null,
        agencyName: clean(agency.name),
        agencyPhone: clean(agency.phone),
        agencyEmail: clean(agency.email),
        agencyWebsite: website,
      }
    }
    return null
  } catch {
    return null
  }
}

/** Fetch listing_ref + assigned agent for ONE listing (by id or slug). */
export async function fetchPublicListingMeta(identifier: string): Promise<PublicListingMeta | null> {
  const metas = await fetchPublicListingsMeta([identifier])
  return metas[0] || null
}

/**
 * Batch-fetch listing_ref + agent contact for many listings at once.
 * Accepts ids or slugs; resolves the listing row, then the agency's broker
 * profile (primary agent = the broker attached to the listing's agency).
 */
export async function fetchPublicListingsMeta(identifiers: string[]): Promise<PublicListingMeta[]> {
  const db = createServerClient()
  if (!db || identifiers.length === 0) return []

  const idOrSlug = identifiers.filter(Boolean)
  if (idOrSlug.length === 0) return []

  try {
    // Resolve listings (id or slug) → id, agency_id, listing_ref.
    // Note: slug lives on public_listings, not listings; join through listing_id.
    // UUIDs and slugs are matched separately — PostgREST can't OR a uuid column
    // with a text value in one filter.
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    const ids = idOrSlug.filter((x) => uuidRe.test(x))
    const slugs = idOrSlug.filter((x) => !uuidRe.test(x))
    const resolved: { listing_id: string }[] = []
    if (slugs.length > 0) {
      const { data } = await db.from('public_listings').select('listing_id').in('slug', slugs)
      if (data) resolved.push(...(data as { listing_id: string }[]))
    }
    if (ids.length > 0) {
      const { data } = await db.from('public_listings').select('listing_id').in('listing_id', ids)
      if (data) resolved.push(...(data as { listing_id: string }[]))
    }
    if (resolved.length === 0) return []

    const listingIds = [...new Set(resolved.map((r) => r.listing_id).filter(Boolean))] as string[]
    if (listingIds.length === 0) return []

    const { data: listings, error } = await db
      .from('listings')
      .select('id, agency_id, agent_id, listing_ref')
      .in('id', listingIds)
    if (error || !listings?.length) return []

    const agencyIds = [...new Set(listings.map((l) => l.agency_id).filter(Boolean))] as string[]
    const agentIds = [...new Set(listings.map((l) => l.agent_id).filter(Boolean))] as string[]

    // Resolve broker profiles: first by the agent actually assigned to each
    // listing (listings.agent_id = broker_profiles.profile_id), then fall back
    // to the agency's first broker so every card still shows someone.
    let brokerByProfile: Record<string, any> = {}
    let brokerByAgency: Record<string, any> = {}
    if (agentIds.length > 0 || agencyIds.length > 0) {
      const { data: brokers } = await db
        .from('broker_profiles')
        .select('profile_id, agency_id, public_name, avatar_url, phone, email_public, bio')
        .or(`profile_id.in.(${agentIds.join(',')}),agency_id.in.(${agencyIds.join(',')})`)
      for (const b of brokers || []) {
        if (b.profile_id && !brokerByProfile[b.profile_id]) brokerByProfile[b.profile_id] = b
        if (b.agency_id && !brokerByAgency[b.agency_id]) brokerByAgency[b.agency_id] = b
      }
    }

    // Agency-level contact (phone/email/website) — used as fallback so every
    // broker card can show full contact details even before the broker fills
    // in their own profile fields.
    let agencyById: Record<string, any> = {}
    if (agencyIds.length > 0) {
      const { data: agencies } = await db
        .from('agencies')
        .select('id, name, phone, email, domain, custom_domain, slug')
        .in('id', agencyIds)
      for (const a of agencies || []) agencyById[a.id] = a
    }

    return listings.map((l) => {
      // Assigned agent first (agent_id → broker profile); agency primary broker
      // as fallback so the card is never empty.
      const broker = (l.agent_id && brokerByProfile[l.agent_id]) || (l.agency_id ? brokerByAgency[l.agency_id] : null)
      const agency = l.agency_id ? agencyById[l.agency_id] : null
      const website = agency
        ? agency.custom_domain
          ? `https://${agency.custom_domain}`
          : agency.domain
            ? `https://${agency.domain}`
            : agency.slug
              ? `https://${agency.slug}.concorddeal.com`
              : null
        : null
      // Agent card resolution, in order: assigned/agency broker profile →
      // agency-only contact (name/phone/email/website, no individual person)
      // → null only when there is truly nothing to show (no agency either).
      // Previously this returned null whenever broker_profiles had no row for
      // the agency, which silently hid the float on every listing whose
      // agency hadn't filled in a broker_profiles row yet.
      let agentCard: PublicAgentInfo | null = null
      if (broker) {
        agentCard = {
          profileId: broker.profile_id,
          name: clean(broker.public_name) || clean(broker.email_public)?.split('@')[0] || 'Your Broker',
          photo: clean(broker.avatar_url),
          phone: clean(broker.phone) || clean(agency?.phone),
          email: clean(broker.email_public) || clean(agency?.email),
          bio: clean(broker.bio),
          agencyName: clean(agency?.name),
          agencyPhone: clean(agency?.phone),
          agencyEmail: clean(agency?.email),
          agencyWebsite: website,
        }
      } else if (agency && (clean(agency.phone) || clean(agency.email) || clean(agency.name))) {
        agentCard = {
          profileId: `agency:${agency.id}`,
          name: clean(agency.name) || 'Your Broker',
          photo: null,
          phone: clean(agency.phone),
          email: clean(agency.email),
          bio: null,
          agencyName: clean(agency.name),
          agencyPhone: clean(agency.phone),
          agencyEmail: clean(agency.email),
          agencyWebsite: website,
        }
      }

      return {
        listingId: l.id,
        listingRef: clean(l.listing_ref),
        agent: agentCard,
      }
    })
  } catch {
    return []
  }
}

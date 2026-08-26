/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Activity Feed — unified audit trail
// -----------------------------------------------------------------------------
// Merges review events, data-room activity, match events, milestone updates,
// and NDA decisions into one reverse-chronological feed per agency.
// Server-only.
// =============================================================================

import { createClient } from '@supabase/supabase-js'

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const svc =
  SUPABASE_URL && SERVICE_KEY
    ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
    : null

export interface ActivityItem {
  id: string
  kind: string
  title: string
  detail: string
  createdAt: string
  listingName?: string | null
  actor?: string | null
}

/** Fetch the unified activity feed for an agency (best-effort, never throws). */
export async function fetchActivityFeed(agencyId: string, limit = 50): Promise<ActivityItem[]> {
  if (!svc) return []
  const items: ActivityItem[] = []

  // 1. Listing review events.
  const { data: reviews } = await svc
    .from('listing_review_events')
    .select('id, from_stage, to_stage, notes, created_at, listings(business_name), profiles(id)')
    .eq('agency_id', agencyId)
    .order('created_at', { ascending: false })
    .limit(limit)
  for (const r of reviews || []) {
    items.push({
      id: 'review-' + r.id,
      kind: 'review',
      title: `Listing ${r.to_stage}`,
      detail: r.notes || `${r.from_stage || 'draft'} → ${r.to_stage}`,
      createdAt: r.created_at,
      listingName: (r.listings as any)?.business_name || null,
    })
  }

  // 2. Data-room activity.
  const { data: activities } = await svc
    .from('data_room_activities')
    .select('id, action, details, created_at, user_email, data_rooms(name, listings(business_name))')
    .order('created_at', { ascending: false })
    .limit(limit)
  for (const a of activities || []) {
    const room = a.data_rooms as any
    items.push({
      id: 'dr-' + a.id,
      kind: 'data-room',
      title: a.action,
      detail: a.details || room?.name || 'Data room activity',
      createdAt: a.created_at,
      listingName: room?.listings?.business_name || null,
      actor: a.user_email || null,
    })
  }

  // 3. Buyer match events.
  const { data: matches } = await svc
    .from('buyer_match_events')
    .select('id, match_score, status, created_at, listings(business_name)')
    .eq('agency_id', agencyId)
    .order('created_at', { ascending: false })
    .limit(limit)
  for (const m of matches || []) {
    items.push({
      id: 'match-' + m.id,
      kind: 'match',
      title: `Buyer match · score ${m.match_score}/100`,
      detail: m.status,
      createdAt: m.created_at,
      listingName: (m.listings as any)?.business_name || null,
    })
  }

  // 4. NDA access decisions.
  const { data: nda } = await svc
    .from('data_room_access_requests')
    .select('id, requester_name, status, created_at, listings(business_name)')
    .eq('agency_id', agencyId)
    .order('created_at', { ascending: false })
    .limit(limit)
  for (const n of nda || []) {
    items.push({
      id: 'nda-' + n.id,
      kind: 'nda',
      title: `NDA request ${n.status} — ${n.requester_name}`,
      detail: n.status === 'pending' ? 'Awaiting review' : `Access ${n.status}`,
      createdAt: n.created_at,
      listingName: (n.listings as any)?.business_name || null,
    })
  }

  // 5. Closing milestone updates.
  const { data: milestones } = await svc
    .from('deal_closing_milestones')
    .select('id, title, completed_at, created_at, listings(business_name)')
    .eq('agency_id', agencyId)
    .order('created_at', { ascending: false })
    .limit(limit)
  for (const m of milestones || []) {
    items.push({
      id: 'milestone-' + m.id,
      kind: 'milestone',
      title: m.completed_at ? `Milestone done: ${m.title}` : `Milestone added: ${m.title}`,
      detail: m.completed_at ? 'Completed' : 'In progress',
      createdAt: m.created_at,
      listingName: (m.listings as any)?.business_name || null,
    })
  }

  // Sort reverse-chronological and trim.
  items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  return items.slice(0, limit)
}

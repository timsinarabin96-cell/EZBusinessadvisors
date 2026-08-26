/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// Shared ad-slot types (server + client safe — no 'use client' on purpose).

export interface AdSlot {
  id: string
  slot_key: string
  advertiser: string
  body: string
  url: string
  badge: string
  starts_at: string
  ends_at: string | null
  active: boolean
  monthly_fee_cents: number
  impressions: number
  clicks: number
  notes: string | null
  created_at: string
  updated_at: string
}

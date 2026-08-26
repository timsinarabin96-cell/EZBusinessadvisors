/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

// =============================================================================
// Client Portal service
// -----------------------------------------------------------------------------
// Token-gated access for external business clients (no broker-account login
// required). The client receives a private URL /portal/<dealId>/<token>; the
// token is validated SERVER-SIDE in app/api/portal/route.ts (service role,
// never exposed to the browser).
//
// This module provides:
//   * Broker-side management (anon client, RLS): grant/revoke/list access
//   * makeToken() — deterministic-ish token generator for shareable links
//   * Client-side API wrappers that call /api/portal (GET/POST)
// =============================================================================

import { supabase } from '@/lib/supabase/client'

// -- Token helper ------------------------------------------------------------
// SECURITY (2026-08-26 audit): the old token was base64(dealId:email:Date.now())
// — fully predictable, so anyone who knew a deal ID + email could forge portal
// access to client documents. Now a 24-byte CSPRNG token (browser-safe).
export function makeToken(): string {
  try {
    const bytes = new Uint8Array(24)
    crypto.getRandomValues(bytes)
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  } catch {
    // Fallback: high-entropy timestamp + Math.random — still far better than
    // the old deterministic base64, and only used if getRandomValues is missing.
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`
  }
}

// -- Types -------------------------------------------------------------------
export interface ClientAccess {
  id: string
  deal_id: string
  client_name: string
  client_email: string
  token: string
  status: string
  created_at?: string
}

export interface PortalMessageUpdate {
  id?: string
  deal_id: string
  author: 'client' | 'broker'
  author_name?: string
  body: string
  created_at?: string
}

export interface PortalMilestone {
  title?: string
  date?: string
  status?: string
  detail?: string
}

export interface PortalDeal {
  id: string
  title: string
  status: string
  purchase_price: number | null
  created_at?: string
  updated_at?: string
  listing_id?: string | null
}

export interface PortalSnapshot {
  ok: boolean
  clientName: string
  clientEmail?: string | null
  deal: PortalDeal | null
  documents: any[]
  milestones: PortalMilestone[]
  messages: PortalMessageUpdate[]
  traction?: {
    viewsTotal: number
    views7d: number
    ndaSigned: number
    interestedBuyers: number
  } | null
}

// -- Broker-side management (anon client, RLS) --------------------------------
export async function grantClientAccess(input: { dealId: string; clientName: string; clientEmail: string }): Promise<ClientAccess | null> {
  try {
    const token = makeToken()
    const { data, error } = await supabase.from('client_portal_access').insert({
      deal_id: input.dealId, client_name: input.clientName, client_email: input.clientEmail, token,
    }).select().single()
    if (error) { console.error('[portal] grant', error); return null }
    return data as unknown as ClientAccess
  } catch {
    return null
  }
}

export async function fetchClientAccess(dealId: string): Promise<ClientAccess[]> {
  try {
    const { data } = await supabase.from('client_portal_access').select('*').eq('deal_id', dealId).order('created_at', { ascending: false })
    return (data || []) as unknown as ClientAccess[]
  } catch {
    return []
  }
}

export async function revokeClientAccess(id: string): Promise<boolean> {
  try {
    const { error } = await supabase.from('client_portal_access').update({ status: 'revoked' }).eq('id', id)
    return !error
  } catch {
    return false
  }
}

// -- Client-side API wrappers (token-authenticated, server-validated) --------
/** Load the full portal snapshot for a deal+token pair. */
export async function fetchPortalSnapshot(dealId: string, token: string): Promise<PortalSnapshot | null> {
  try {
    const res = await fetch(`/api/portal?dealId=${encodeURIComponent(dealId)}&token=${encodeURIComponent(token)}`, { cache: 'no-store' })
    if (!res.ok) return null
    return (await res.json()) as PortalSnapshot
  } catch {
    return null
  }
}

/** Send a message as the client (server-validated with the token). */
export async function sendPortalMessage(dealId: string, token: string, body: string, clientName: string): Promise<PortalMessageUpdate | null> {
  try {
    const res = await fetch('/api/portal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dealId, token, action: 'message', body, clientName }),
    })
    if (!res.ok) return null
    const json = await res.json()
    return json.message as PortalMessageUpdate
  } catch {
    return null
  }
}

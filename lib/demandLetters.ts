/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// DEMAND LETTER STUDIO — niche packs, pure composer, agency-scoped CRUD.
// -----------------------------------------------------------------------------
// In-app drafts only. NOTHING in this module sends email — letters are stored
// as drafts with statuses (draft → ready → archived) so a broker can preview,
// copy, or print before any real outreach happens outside the platform.
// Two niches ship today (gas stations, NEMT); more packs are additive.
// =============================================================================

import { createServerClient } from '@/lib/supabase/server'

export type DemandLetterNiche = 'gas_station' | 'nemt'
export type DemandLetterStatus = 'draft' | 'ready' | 'archived'

export interface NichePack {
  key: DemandLetterNiche
  label: string
  icon: string
  audience: string
  bullets: string[]
  closing: string
}

export const NICHE_PACKS: NichePack[] = [
  {
    key: 'gas_station',
    label: 'Gas Stations & C-Stores',
    icon: '⛽',
    audience: 'independent gas stations and convenience stores',
    bullets: [
      'Qualified buyers with verified funds seeking fuel + c-store operations',
      'Real-estate-plus-business and ground-lease deals considered',
      'Confidential process — no public listing, no disruption to staff or suppliers',
    ],
    closing: 'Right now we hold more buyer demand than available listings in this category.',
  },
  {
    key: 'nemt',
    label: 'NEMT / Medical Transport',
    icon: '🚐',
    audience: 'non-emergency medical transport (NEMT) operators',
    bullets: [
      'Buyers targeting NEMT fleets with active Medicaid / broker contracts',
      'Vehicles, route density, and recurring trip volume all valued',
      'Strictly confidential, competitor-proof process',
    ],
    closing: 'Active demand for NEMT platforms is at an all-time high.',
  },
]

export function nichePack(niche: DemandLetterNiche): NichePack {
  return NICHE_PACKS.find((p) => p.key === niche) ?? NICHE_PACKS[0]
}

export interface LetterTarget {
  recipientName?: string
  businessName?: string
  location?: string
}

export interface LetterIdentity {
  agencyName: string
  brokerName?: string | null
  phone?: string | null
  email?: string | null
}

const fill = (s: string, vars: Record<string, string>) =>
  s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? '')

/** Compose a professional demand letter from a niche pack + target + identity. */
export function composeDemandLetter(
  niche: DemandLetterNiche,
  target: LetterTarget,
  identity: LetterIdentity,
): { subject: string; body: string } {
  const pack = nichePack(niche)
  const business = target.businessName?.trim() || 'your business'
  const location = target.location?.trim() ? ` in ${target.location.trim()}` : ''
  const recipient = target.recipientName?.trim() || 'Business Owner'
  const phone = identity.phone?.trim() || ''
  const email = identity.email?.trim() || ''
  const contactLine = [phone, email].filter(Boolean).join('  ·  ')
  const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

  const vars = {
    date: dateStr,
    recipient,
    business,
    location,
    audience: pack.audience,
    bullets: pack.bullets.map((x) => `  •  ${x}`).join('\n'),
    closing: pack.closing,
    agency: identity.agencyName || 'our firm',
    broker: identity.brokerName?.trim() || identity.agencyName || 'Our team',
    contact: contactLine,
  }

  const body = fill(
    [
      '{{date}}',
      '',
      'RE: Confidential inquiry — {{business}}',
      '',
      'Dear {{recipient}},',
      '',
      'I represent {{agency}}, a business brokerage firm. We currently have more qualified buyers seeking {{audience}} than we have available opportunities{{location}}.',
      '',
      'If you are the owner of {{business}} and have considered selling — or would simply like a confidential, no-obligation read on what your operation is worth in today\u2019s market — I would welcome a conversation.',
      '',
      'What makes this inquiry worth your time:',
      '{{bullets}}',
      '',
      '{{closing}}',
      '',
      'The process is confidential and runs entirely at your pace:',
      '  1. A private conversation to understand your goals',
      '  2. A complimentary market valuation — no obligation',
      '  3. If you choose to proceed, a discreet, structured sale process',
      '',
      'There is no cost and no obligation to explore your options. If now is not the right time, I would be glad to stay in touch for the future.',
      '',
      'Best regards,',
      '{{broker}}',
      '{{agency}}',
      contactLine ? '{{contact}}' : '',
    ].join('\n'),
    vars,
  )

  return { subject: `Confidential inquiry — ${business}`, body }
}

// ---------------------------------------------------------------------------
// CRUD (service-role, always agency-filtered — mirrors the isolation audit).
// ---------------------------------------------------------------------------

export interface DemandLetterRow {
  id: string
  agency_id: string
  niche: DemandLetterNiche
  status: DemandLetterStatus
  recipient_name: string | null
  business_name: string | null
  location: string | null
  subject: string
  body: string
  created_at: string
  updated_at: string
}

export async function listDemandLetters(agencyId: string): Promise<DemandLetterRow[]> {
  const db = createServerClient()
  if (!db) return []
  const { data } = await db
    .from('demand_letters')
    .select('*')
    .eq('agency_id', agencyId)
    .order('created_at', { ascending: false })
    .limit(100)
  return (data ?? []) as DemandLetterRow[]
}

export async function createDemandLetter(input: {
  agencyId: string
  createdBy?: string | null
  niche: DemandLetterNiche
  status: DemandLetterStatus
  target: LetterTarget
  subject: string
  body: string
}): Promise<DemandLetterRow | null> {
  const db = createServerClient()
  if (!db) return null
  const { data, error } = await db
    .from('demand_letters')
    .insert({
      agency_id: input.agencyId,
      created_by: input.createdBy ?? null,
      niche: input.niche,
      status: input.status,
      recipient_name: input.target.recipientName?.trim() || null,
      business_name: input.target.businessName?.trim() || null,
      location: input.target.location?.trim() || null,
      subject: input.subject,
      body: input.body,
    })
    .select()
    .single()
  if (error || !data) return null
  return data as DemandLetterRow
}

export async function setDemandLetterStatus(id: string, agencyId: string, status: DemandLetterStatus): Promise<boolean> {
  const db = createServerClient()
  if (!db) return false
  const { error } = await db
    .from('demand_letters')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('agency_id', agencyId)
  return !error
}

export async function deleteDemandLetter(id: string, agencyId: string): Promise<boolean> {
  const db = createServerClient()
  if (!db) return false
  const { error } = await db.from('demand_letters').delete().eq('id', id).eq('agency_id', agencyId)
  return !error
}

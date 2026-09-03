/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Multi-broker / Agency system — agencies, white-label branding, role-based
// permissions, and subdomain resolution.
// =============================================================================

import { supabase } from '@/lib/supabase/client'
import { authenticatedFetch } from '@/lib/authenticatedFetch'

// --- Types ---
export interface Agency {
  id: string
  name: string
  slug: string | null
  domain: string | null
  brand_color: string | null
  accent_color: string | null
  logo_url: string | null
  about: string | null
  phone?: string | null
  email?: string | null
  is_active: boolean | null
  created_at?: string | null
  // Trial / plan lifecycle (added by multi_tenant_schema.sql)
  trial_start_date?: string | null
  trial_end_date?: string | null
  trial_active?: boolean | null
  paid_plan_active?: boolean | null
  plan_type?: string | null
  grace_end_date?: string | null
  locked_at?: string | null
  archive_at?: string | null
}

export type AgencyRole = 'admin' | 'broker' | 'associate'

export interface AgencyMember {
  id: string
  agency_id: string
  profile_id: string
  role: AgencyRole
  is_owner: boolean | null
  created_at?: string | null
}

export const AGENCY_ROLES: { id: AgencyRole; label: string }[] = [
  { id: 'admin', label: 'Admin' },
  { id: 'broker', label: 'Broker' },
  { id: 'associate', label: 'Associate' },
]

export const ROLE_PRIORITY: Record<AgencyRole, number> = { admin: 3, broker: 2, associate: 1 }

// --- Agency CRUD ---
export async function fetchAgencies(): Promise<Agency[]> {
  const { data, error } = await supabase.from('agencies').select('*').order('created_at', { ascending: false })
  if (error) {
    console.error('fetchAgencies error:', error)
    throw new Error(error.message || 'Failed to load agencies')
  }
  return (data as Agency[]) || []
}


export async function createAgency(input: Partial<Agency>): Promise<Agency> {
  const { data, error } = await supabase.from('agencies').insert({
    name: input.name, slug: input.slug || null, domain: input.domain || null,
    brand_color: input.brand_color || '#1a1a2e', accent_color: input.accent_color || '#c9a84c',
    logo_url: input.logo_url || null, about: input.about || null, is_active: true,
  }).select().single()
  if (error) throw new Error(error.message || 'Failed to create agency')
  return data as Agency
}

export async function updateAgency(id: string, input: Partial<Agency>): Promise<void> {
  const { error } = await supabase.from('agencies').update(input).eq('id', id)
  if (error) throw new Error(error.message || 'Failed to update agency')
}

export async function deleteAgency(id: string): Promise<void> {
  const { error } = await supabase.from('agencies').delete().eq('id', id)
  if (error) throw new Error(error.message || 'Failed to delete agency')
}

// --- Membership ---
export async function fetchAgencyMembers(agencyId: string): Promise<AgencyMember[]> {
  const { data, error } = await supabase.from('agency_members').select('*').eq('agency_id', agencyId)
  if (error || !data) return []
  return data as AgencyMember[]
}

export async function addAgencyMember(agencyId: string, email: string, role: AgencyRole): Promise<{ added: boolean }> {
  // Server-side route uses the service role — the client insert is blocked by
  // RLS (`agency_members_insert_admin_only` needs role 'admin', not 'owner').
  // Resolves the profile by email; returns added:false when no account exists
  // yet so the UI can fall back to creating an invite.
  const res = await authenticatedFetch('/api/agency/members', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agencyId, email, role }),
  })
  const data = await res.json().catch(() => ({}))
  if (res.ok && data.ok) return { added: true }
  if (data.code === 'NO_PROFILE') return { added: false }
  throw new Error(data.error || 'Failed to add member')
}

export async function updateAgencyMemberRole(memberId: string, role: AgencyRole): Promise<void> {
  const res = await authenticatedFetch('/api/agency/members', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ memberId, role }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to update role')
}

export async function removeAgencyMember(memberId: string): Promise<void> {
  const res = await authenticatedFetch('/api/agency/members', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ memberId }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to remove member')
}

// --- Current user's agency + role ---
export interface UserAgencyContext {
  agency: Agency | null
  role: AgencyRole | null
  isOwner: boolean
  hasRole: (...roles: AgencyRole[]) => boolean
}

export async function fetchUserAgencyContext(): Promise<UserAgencyContext> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { agency: null, role: null, isOwner: false, hasRole: () => false }

  // A user can belong to several agencies. Prefer the owner membership, then
  // the most recently active; NEVER .single() here — multiple rows make
  // PostgREST return 406 and the whole context silently degrades to null
  // (dead billing page, dead purchase buttons).
  const { data: members, error } = await supabase
    .from('agency_members')
    .select('*, agency:agencies(*)')
    .eq('profile_id', user.id)
    .order('created_at', { ascending: false })

  if (error || !members || members.length === 0) {
    return { agency: null, role: null, isOwner: false, hasRole: () => false }
  }

  const member = members.find((m: any) => m.is_owner) || members[0]

  const agency = (member as any).agency as Agency | null
  const role = (member as any).role as AgencyRole
  const isOwner = !!((member as any).is_owner)

  return {
    agency,
    role,
    isOwner,
    hasRole: (...roles: AgencyRole[]) => roles.includes(role!),
  }
}

export const canManageAgency = (ctx: UserAgencyContext) => ctx.isOwner || ctx.hasRole('admin')


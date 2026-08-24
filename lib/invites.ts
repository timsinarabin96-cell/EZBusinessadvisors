// =============================================================================
// Invite-link self-onboarding — professionals & brokers fill their own info.
// The broker sends a magic link (or the person signs up from the website);
// the invitee fills name, firm, photo, phone, etc. and it auto-saves to the
// CRM directory, then appears on the public website. They can subscribe /
// unsubscribe themselves anytime.
// =============================================================================

import { supabase } from '@/lib/supabase/client'

export type InviteTargetType = 'professional' | 'broker'

export interface InviteToken {
  id: string
  token: string
  target_type: InviteTargetType
  target_id: string | null
  agency_id: string | null
  email: string | null
  created_by: string | null
  status: 'sent' | 'filled' | 'revoked'
  expires_at: string | null
  created_at: string
  filled_at: string | null
}

/** Generate a URL-safe random token. */
export function generateInviteToken(): string {
  const rand = new Uint8Array(18)
  crypto.getRandomValues(rand)
  return Array.from(rand, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 24)
}

/** Create an invite record (server-side; returns the row). */
export async function createInviteToken(input: {
  target_type: InviteTargetType
  agency_id?: string | null
  email?: string | null
  created_by?: string | null
  expires_in_days?: number
}): Promise<InviteToken | null> {
  const token = generateInviteToken()
  const expiresAt = new Date(Date.now() + (input.expires_in_days ?? 30) * 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from('invite_tokens')
    .insert({
      token,
      target_type: input.target_type,
      agency_id: input.agency_id || null,
      email: input.email || null,
      created_by: input.created_by || null,
      status: 'sent',
      expires_at: expiresAt,
    })
    .select()
    .single()
  if (error || !data) return null
  return data as InviteToken
}

/** Look up an invite by token (server-side). */
export async function fetchInviteByToken(token: string): Promise<InviteToken | null> {
  const { data, error } = await supabase
    .from('invite_tokens')
    .select('*')
    .eq('token', token)
    .maybeSingle()
  if (error || !data) return null
  return data as InviteToken
}

/** Mark an invite as filled + link it to the created directory row. */
export async function markInviteFilled(token: string, targetId: string): Promise<boolean> {
  const { error } = await supabase
    .from('invite_tokens')
    .update({ status: 'filled', target_id: targetId, filled_at: new Date().toISOString() })
    .eq('token', token)
  return !error
}

/** Self-service subscribe/unsubscribe for a directory row. */
export async function setDirectoryActive(
  targetType: InviteTargetType,
  targetId: string,
  active: boolean,
): Promise<boolean> {
  if (targetType === 'professional') {
    const { error } = await supabase.from('deal_professionals').update({ is_active: active }).eq('id', targetId)
    return !error
  }
  const { error } = await supabase.from('broker_profiles').update({ is_public: active }).eq('id', targetId)
  return !error
}

import { supabase } from '@/lib/supabase/client'

export type AgencyContext = {
  userId: string
  agencyId: string
  role: string
  isOwner: boolean
}

export async function getAgencyContext(): Promise<AgencyContext | null> {
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData.user) return null

  const { data, error } = await supabase
    .from('agency_members')
    .select('agency_id, role, is_owner')
    .eq('profile_id', authData.user.id)
    .order('is_owner', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data?.agency_id) return null

  return {
    userId: authData.user.id,
    agencyId: data.agency_id,
    role: data.role || 'broker',
    isOwner: Boolean(data.is_owner),
  }
}

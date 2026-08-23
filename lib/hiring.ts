// =============================================================================
// Agent Hiring Packages
// -----------------------------------------------------------------------------
// Brokerages hire advisors with structured packages: role, commission split,
// training requirement, certification target, permissions, and a contract
// (IC/employee). Drives the hiring dashboard + agent onboarding.
// =============================================================================

import { createClient } from '@supabase/supabase-js'

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const svc =
  SUPABASE_URL && SERVICE_KEY
    ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
    : null

export interface HiringPackage {
  id: string
  name: string
  role: string
  description: string
  commission_split: number
  base_compensation: number | null
  training_required: boolean
  certification_required: boolean
  permissions: Record<string, unknown>
  is_active: boolean
  created_at: string | null
}

export const DEFAULT_PACKAGES = [
  {
    name: 'Associate Advisor',
    role: 'advisor',
    description: 'Entry advisor: learn the craft, shadow senior brokers, 50/50 split.',
    commission_split: 50,
    base_compensation: null,
    training_required: true,
    certification_required: true,
    permissions: { listings: 'create', leads: 'full', commission_approval: false },
    is_active: true,
  },
  {
    name: 'Senior Advisor',
    role: 'senior_advisor',
    description: 'Experienced advisor with own book of business, 70/30 split.',
    commission_split: 70,
    base_compensation: null,
    training_required: false,
    certification_required: true,
    permissions: { listings: 'full', leads: 'full', commission_approval: false },
    is_active: true,
  },
  {
    name: 'Managing Broker',
    role: 'managing_broker',
    description: 'Runs the office: approves listings, sets splits, mentors team.',
    commission_split: 80,
    base_compensation: 80000,
    training_required: false,
    certification_required: true,
    permissions: { listings: 'approve', leads: 'full', commission_approval: true, hiring: true },
    is_active: true,
  },
] as const

export const PACKAGE_DEFS = DEFAULT_PACKAGES.map((p) => p)

/** Fetch active hiring packages. */
export async function fetchHiringPackages(): Promise<HiringPackage[]> {
  if (!svc) return []
  const { data, error } = await svc
    .from('hiring_packages')
    .select('*')
    .eq('is_active', true)
    .order('commission_split', { ascending: false })
  if (error) return []
  return (data || []) as HiringPackage[]
}

/** Seed default packages if none exist. */
export async function ensureDefaultPackages(): Promise<void> {
  if (!svc) return
  const { count } = await svc.from('hiring_packages').select('id', { count: 'exact', head: true })
  if (count && count > 0) return
  const { error } = await svc.from('hiring_packages').insert(DEFAULT_PACKAGES as unknown as Record<string, unknown>[])
  if (error) console.error('[hiring] seed failed:', error.message)
}

/** Submit an advisor application. */
export async function submitAgentApplication(input: {
  full_name: string
  email: string
  phone?: string
  experience?: string
  package_id?: string | null
}): Promise<{ ok: boolean; error?: string; id?: string }> {
  if (!svc) return { ok: false, error: 'Database is not configured' }
  const { data, error } = await svc
    .from('agent_applications')
    .insert({
      full_name: input.full_name.trim().slice(0, 200),
      email: input.email.trim().slice(0, 200),
      phone: input.phone?.trim().slice(0, 50) || null,
      experience: input.experience?.trim().slice(0, 2000) || null,
      package_id: input.package_id || null,
    })
    .select('id')
    .single()
  if (error) return { ok: false, error: error.message || 'Failed to submit application' }
  return { ok: true, id: data.id }
}

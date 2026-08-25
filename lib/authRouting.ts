// =============================================================================
// authRouting — pure, dependency-free role resolution + login destination.
// Shared by the login page (redirectAfterLogin) and AppShell (nav role) so
// they can NEVER disagree: the same resolver decides where a user lands and
// what they see. Unit-testable without a database.
// =============================================================================

export type PortalRole = 'super_admin' | 'admin' | 'broker' | 'agent' | 'owner'

export interface RoutingProfile {
  role: string | null
  is_owner?: boolean | null
}

export interface RoutingMembership {
  role: string | null
  is_owner: boolean | null
}

/**
 * Resolve the effective portal role using the same precedence as the nav:
 *   1. platform super_admin wins
 *   2. admin (profile.role OR membership role OR is_owner)
 *   3. broker (profile.role OR membership role)
 *   4. agent (any CRM seat)
 *   5. owner (no CRM seat)
 */
export function resolvePortalRole(
  profile: RoutingProfile | null | undefined,
  membership: RoutingMembership | null | undefined,
  hasAnyMembership = false,
): PortalRole {
  if (profile?.role === 'super_admin') return 'super_admin'
  if (profile?.role === 'admin' || membership?.role === 'admin' || membership?.is_owner) return 'admin'
  if (profile?.role === 'broker' || membership?.role === 'broker') return 'broker'
  if (hasAnyMembership || profile?.role === 'agent' || profile?.role === 'admin' || profile?.role === 'broker') return 'agent'
  return 'owner'
}

/**
 * Where should this user land right after login?
 *   super_admin → /admin (see everything)
 *   admin       → /dashboard/command-center (agency admin)
 *   broker      → /listings (deal tools — matches the AppShell nav target)
 *   agent       → /dashboard (daily workspace)
 *   owner       → /dashboard/owner (listing portal)
 */
export function resolveLoginDestination(role: PortalRole): string {
  switch (role) {
    case 'super_admin': return '/admin'
    case 'admin': return '/dashboard/command-center'
    case 'broker': return '/listings'
    case 'agent': return '/dashboard'
    case 'owner': return '/dashboard/owner'
  }
}

/** Human label for the portal, shown on the login confirmation. */
export const PORTAL_LABEL: Record<PortalRole, string> = {
  super_admin: 'Platform Admin',
  admin: 'Agency Admin',
  broker: 'Broker Portal',
  agent: 'Agent Workspace',
  owner: 'Owner Portal',
}

/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

// =============================================================================
// RoleGuard — client-side route protection for role-scoped pages.
// Checks the user's profile role + agency membership (admin/owner) and only
// renders children when permitted. Otherwise shows a friendly locked state.
// Server-side API routes enforce the same rules via canManageAgency.
// =============================================================================

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'

interface RoleGuardProps {
  /** Minimum agency role required: 'admin' (owner/admin) or 'broker' (any CRM member). */
  minAgencyRole?: 'admin' | 'broker'
  /** Alternatively require platform super_admin. */
  requireSuperAdmin?: boolean
  children: React.ReactNode
}

export default function RoleGuard({ minAgencyRole = 'admin', requireSuperAdmin = false, children }: RoleGuardProps) {
  const [state, setState] = useState<'loading' | 'ok' | 'denied'>('loading')

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { if (active) setState('denied'); return }

        const [{ data: profile }, { data: members }] = await Promise.all([
          supabase.from('profiles').select('role').eq('id', user.id).maybeSingle(),
          supabase.from('agency_members').select('role, is_owner').eq('profile_id', user.id),
        ])

        if (requireSuperAdmin) {
          if (active) setState(profile?.role === 'super_admin' ? 'ok' : 'denied')
          return
        }

        const isSuperAdmin = profile?.role === 'super_admin'
        const isAdmin = (members || []).some((m: any) => m.is_owner || m.role === 'admin')
        const isBroker = (members || []).length > 0
        const allowed = isSuperAdmin || (minAgencyRole === 'admin' ? isAdmin : isBroker)
        if (active) setState(allowed ? 'ok' : 'denied')
      } catch {
        if (active) setState('denied')
      }
    })()
    return () => { active = false }
  }, [minAgencyRole, requireSuperAdmin])

  if (state === 'loading') {
    return (
      <div style={{ minHeight: '60vh', display: 'grid', placeItems: 'center' }}>
        <div style={{ color: 'var(--navy)', fontFamily: 'Georgia, serif', fontSize: 16 }}>Checking permissions…</div>
      </div>
    )
  }

  if (state === 'denied') {
    return (
      <div style={{ maxWidth: 520, margin: '80px auto', textAlign: 'center', padding: '0 24px' }}>
        <div style={{ fontSize: 44 }}>🔒</div>
        <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 24, color: '#1a1a2e', margin: '12px 0 8px' }}>Admins only</h1>
        <p style={{ color: '#888', fontSize: 14.5, lineHeight: 1.6 }}>
          {requireSuperAdmin
            ? 'This area is reserved for the platform owner.'
            : 'This area requires an admin or owner role in your agency.'}
        </p>
        <Link href="/dashboard" style={{ display: 'inline-block', marginTop: 18, background: '#1a1a2e', color: '#fff', padding: '11px 26px', borderRadius: 8, textDecoration: 'none', fontWeight: 700 }}>
          Back to Dashboard
        </Link>
      </div>
    )
  }

  return <>{children}</>
}

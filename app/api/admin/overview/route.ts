import { NextRequest, NextResponse } from 'next/server'
import { isPlatformAdmin, getPlatformOverview, fetchAllAgencySettings } from '@/lib/platform'

export const runtime = 'nodejs'

/**
 * GET /api/admin/overview
 * Platform owner (super admin) — full view across ALL tenants:
 * agencies, users, listings, subscriptions, MRR, and per-tenant settings.
 * Anyone else gets 403.
 */
export async function GET(req: NextRequest) {
  if (!(await isPlatformAdmin(req))) {
    return NextResponse.json({ ok: false, error: 'Platform admin access only' }, { status: 403 })
  }
  const [overview, settings] = await Promise.all([getPlatformOverview(), fetchAllAgencySettings()])
  return NextResponse.json({ ok: true, overview, settings })
}

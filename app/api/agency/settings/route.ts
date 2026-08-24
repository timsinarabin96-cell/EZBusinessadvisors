import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, canManageAgency, unauthorizedResponse, forbiddenResponse } from '@/lib/supabase/auth'

export const runtime = 'nodejs'

const MAX_BODY_BYTES = 16 * 1024

// ---------------------------------------------------------------------------
// GET/PUT /api/agency/settings
// Per-CRM tenant configuration — each sold CRM runs on its OWN domain with
// its OWN API keys (DeepSeek, Supabase, Stripe). Agency admins/owners can
// read + update their own settings; the buyer covers all API usage costs.
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const authenticated = await authenticateProfileRequest(req)
  if (!authenticated) return unauthorizedResponse()

  const agencyId = req.nextUrl.searchParams.get('agencyId')
  if (!agencyId || !canManageAgency(authenticated, agencyId)) return forbiddenResponse()

  const { data } = await db.from('agency_settings').select('*').eq('agency_id', agencyId).maybeSingle()
  return NextResponse.json({ ok: true, settings: data || null })
}

export async function PUT(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const authenticated = await authenticateProfileRequest(req)
  if (!authenticated) return unauthorizedResponse()

  const raw = await req.text().catch(() => '')
  if (!raw || Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false, error: 'Invalid or oversized body' }, { status: 400 })
  }

  let body: any = {}
  try {
    body = JSON.parse(raw)
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 })
  }

  const { agencyId, ...patch } = body
  if (!agencyId || !canManageAgency(authenticated, agencyId)) return forbiddenResponse()

  // Whitelist updatable fields — never accept arbitrary columns.
  const allowed = [
    'custom_domain', 'deepseek_api_key', 'deepseek_base_url',
    'supabase_project_url', 'supabase_anon_key', 'supabase_service_key',
    'stripe_secret_key', 'stripe_webhook_secret',
    'ai_provider', 'ai_model', 'platform_name', 'support_email',
  ]
  const clean: Record<string, string> = {}
  for (const key of allowed) {
    if (typeof patch[key] === 'string' && patch[key].trim() !== '') {
      clean[key] = patch[key].trim()
    }
  }
  clean.updated_at = new Date().toISOString()

  const { data, error } = await db
    .from('agency_settings')
    .upsert({ agency_id: agencyId, ...clean }, { onConflict: 'agency_id' })
    .select()
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, settings: data })
}

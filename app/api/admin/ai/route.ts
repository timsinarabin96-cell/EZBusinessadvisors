/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { isPlatformAdmin } from '@/lib/platform'

export const runtime = 'nodejs'

// ---------------------------------------------------------------------------
// /api/admin/ai — AI Control Center (platform owner).
//   GET  — agent toggles, per-tenant AI config status, Twilio/phone config,
//          recent call log (sessions + transcripts)
//   PATCH— toggle an agent on/off (global or per-agency), set Twilio keys,
//          set default AI provider/model
// Super admin only.
// ---------------------------------------------------------------------------

const AGENTS = [
  { key: 'autopilot', label: 'Deal Autopilot' },
  { key: 'deal_doctor', label: 'Deal Doctor' },
  { key: 'red_flags', label: 'Red Flags' },
  { key: 'phone', label: 'Phone Receptionist' },
  { key: 'training', label: 'Training AI' },
  { key: 'marketing', label: 'Marketing AI' },
  { key: 'lead_score', label: 'Lead Scoring' },
]

export async function GET(req: NextRequest) {
  if (!(await isPlatformAdmin(req))) {
    return NextResponse.json({ ok: false, error: 'Platform admin access only' }, { status: 403 })
  }
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  const [configs, agencies, agencySettings, calls, platform] = await Promise.all([
    db.from('ai_agent_config').select('agency_id, agent_key, enabled, model'),
    db.from('agencies').select('id, name, plan_type, paid_plan_active').order('created_at', { ascending: false }).limit(50),
    db.from('agency_settings').select('agency_id, ai_provider, ai_model, deepseek_api_key, custom_domain'),
    db.from('call_sessions').select('id, agency_id, direction, status, started_at, ended_at, summary, provider_call_id').order('started_at', { ascending: false }).limit(20),
    db.from('platform_settings').select('key, value'),
  ])

  // Platform-level key/value settings.
  const settingsMap: Record<string, string> = {}
  for (const s of platform.data || []) settingsMap[s.key] = s.value || ''

  // Agency settings lookup by agency_id.
  const settingsByAgency: Record<string, any> = {}
  for (const s of agencySettings.data || []) settingsByAgency[s.agency_id] = s

  // Merge global + per-agency agent toggles.
  const globalConfig: Record<string, { enabled: boolean; model: string | null }> = {}
  const agencyConfigs: Record<string, Record<string, { enabled: boolean; model: string | null }>> = {}
  for (const c of configs.data || []) {
    const entry = { enabled: c.enabled !== false, model: c.model || null }
    if (!c.agency_id) globalConfig[c.agent_key] = entry
    else {
      agencyConfigs[c.agency_id] = agencyConfigs[c.agency_id] || {}
      agencyConfigs[c.agency_id][c.agent_key] = entry
    }
  }

  const tenants = (agencies.data || []).map((a: any) => {
    const s = settingsByAgency[a.id] || {}
    return {
      agency_id: a.id,
      name: a.name,
      plan: a.plan_type || 'free',
      paid: Boolean(a.paid_plan_active),
      ai_provider: s.ai_provider || settingsMap.ai_provider || 'platform',
      ai_model: s.ai_model || settingsMap.ai_model || 'deepseek-v4-flash',
      has_own_key: Boolean(s.deepseek_api_key),
      custom_domain: s.custom_domain || null,
      agents: AGENTS.map((ag) => ({
        key: ag.key,
        label: ag.label,
        enabled: agencyConfigs[a.id]?.[ag.key]?.enabled ?? globalConfig[ag.key]?.enabled ?? true,
        model: agencyConfigs[a.id]?.[ag.key]?.model ?? globalConfig[ag.key]?.model ?? null,
      })),
    }
  })

  return NextResponse.json({
    ok: true,
    agents: AGENTS.map((ag) => ({
      key: ag.key,
      label: ag.label,
      enabled: globalConfig[ag.key]?.enabled ?? true,
      model: globalConfig[ag.key]?.model ?? null,
    })),
    tenants,
    phone: {
      twilio_sid: settingsMap.twilio_sid ? '••••' + settingsMap.twilio_sid.slice(-4) : null,
      twilio_phone: settingsMap.twilio_from || null,
      configured: Boolean(settingsMap.twilio_sid && settingsMap.twilio_auth_token),
      voice_agent_enabled: globalConfig.phone?.enabled ?? true,
    },
    calls: calls.data || [],
    platform: {
      default_provider: settingsMap.ai_provider || 'deepseek',
      default_model: settingsMap.ai_model || 'deepseek-v4-flash',
    },
  })
}

export async function PATCH(req: NextRequest) {
  if (!(await isPlatformAdmin(req))) {
    return NextResponse.json({ ok: false, error: 'Platform admin access only' }, { status: 403 })
  }
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  let body: any = {}
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Invalid body' }, { status: 400 }) }

  // Toggle agent (global or per-agency).
  if (body.agentKey) {
    const agencyId = body.agencyId || null
    const agentKey = String(body.agentKey)
    const enabled = body.enabled !== false
    const { error } = await db.from('ai_agent_config').upsert({
      agency_id: agencyId,
      agent_key: agentKey,
      enabled,
      model: body.model || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'agency_id,agent_key' })
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // Twilio phone config.
  if (body.twilio) {
    const entries: [string, string][] = []
    if (body.twilio.sid) entries.push(['twilio_sid', String(body.twilio.sid).trim()])
    if (body.twilio.auth_token) entries.push(['twilio_auth_token', String(body.twilio.auth_token).trim()])
    if (body.twilio.from) entries.push(['twilio_from', String(body.twilio.from).trim()])
    for (const [k, v] of entries) {
      await db.from('platform_settings').upsert({ key: k, value: v, updated_at: new Date().toISOString() }, { onConflict: 'key' })
    }
    return NextResponse.json({ ok: true })
  }

  // Default AI provider/model.
  if (body.defaults) {
    const entries: [string, string][] = []
    if (body.defaults.provider) entries.push(['ai_provider', String(body.defaults.provider)])
    if (body.defaults.model) entries.push(['ai_model', String(body.defaults.model)])
    for (const [k, v] of entries) {
      await db.from('platform_settings').upsert({ key: k, value: v, updated_at: new Date().toISOString() }, { onConflict: 'key' })
    }
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ ok: false, error: 'Nothing to update' }, { status: 400 })
}

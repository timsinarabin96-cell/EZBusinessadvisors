// =============================================================================
// Tenant AI config — resolve per-CRM API credentials.
// Each sold CRM runs on its OWN domain with its OWN API keys (stored in
// agency_settings). Server-side helpers return the tenant's DeepSeek/Claude
// credentials when configured, so the AI engine bills the buyer's account.
// =============================================================================

import { createServerClient } from '@/lib/supabase/server'

export interface TenantAiConfig {
  provider: 'deepseek' | 'anthropic' | 'platform'
  apiKey?: string
  baseUrl?: string
  model?: string
}

/** Resolve AI credentials for a user's agency (their sold CRM tenant). */
export async function resolveTenantAiConfig(userId: string | undefined | null): Promise<TenantAiConfig | null> {
  if (!userId) return null
  const db = createServerClient()
  if (!db) return null

  try {
    // 1) Find the user's agency (most recent membership).
    const { data: member } = await db
      .from('agency_members')
      .select('agency_id')
      .eq('profile_id', userId)
      .order('is_owner', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!member?.agency_id) return null

    // 2) Load that tenant's settings.
    const { data: settings } = await db
      .from('agency_settings')
      .select('deepseek_api_key, deepseek_base_url, ai_provider, ai_model')
      .eq('agency_id', member.agency_id)
      .maybeSingle()
    if (!settings) return null

    const provider = settings.ai_provider === 'anthropic' ? 'anthropic' : 'deepseek'
    const apiKey = settings.deepseek_api_key || undefined
    if (!apiKey) return { provider, baseUrl: settings.deepseek_base_url || undefined, model: settings.ai_model || undefined }

    return {
      provider,
      apiKey,
      baseUrl: settings.deepseek_base_url || undefined,
      model: settings.ai_model || undefined,
    }
  } catch {
    return null
  }
}

/** Build the tenant param object for the DeepSeek client. */
export function toDeepSeekTenant(cfg: TenantAiConfig | null) {
  if (!cfg || cfg.provider === 'anthropic' || !cfg.apiKey) return undefined
  return { apiKey: cfg.apiKey, baseUrl: cfg.baseUrl, model: cfg.model }
}

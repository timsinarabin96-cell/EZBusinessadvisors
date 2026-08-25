import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, unauthorizedResponse } from '@/lib/supabase/auth'
import { chatWithDeepSeek } from '@/lib/deepseek/client'
import { DEFAULT_ONBOARDING_STEPS, STEP_HELP } from '@/lib/onboarding'

export const runtime = 'nodejs'

// =============================================================================
// POST /api/onboarding/chat — AI setup guide.
// The bot knows the platform's onboarding steps and answers the new agency
// owner's questions ("how do I add my API key?", "where is my profile?"...).
// =============================================================================

export async function POST(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const body = await req.json().catch(() => ({}))
  const message = String(body.message || '').trim().slice(0, 1000)
  if (!message) return NextResponse.json({ ok: false, error: 'message is required' }, { status: 400 })

  // Onboarding context for the caller's agency.
  let onboarding: any = null
  const { data: onboard } = await db
    .from('agency_onboarding')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (onboard) {
    onboarding = {
      agency_id: onboard.agency_id,
      status: onboard.status,
      plan_type: onboard.plan_type,
      owner_email: onboard.owner_email,
      week_ends_at: onboard.week_ends_at,
      current_step: onboard.current_step,
    }
  }

  const steps = DEFAULT_ONBOARDING_STEPS.map((s) => `${s.key}: ${s.label}`).join('\n')
  const help = Object.entries(STEP_HELP).map(([k, v]) => `${k}: ${v}`).join('\n')

  const system = `You are Yavin, the friendly AI setup guide for the Concord Deal Platform — a business-brokerage CRM. A new agency owner just paid and is setting up their account. Be warm, short, and give exact click-paths (e.g. "Go to Dashboard → Settings → ..."). You know the platform's onboarding steps:\n${steps}\n\nBuilt-in help per step:\n${help}\n\nIf they ask about API keys: tell them to go to Dashboard → Settings → AI Providers, and paste their DeepSeek/OpenAI/Anthropic key so the CRM uses their own account. If they ask about profile: Dashboard → Settings → Profile. First listing: Dashboard → Listings → New. Team: Dashboard → Agents. Keep answers under 120 words.`

  try {
    const res = await chatWithDeepSeek({ system, userMessage: message, maxTokens: 400 })
    return NextResponse.json({ ok: true, reply: res.text })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message || 'AI guide unavailable' }, { status: 500 })
  }
}

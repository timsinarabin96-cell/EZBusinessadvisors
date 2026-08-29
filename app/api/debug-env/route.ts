/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

// GET /api/debug-env — TEMPORARY diagnostic: confirms which env vars are
// visible to the deployed serverless runtime. Remove after AI Assistant fix.
export async function GET() {
  return NextResponse.json({
    ok: true,
    deepseekSet: Boolean(process.env.DEEPSEEK_API_KEY),
    deepseekLen: (process.env.DEEPSEEK_API_KEY || '').length,
    deepseekPrefix: (process.env.DEEPSEEK_API_KEY || '').slice(0, 6),
    agencySet: Boolean(process.env.VOICE_AGENT_AGENCY_ID),
    agencyLen: (process.env.VOICE_AGENT_AGENCY_ID || '').length,
    supabaseUrlSet: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
  })
}

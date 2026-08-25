import { NextRequest, NextResponse } from 'next/server'
import { authenticateProfileRequest, unauthorizedResponse } from '@/lib/supabase/auth'
import { chatWithDeepSeek } from '@/lib/deepseek/client'

export const runtime = 'nodejs'

// =============================================================================
// POST /api/ai/grammar — AI proofread + suggestions for listing copy.
// Body: { text: string, kind?: 'description' | 'public_summary' | 'highlights' }
// Returns: { ok, corrected, suggestions[] } — corrected full text + focused
// improvement tips the agent can apply.
// =============================================================================

export async function POST(req: NextRequest) {
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const body = await req.json().catch(() => ({}))
  const text = String(body.text || '').trim().slice(0, 6000)
  const kind = String(body.kind || 'description')
  if (!text) return NextResponse.json({ ok: false, error: 'text is required' }, { status: 400 })

  const system =
    'You are a professional business-brokerage copy editor. Fix the listing copy: correct grammar, spelling, punctuation, and awkward phrasing; tighten wordiness; keep it factual and confident; do NOT invent facts or numbers. ' +
    'Reply as JSON only: {"corrected": "<full corrected text>", "suggestions": ["<short actionable tip 1>", "<tip 2>", "<tip 3>"]}. ' +
    'Keep the corrected text the same length/scope as the original — no padding, no marketing fluff.'

  try {
    const res = await chatWithDeepSeek({
      system,
      userMessage: `Listing field: ${kind}\n\nOriginal text:\n${text}`,
      jsonMode: true,
      maxTokens: 2000,
    })
    const data = res.data || {}
    const corrected = String(data.corrected || '').trim()
    const suggestions = Array.isArray(data.suggestions) ? data.suggestions.slice(0, 5).map(String) : []
    if (!corrected) return NextResponse.json({ ok: false, error: 'AI returned no corrected text' }, { status: 502 })
    return NextResponse.json({ ok: true, corrected, suggestions })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message || 'Grammar check unavailable' }, { status: 500 })
  }
}

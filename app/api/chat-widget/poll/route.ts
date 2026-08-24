import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

// =============================================================================
// GET /api/chat-widget/poll?session=<web session id>&after=<iso timestamp>
// -----------------------------------------------------------------------------
// Returns assistant messages newer than `after` for the visitor's chat thread.
// The widget polls this every ~2s while waiting for the agent to reply.
// =============================================================================

export async function GET(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'Service unavailable' }, { status: 503 })

  const sessionId = String(req.nextUrl.searchParams.get('session') || '').trim().slice(0, 64)
  const after = String(req.nextUrl.searchParams.get('after') || '').trim()
  if (!sessionId) return NextResponse.json({ ok: false, error: 'session is required' }, { status: 400 })

  const { data: session } = await db
    .from('call_sessions')
    .select('id')
    .eq('caller_number', sessionId)
    .eq('purpose', 'chat_widget')
    .eq('status', 'in_progress')
    .limit(1)
    .maybeSingle()
  if (!session?.id) return NextResponse.json({ ok: true, messages: [] })

  let q = db
    .from('call_transcripts')
    .select('id, speaker, content, created_at')
    .eq('call_session_id', session.id)
    .order('created_at', { ascending: true })
  if (after) q = q.gt('created_at', after)

  const { data: lines, error } = await q.limit(50)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({
    ok: true,
    messages: (lines || []).map((l: any) => ({
      id: l.id,
      role: l.speaker === 'caller' ? 'user' : 'assistant',
      content: l.content,
      created_at: l.created_at,
    })),
  })
}

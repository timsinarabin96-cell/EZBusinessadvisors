// =============================================================================
// AI Call Summaries — deterministic summarization with best-effort AI polish
// -----------------------------------------------------------------------------
// summarizeCall(callId) pulls a voice call session (call_sessions) plus its
// transcript rows (call_transcripts), builds a deterministic summary + action
// items from intent keywords, then attempts a best-effort DeepSeek polish.
// Any AI failure falls back to the deterministic output. Upserts one row per
// call (unique call_id). Never throws.
// =============================================================================

import { createClient } from '@supabase/supabase-js'
import { completeWithDeepSeek } from './deepseek/client'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const svc =
  SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
    : null

// --- Types ------------------------------------------------------------------
export interface CallSummary {
  id: string
  agency_id: string
  call_id: string | null
  transcript_excerpt: string | null
  summary: string
  action_items: string[]
  sentiment: string | null
  model: string | null
  created_at: string
}

export interface CallSummaryResult {
  ok: boolean
  summary?: CallSummary
  error?: string
}

// --- Deterministic engine -----------------------------------------------------
const INTENT_KEYWORDS: Record<string, string[]> = {
  sell: ['sell', 'selling', 'listing', 'valuation', 'exit', 'sale', 'market my', 'appraisal'],
  buy: ['buy', 'buying', 'acquire', 'acquisition', 'purchase', 'looking for', 'interested in'],
  book: ['book', 'schedule', 'appointment', 'meeting', 'call back', 'follow up', 'callback', 'calendar'],
}

const POSITIVE_WORDS = ['great', 'thanks', 'thank', 'interested', 'excited', 'perfect', 'yes', 'good', 'love', 'happy']
const NEGATIVE_WORDS = ['no', 'not', 'never', 'frustrated', 'expensive', 'waste', 'bad', 'disappointed', 'unfortunately', 'decline']

function detectIntents(text: string): string[] {
  const lower = text.toLowerCase()
  const found: string[] = []
  for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS)) {
    if (keywords.some((k) => lower.includes(k))) found.push(intent)
  }
  return found.length > 0 ? found : ['general']
}

function extractKeyPhrases(text: string, intents: string[], max = 3): string[] {
  const lower = text.toLowerCase()
  const keywords = new Set(intents.flatMap((i) => INTENT_KEYWORDS[i] || []))
  const sentences = text
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 15)
  const hits = sentences.filter((s) => [...keywords].some((k) => lower.includes(k)))
  return (hits.length > 0 ? hits : sentences).slice(0, max)
}

function detectSentiment(text: string, fallback: string | null): string {
  if (fallback && fallback.trim()) return fallback
  const lower = text.toLowerCase()
  const pos = POSITIVE_WORDS.filter((w) => lower.includes(w)).length
  const neg = NEGATIVE_WORDS.filter((w) => lower.includes(w)).length
  if (pos > neg) return 'positive'
  if (neg > pos) return 'negative'
  return 'neutral'
}

function buildActionItems(intents: string[]): string[] {
  const items: string[] = []
  if (intents.includes('book')) items.push('Send appointment invite / schedule follow-up call')
  if (intents.includes('sell')) items.push('Prepare valuation or listing package for the seller')
  if (intents.includes('buy')) items.push('Match caller against active listings and share options')
  if (items.length === 0) items.push('Log call notes and determine next step')
  items.push('Follow up within 24 hours')
  return items
}

function formatDuration(durationSeconds: number | null, transcriptLineCount: number): string {
  if (durationSeconds && durationSeconds > 0) {
    const minutes = Math.max(1, Math.round(durationSeconds / 60))
    return `~${minutes} min`
  }
  const estimatedMinutes = Math.max(1, Math.round(transcriptLineCount / 24))
  return `~${estimatedMinutes} min (estimated)`
}

function deterministicSummary(session: any, transcriptText: string, intents: string[], phrases: string[]): string {
  const who = session.caller_name || session.caller_number || 'The caller'
  const intentWord = intents.join(' / ')
  const duration = formatDuration(session.duration_seconds, transcriptText.split('\n').length)
  const phrase = phrases.length > 0 ? ` Key points: ${phrases[0]}.` : ''
  return `${who} called about ${intentWord}. ${phrase} Call lasted ${duration}.`
}

// --- Public API ---------------------------------------------------------------
/**
 * Summarize a voice call session and persist the result.
 * Never throws - returns { ok: false, error } on any failure.
 */
export async function summarizeCall(callId: string): Promise<CallSummaryResult> {
  if (!svc) return { ok: false, error: 'not configured' }
  try {
    // 1. Call session (voice calls live in call_sessions)
    const { data: session, error: sessionError } = await svc
      .from('call_sessions')
      .select('*')
      .eq('id', callId)
      .maybeSingle()
    if (sessionError || !session) return { ok: false, error: sessionError?.message || 'Call session not found' }

    // 2. Transcript rows (call_transcripts, one row per speaker turn)
    const { data: transcripts } = await svc
      .from('call_transcripts')
      .select('speaker, content')
      .eq('call_session_id', callId)
      .order('sequence', { ascending: true })

    const rows = (transcripts || []) as { speaker: string; content: string }[]
    const transcriptText = rows
      .map((row) => `${row.speaker}: ${row.content}`)
      .join('\n')
      .trim()
    const excerpt = transcriptText.slice(0, 400) || '(no transcript available)'

    // 3. Deterministic summary + action items + sentiment
    const intents = detectIntents(transcriptText || session.purpose || '')
    const phrases = extractKeyPhrases(transcriptText || session.purpose || '', intents)
    let summary = deterministicSummary(session, transcriptText, intents, phrases)
    let actionItems = buildActionItems(intents)
    let sentiment = detectSentiment(transcriptText || '', session.sentiment || null)
    let model = 'deterministic'

    // 4. Best-effort AI polish (falls back silently to the deterministic output)
    try {
      const ai = await completeWithDeepSeek({
        context: {
          kind: 'support',
          entityId: callId,
          text: `Call session metadata: purpose=${session.purpose || 'unknown'}, duration=${session.duration_seconds || 'unknown'}s. Transcript:\n${transcriptText || '(empty)'}`,
        },
        message: 'Summarize this sales call: caller intent, key phrases, duration, and a short action-item list.',
        system: 'You summarize business phone calls for a brokerage CRM. Be concise.',
        jsonMode: true,
        maxTokens: 700,
      })
      if (ai.data && typeof ai.data === 'object') {
        const polished = ai.data as { summary?: unknown; action_items?: unknown; sentiment?: unknown }
        if (typeof polished.summary === 'string' && polished.summary.trim()) {
          summary = polished.summary.trim()
          model = 'deepseek'
        }
        if (Array.isArray(polished.action_items) && polished.action_items.length > 0) {
          actionItems = polished.action_items.map(String)
        }
        if (typeof polished.sentiment === 'string' && polished.sentiment.trim()) {
          sentiment = polished.sentiment.trim().toLowerCase()
        }
      }
    } catch {
      // AI unavailable or failed - deterministic output stands
    }

    // 5. Persist (idempotent per call)
    const { data: saved, error: upsertError } = await svc
      .from('call_summaries')
      .upsert(
        {
          agency_id: session.agency_id,
          call_id: session.id,
          transcript_excerpt: excerpt,
          summary,
          action_items: actionItems,
          sentiment,
          model,
        },
        { onConflict: 'call_id' },
      )
      .select('*')
      .single()
    if (upsertError || !saved) return { ok: false, error: upsertError?.message || 'Failed to save summary' }

    return { ok: true, summary: saved as unknown as CallSummary }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Call summarization failed' }
  }
}

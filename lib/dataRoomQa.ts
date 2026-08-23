// =============================================================================
// Data Room AI Q&A
// -----------------------------------------------------------------------------
// Answer natural-language questions about a deal's data room from the file
// index (file_name / notes / file_kind). Answers are deterministic by default
// (keyword match against file names + notes); when the DeepSeek client is
// configured we try an AI-polished answer and fall back silently. Server-only.
// =============================================================================

import { createClient } from '@supabase/supabase-js'
import { completeWithDeepSeek } from './deepseek/client'

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const svc =
  SUPABASE_URL && SERVICE_KEY
    ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
    : null

export interface DataRoomQaRow {
  id: string
  agency_id: string
  data_room_id: string
  question: string
  answer: string | null
  status: string
  created_at: string
  answered_at: string | null
}

export interface DataRoomFileIndex {
  id: string
  file_name: string
  file_kind: string | null
  notes: string | null
}

// ---------------------------------------------------------------------------
// Deterministic keyword matching
// ---------------------------------------------------------------------------
const STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'do', 'does', 'did', 'have', 'has',
  'we', 'you', 'they', 'it', 'this', 'that', 'there', 'any', 'what', 'which', 'who',
  'where', 'when', 'why', 'how', 'of', 'in', 'on', 'at', 'for', 'to', 'and', 'or',
  'with', 'about', 'our', 'their', 'your', 'can', 'could', 'please', 'tell', 'show',
])

function tokenize(s: string): string[] {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
}

/** Score every file in the room against the question. Returns ranked matches. */
export function rankFilesForQuestion(question: string, files: DataRoomFileIndex[]): { file: DataRoomFileIndex; score: number }[] {
  const tokens = tokenize(question)
  if (tokens.length === 0) return []

  const scored: { file: DataRoomFileIndex; score: number }[] = []
  for (const file of files) {
    const nameTokens = tokenize(file.file_name)
    const noteTokens = tokenize(file.notes || '')
    let score = 0
    for (const t of tokens) {
      if (nameTokens.includes(t)) score += 2
      else if ((file.file_name || '').toLowerCase().includes(t)) score += 1
      if (noteTokens.includes(t)) score += 1
      else if ((file.notes || '').toLowerCase().includes(t)) score += 1
    }
    if (score > 0) scored.push({ file, score })
  }
  return scored.sort((a, b) => b.score - a.score)
}

/** Build the deterministic fallback answer from the ranked file matches. */
export function buildDeterministicAnswer(
  question: string,
  files: DataRoomFileIndex[],
  roomName: string,
): { answer: string; relevant: DataRoomFileIndex[] } {
  const ranked = rankFilesForQuestion(question, files)
  const relevant = ranked.map((r) => r.file)
  if (relevant.length === 0) {
    return {
      relevant: [],
      answer:
        `I searched the data room "${roomName}" but could not find documents matching your question. ` +
        `The room currently holds ${files.length} file(s). Try a broader question (for example, "financial statements" or "tax returns"), or ask the seller for the document.`,
    }
  }
  const lines = relevant.slice(0, 8).map((f) => {
    const kind = f.file_kind ? ` (${f.file_kind})` : ''
    const note = f.notes ? ` - ${f.notes}` : ''
    return `- ${f.file_name}${kind}${note}`
  })
  const more = relevant.length > 8 ? `\n...and ${relevant.length - 8} more file(s) with weaker matches.` : ''
  return {
    relevant,
    answer:
      `Based on the data room "${roomName}", I found ${relevant.length} relevant document(s) for "${question}":\n\n` +
      lines.join('\n') +
      more +
      `\n\nOpen the files above in the data room to confirm details.`,
  }
}

// ---------------------------------------------------------------------------
// askQuestion — resolve the room's agency, build the answer, persist a row
// ---------------------------------------------------------------------------
/**
 * Ask a question about a data room and persist the Q&A row.
 * Never throws: on any failure it inserts (or returns) a `failed` row.
 */
export async function askQuestion(
  dataRoomId: string,
  question: string,
): Promise<{ ok: boolean; error?: string; row?: DataRoomQaRow }> {
  const q = (question || '').trim()
  if (!q) return { ok: false, error: 'question is required' }
  if (!svc) return { ok: false, error: 'Database is not configured' }

  // Resolve the data room + its owning agency (data_rooms -> listings.agency_id).
  const { data: room } = await svc
    .from('data_rooms')
    .select('id, name, listing_id, listings(agency_id)')
    .eq('id', dataRoomId)
    .maybeSingle()
  const roomAny = room as unknown as { id?: string; name?: string | null; listings?: { agency_id: string } | null } | null
  const agencyId = roomAny?.listings?.agency_id
  if (!roomAny || !agencyId) return { ok: false, error: 'Data room not found' }
  const roomName = roomAny.name || 'the data room'

  // Fetch the file index (non-deleted files only).
  const { data: files, error: filesError } = await svc
    .from('data_room_files')
    .select('id, file_name, file_kind, notes')
    .eq('data_room_id', dataRoomId)
    .eq('is_deleted', false)
    .order('file_name', { ascending: true })
  if (filesError) {
    return { ok: false, error: filesError.message || 'Failed to read data room files' }
  }
  const index = ((files || []) as unknown[]) as DataRoomFileIndex[]

  // Deterministic answer first — AI can only improve it.
  const deterministic = buildDeterministicAnswer(q, index, roomName)
  let answer = deterministic.answer
  let model = 'deterministic'
  let status = 'answered'

  // Best-effort AI polish with deterministic fallback (silent on failure).
  try {
    const ai = await completeWithDeepSeek({
      context: {
        kind: 'support',
        entityId: dataRoomId,
        text:
          `Data room: ${roomName}. File index:\n` +
          (index.map((f) => `- ${f.file_name}${f.file_kind ? ` [${f.file_kind}]` : ''}${f.notes ? `: ${f.notes}` : ''}`).join('\n') || '(empty)'),
      },
      message: `Answer this broker question about the data room: ${q}. Reference specific files by name when relevant.`,
      system: 'You are a deal data-room assistant for a business brokerage. Be concise and factual; only claim what the file index supports.',
      maxTokens: 500,
    })
    if (ai.text && ai.text.trim()) {
      answer = ai.text.trim() + '\n\nRelevant files:\n' + (deterministic.relevant.map((f) => `- ${f.file_name}`).join('\n') || '- none')
      model = 'deepseek'
    }
  } catch {
    // AI unavailable or failed - deterministic answer stands
  }

  const { data: inserted, error: insertError } = await svc
    .from('data_room_qa')
    .insert({
      agency_id: agencyId,
      data_room_id: dataRoomId,
      question: q,
      answer,
      status,
      answered_at: new Date().toISOString(),
    })
    .select('*')
    .single()

  if (insertError) {
    // Persist a failed row so the broker at least sees the attempt.
    const { data: failed } = await svc
      .from('data_room_qa')
      .insert({ agency_id: agencyId, data_room_id: dataRoomId, question: q, status: 'failed' })
      .select('*')
      .single()
    return { ok: false, error: insertError.message || 'Failed to save Q&A', row: (failed as DataRoomQaRow) || undefined }
  }

  return { ok: true, row: { ...(inserted as DataRoomQaRow), model } as DataRoomQaRow }
}

/** List Q&A history for an agency, optionally filtered to one data room. */
export async function listQuestions(agencyId: string, dataRoomId?: string): Promise<DataRoomQaRow[]> {
  if (!svc) return []
  let q = svc.from('data_room_qa').select('*').eq('agency_id', agencyId).order('created_at', { ascending: false }).limit(100)
  if (dataRoomId) q = q.eq('data_room_id', dataRoomId)
  const { data, error } = await q
  if (error) return []
  return (data || []) as DataRoomQaRow[]
}

/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, unauthorizedResponse } from '@/lib/supabase/auth'
import { completeWithDeepSeek, isDeepSeekConfigured } from '@/lib/deepseek/client'

export const runtime = 'nodejs'

/**
 * POST /api/training/tutor
 * body: { lessonId, message, history?: {role, content}[] }
 *
 * AI Tutor — a Socratic coach for the current lesson. The tutor gets the
 * lesson content + quiz as grounding and answers the broker's questions,
 * pushing them to reason instead of giving answers away. Server-only
 * (DeepSeek key never reaches the browser).
 */
export async function POST(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  if (!isDeepSeekConfigured()) {
    return NextResponse.json({ ok: false, error: 'AI tutor is not configured yet — add DEEPSEEK_API_KEY.' }, { status: 503 })
  }

  const body = await req.json().catch(() => ({}))
  const lessonId = String(body?.lessonId || '')
  const message = String(body?.message || '').trim()
  if (!lessonId || !message) {
    return NextResponse.json({ ok: false, error: 'lessonId and message are required' }, { status: 400 })
  }
  if (message.length > 2000) {
    return NextResponse.json({ ok: false, error: 'Message too long (max 2000 chars)' }, { status: 400 })
  }

  // Pull the lesson + its quiz for grounding.
  const { data: lesson } = await db
    .from('training_lessons')
    .select('id, title, content, module_id')
    .eq('id', lessonId)
    .maybeSingle()
  if (!lesson) return NextResponse.json({ ok: false, error: 'Lesson not found' }, { status: 404 })

  const { data: quizRows } = await db
    .from('training_quiz_questions')
    .select('question')
    .eq('lesson_id', lessonId)
    .limit(20)

  const contentPreview = String(lesson?.content || '').slice(0, 6000)
  const quizPreview = (quizRows || []).map((q) => q.question).join('\n')

  const history = Array.isArray(body?.history)
    ? (body.history as { role?: string; content?: unknown }[])
        .filter((h) => h && (h.role === 'user' || h.role === 'assistant') && typeof h.content === 'string')
        .slice(-10)
        .map((h) => ({ role: h.role as 'user' | 'assistant', content: (h.content as string).slice(0, 1500) }))
    : []

  const system = [
    'You are the CBI Training Tutor — a Socratic coach for business-brokerage students.',
    'You know the current lesson and its quiz. Your job:',
    '1. Help the broker think it through with questions and examples — do NOT just hand over answers.',
    '2. When they are wrong, explain gently and point to the relevant part of the lesson.',
    '3. Tie concepts to real broker workflow (valuations, CIMs, NDAs, SBA, closing).',
    '4. Keep replies under 180 words unless a deep explanation is genuinely needed.',
    '5. If asked something outside the lesson, say so honestly and steer back to the material.',
    'Never invent facts about licensing law — say "verify with your state commission" when relevant.',
  ].join('\n')

  const contextText = [
    `Lesson: ${lesson.title}`,
    contentPreview ? `\n--- LESSON CONTENT ---\n${contentPreview}` : '',
    quizPreview ? `\n--- LESSON QUIZ (questions only) ---\n${quizPreview}` : '',
  ].join('\n')

  try {
    const result = await completeWithDeepSeek({
      context: { kind: 'training', entityId: lessonId, text: contextText },
      history,
      message,
      system,
      maxTokens: 700,
    })
    return NextResponse.json({ ok: true, reply: result.text })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || 'Tutor request failed' }, { status: 500 })
  }
}

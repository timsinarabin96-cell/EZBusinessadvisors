/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Phase 1 — AI Advisor Interview regression tests (spec 08-31).
// Covers: topic coverage model, deterministic question bank (Claude-free
// fallback), completion detection, draft folding, and the API route wiring.
// =============================================================================

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

// Dummy env so the Claude client import inside lib/advisorInterview.ts doesn't
// blow up (pure logic tests — no network).
process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://example.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'dummy'

const {
  ADVISOR_TOPICS,
  DETERMINISTIC_QUESTIONS,
  DETERMINISTIC_QUESTIONS_BY_TOPIC,
  topicsCovered,
  topicsRemaining,
  isAdvisorComplete,
  advisorProgress,
  nextDeterministicQuestion,
  deterministicDraft,
  answerToDraftField,
} = await import('../lib/advisorInterview.ts')

const route = readFileSync('app/api/advisor/interview/route.ts', 'utf8')
const sql = readFileSync('sql/advisor_interviews_2026_08_31.sql', 'utf8')
const lib = readFileSync('lib/advisorInterview.ts', 'utf8')

// Helper: build a Q&A transcript covering every topic with one answer each.
function fullTranscript() {
  return ADVISOR_TOPICS.map((topic, i) => ({
    questionId: DETERMINISTIC_QUESTIONS_BY_TOPIC[topic][0].id,
    topic,
    question: DETERMINISTIC_QUESTIONS_BY_TOPIC[topic][0].question,
    answer: `answer ${i}`,
    answeredAt: new Date().toISOString(),
  }))
}

test('advisor: spec topics are all covered by the bank (business basics → seller financing)', () => {
  assert.deepEqual(
    [...ADVISOR_TOPICS],
    ['business_basics', 'financial_overview', 'operations', 'reason_for_sale', 'transition', 'seller_financing'],
  )
  for (const topic of ADVISOR_TOPICS) {
    assert.ok(DETERMINISTIC_QUESTIONS_BY_TOPIC[topic].length >= 1, `missing questions for ${topic}`)
  }
})

test('advisor: deterministic bank asks every question once (Claude-free fallback path)', () => {
  // Answer ALL questions in the first two topics — the next question must be
  // the first unanswered question of the NEXT topic (no repeats, no stall).
  const qa = ['business_basics', 'financial_overview'].flatMap((topic, i) =>
    DETERMINISTIC_QUESTIONS_BY_TOPIC[topic as (typeof ADVISOR_TOPICS)[number]].map((q, j) => ({
      questionId: q.id,
      topic,
      question: 'q',
      answer: `a${i}-${j}`,
      answeredAt: 'now',
    })),
  )
  const next = nextDeterministicQuestion(qa)
  assert.ok(next, 'must still have a next question after two full topics')
  assert.equal(next!.topic, 'operations')
  assert.equal(next!.id, DETERMINISTIC_QUESTIONS_BY_TOPIC.operations[0].id)
})

test('advisor: completion is topic-driven — all six topics → complete', () => {
  assert.equal(isAdvisorComplete([]), false)
  assert.equal(isAdvisorComplete(fullTranscript()), true)
  assert.equal(advisorProgress([]).total, 6)
  assert.equal(advisorProgress(fullTranscript()).covered, 6)
  assert.deepEqual(topicsRemaining(fullTranscript()), [])
})

test('advisor: topicsCovered/remaining track partial progress', () => {
  const partial = fullTranscript().slice(0, 2)
  assert.equal(topicsCovered(partial).size, 2)
  assert.equal(topicsRemaining(partial).length, 4)
  assert.deepEqual(topicsRemaining(partial)[0], 'operations')
})

test('advisor: deterministic draft folds answers into intake fields (numbers parsed)', () => {
  const qa = [
    {
      questionId: 'bb_industry',
      topic: 'business_basics',
      question: 'What industry?',
      answer: 'Home Care Agency',
      answeredAt: 'now',
    },
    {
      questionId: 'bb_years',
      topic: 'business_basics',
      question: 'Established?',
      answer: '2011',
      answeredAt: 'now',
    },
    {
      questionId: 'fo_revenue',
      topic: 'financial_overview',
      question: 'Revenue?',
      answer: '$1,412,000',
      answeredAt: 'now',
    },
    {
      questionId: 'sf_financing',
      topic: 'seller_financing',
      question: 'Financing?',
      answer: 'Yes',
      answeredAt: 'now',
    },
  ]
  const draft = deterministicDraft(qa)
  assert.equal(draft.industry, 'Home Care Agency')
  assert.equal(draft.established_year, 2011)
  assert.equal(draft.annual_revenue, 1412000)
  assert.equal(draft.seller_financing_available, true)
})

test('advisor: answerToDraftField parses numbers/booleans and caps text', () => {
  const q = DETERMINISTIC_QUESTIONS.find((x) => x.id === 'fo_revenue')!
  assert.deepEqual(answerToDraftField(q, '$95,000'), { key: 'annual_revenue', value: 95000 })
  const qFin = DETERMINISTIC_QUESTIONS.find((x) => x.id === 'sf_financing')!
  assert.deepEqual(answerToDraftField(qFin, 'No'), { key: 'seller_financing_available', value: false })
})

test('advisor: SQL creates the session table — agency-scoped, one row per listing, RLS', () => {
  assert.match(sql, /create table if not exists public\.advisor_interviews/)
  assert.match(sql, /listing_id\s+uuid not null references public\.listings\(id\) on delete cascade/)
  assert.match(sql, /unique \(listing_id\)/)
  assert.match(sql, /qa\s+jsonb not null default '\[\]'::jsonb/)
  assert.match(sql, /draft\s+jsonb/)
  assert.match(sql, /enable row level security/)
  assert.match(sql, /agency_members m on m\.agency_id = l\.agency_id/)
})

test('advisor: API route is auth-gated, agency-checked, adaptive Claude with fallback', () => {
  assert.match(route, /authenticateProfileRequest/)
  assert.match(route, /canManageAgency/)
  assert.match(route, /advisor_interviews/)
  assert.match(route, /nextAdvisorQuestionClaude/)
  assert.match(route, /advisorDraftFromTranscript/)
  assert.match(route, /forbiddenResponse/)
})

test('advisor: Claude path is server-only and falls back deterministically on error', () => {
  assert.match(lib, /import \{ complete, isClaudeConfigured \} from '@\/lib\/claude\/client'/)
  assert.match(lib, /catch \{[\s\S]*return nextDeterministicQuestion\(qa\)/)
  assert.match(lib, /Never invent financial figures/)
})

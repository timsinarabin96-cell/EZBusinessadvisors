import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  BUYER_STAGES,
  STAGE_META,
  ACTIVE_STAGES,
  stageIndex,
  isStageAfter,
  computeHeatScore,
  heatBand,
  NQA_QUESTIONS,
  scoreNqa,
  nqaVerdict,
  ESCALATION_LADDER,
  nextLadderStep,
  computeClosingRunway,
  CLOSING_RUNWAY_TASKS,
  pipelineFunnel,
  conversionRate,
} from '../lib/buyerPipelineCore.ts'

const schema = readFileSync('sql/buyer_pipeline_engine_schema.sql', 'utf8')
const api = readFileSync('app/api/buyers/pipeline/route.ts', 'utf8')
const board = readFileSync('components/buyers/BuyerPipelineBoard.tsx', 'utf8')
const lib = readFileSync('lib/buyerPipeline.ts', 'utf8')
const step9 = readFileSync('components/listings/Step9BuyerManagement.tsx', 'utf8')
const insights = readFileSync('components/studio/StudioInsights.tsx', 'utf8')
const studio = readFileSync('components/studio/AIDealStudio.tsx', 'utf8')

// --- Core: stages -----------------------------------------------------------
test('pipeline has the full buyer journey stages', () => {
  assert.deepEqual(BUYER_STAGES, ['new', 'contacted', 'nda_sent', 'nda_signed', 'qualified', 'data_room', 'loi', 'negotiation', 'closed', 'lost'])
  assert.equal(BUYER_STAGES.length, 10)
  for (const s of BUYER_STAGES) {
    assert.ok(STAGE_META[s].label, `stage ${s} has a label`)
    assert.ok(STAGE_META[s].icon)
  }
})

test('active stages exclude terminal states', () => {
  assert.ok(ACTIVE_STAGES.includes('qualified'))
  assert.ok(!ACTIVE_STAGES.includes('closed'))
  assert.ok(!ACTIVE_STAGES.includes('lost'))
})

test('stage ordering is monotonic', () => {
  assert.equal(stageIndex('new'), 0)
  assert.equal(stageIndex('closed'), 8)
  assert.equal(stageIndex('lost'), 9)
  assert.ok(isStageAfter('qualified', 'nda_signed'))
  assert.ok(!isStageAfter('nda_signed', 'qualified'))
})

// --- Core: heat --------------------------------------------------------------
test('heat score rewards NDA, qualification, activity, offers', () => {
  const cold = computeHeatScore({})
  const hot = computeHeatScore({ ndaSigned: true, financiallyQualified: true, dataRoomViews: 5, recentReplies: 3, hasOffer: true })
  assert.ok(hot > cold)
  assert.ok(hot >= 40)
  assert.ok(cold < 40)
})

test('heat score decays with inactivity', () => {
  const active = computeHeatScore({ dataRoomViews: 3, daysSinceActivity: 1 })
  const stale = computeHeatScore({ dataRoomViews: 3, daysSinceActivity: 30 })
  assert.ok(active > stale)
})

test('heat score is clamped to 0-100', () => {
  const maxed = computeHeatScore({ ndaSigned: true, financiallyQualified: true, dataRoomViews: 10, recentReplies: 10, hasOffer: true, fitScore: 100 })
  assert.ok(maxed <= 100)
  const floor = computeHeatScore({ daysSinceActivity: 400 })
  assert.ok(floor >= 0)
})

test('heat bands label hot/warm/cool/cold', () => {
  assert.equal(heatBand(85).label, '🔥 Hot')
  assert.equal(heatBand(50).label, 'Warm')
  assert.equal(heatBand(20).label, 'Cool')
  assert.equal(heatBand(5).label, 'Cold')
})

// --- Core: NQA ---------------------------------------------------------------
test('NQA questionnaire covers budget, funds, timeline, industry, location, experience', () => {
  const keys = NQA_QUESTIONS.map((q) => q.key)
  for (const k of ['budget', 'funds', 'timeline', 'industry', 'location', 'experience']) {
    assert.ok(keys.includes(k), `missing NQA key ${k}`)
  }
})

test('NQA scoring rewards good answers and penalizes gaps', () => {
  const strong = scoreNqa({ budget: '$1M-2M', funds: 'yes, cash', timeline: 'immediately', industry: 'HVAC', location: 'PA', experience: 'yes, 10 years' })
  const weak = scoreNqa({})
  const partial = scoreNqa({ budget: '$1M-2M' })
  assert.ok(strong > partial)
  assert.ok(partial > weak)
  assert.ok(strong >= 70)
  assert.equal(weak, 0)
})

test('NQA verdicts map to qualified/review/not_fit', () => {
  assert.equal(nqaVerdict(90).verdict, 'qualified')
  assert.equal(nqaVerdict(50).verdict, 'review')
  assert.equal(nqaVerdict(10).verdict, 'not_fit')
})

// --- Core: escalation ladder -------------------------------------------------
test('escalation ladder is day-based: 1, 3, 7, 14', () => {
  assert.deepEqual(ESCALATION_LADDER.map((s) => s.day), [1, 3, 7, 14])
  assert.equal(ESCALATION_LADDER[2].channel, 'call')
  assert.equal(ESCALATION_LADDER[3].channel, 'email_final')
})

test('next ladder step picks the furthest due step', () => {
  assert.equal(nextLadderStep(0), null)
  assert.equal(nextLadderStep(2)?.day, 1)
  assert.equal(nextLadderStep(8)?.day, 7)
  assert.equal(nextLadderStep(20)?.day, 14)
})

// --- Core: closing runway -----------------------------------------------------
test('closing runway schedules tasks backward from close date', () => {
  // Local date-only (new Date('2026-12-31') parses as UTC and shifts a day in ET).
  const close = new Date(2026, 11, 31)
  const runway = computeClosingRunway(close)
  assert.equal(runway.length, CLOSING_RUNWAY_TASKS.length)
  const escrow = runway.find((r) => r.key === 'escrow')
  assert.ok(escrow)
  // Escrow due 14 days before close.
  assert.equal(escrow.dueDate, '2026-12-17')
})

test('closing runway flags overdue tasks', () => {
  const yesterday = new Date(Date.now() - 86400000).toISOString()
  const runway = computeClosingRunway(yesterday)
  assert.ok(runway.some((r) => r.overdue))
})

// --- Core: funnel --------------------------------------------------------------
test('pipeline funnel counts buyers per stage', () => {
  const funnel = pipelineFunnel([{ pipeline_stage: 'new' }, { pipeline_stage: 'new' }, { pipeline_stage: 'qualified' }])
  assert.equal(funnel.new, 2)
  assert.equal(funnel.qualified, 1)
  assert.equal(funnel.closed, 0)
})

test('conversion rate computes stage-to-stage', () => {
  const funnel = { new: 10, contacted: 8, nda_signed: 4, closed: 1 }
  assert.equal(conversionRate(funnel, 'new', 'contacted'), 80)
  assert.equal(conversionRate(funnel, 'new', 'closed'), 10)
  assert.equal(conversionRate({ new: 0 }, 'new', 'closed'), null)
})

// --- Schema -------------------------------------------------------------------
test('schema adds pipeline stage, heat, consent to buyer_lists', () => {
  assert.match(schema, /pipeline_stage text not null default 'new'/)
  assert.match(schema, /heat_score integer not null default 0/)
  assert.match(schema, /competitive_consent boolean/)
  assert.match(schema, /stage_entered_at timestamptz/)
})

test('schema creates auto-log pipeline events + NQA tables with RLS', () => {
  assert.match(schema, /create table if not exists public.buyer_pipeline_events/)
  assert.match(schema, /create table if not exists public.buyer_nqa_responses/)
  assert.match(schema, /enable row level security/)
  assert.match(schema, /agency_members am where am.agency_id/)
})

test('schema adds competitive board consent to listings', () => {
  assert.match(schema, /competitive_board_enabled boolean not null default false/)
  assert.match(schema, /competitive_board_consented_at timestamptz/)
})

// --- API -----------------------------------------------------------------------
test('pipeline API is agency-gated (IDOR guard)', () => {
  assert.match(api, /canManageAgency/)
  assert.match(api, /forbiddenResponse\(\)/)
  assert.match(api, /unauthorizedResponse\(\)/)
})

test('pipeline API validates stage moves', () => {
  assert.match(api, /toStage: z\.enum\(BUYER_STAGES\)/)
  assert.match(api, /buyerListId: z\.string\(\)\.uuid\(\)/)
})

test('pipeline API supports NQA + competitive actions', () => {
  assert.match(api, /action: z\.literal\('nqa'\)/)
  assert.match(api, /action: z\.literal\('competitive'\)/)
})

// --- Server lib ------------------------------------------------------------------
test('pipeline server lib auto-logs stage changes to events + communications', () => {
  assert.match(lib, /buyer_pipeline_events/)
  assert.match(lib, /logCommunication/)
  assert.match(lib, /Pipeline: \$\{fromStage\} → \$\{toStage\}/)
})

test('pipeline server lib auto-qualifies strong NQA scores', () => {
  assert.match(lib, /financial_qualified: true/)
  assert.match(lib, /NQA \$\{score\}\/100/)
})

// --- UI ---------------------------------------------------------------------------
test('kanban board renders all stages with funnel strip', () => {
  assert.match(board, /COMPACT_STAGES/)
  assert.match(board, /heatBand/)
  assert.match(board, /📊 Pipeline:/)
})

test('kanban board has one-click stage moves + buyer 360 drawer', () => {
  assert.match(board, /move\(b, 1\)/)
  assert.match(board, /move\(b, -1\)/)
  assert.match(board, /Buyer 360/)
  assert.match(board, /Quick qualify \(NQA\)/)
})

test('Step 9 embeds the pipeline board', () => {
  assert.match(step9, /BuyerPipelineBoard listingId=\{listingId\}/)
})

test('competitive board consent card is wired into Go Live rail', () => {
  assert.match(insights, /export function CompetitiveBoardCard/)
  assert.match(studio, /<CompetitiveBoardCard listingId=\{listingId\} enabled=\{!!listing\?\.competitive_board_enabled\} \/>/)
})

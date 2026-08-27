import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const ladderApi = readFileSync('app/api/followups/ladder/route.ts', 'utf8')
const postCloseApi = readFileSync('app/api/post-close/route.ts', 'utf8')
const postCloseLib = readFileSync('lib/postCloseEngine.ts', 'utf8')
const postCloseSchema = readFileSync('sql/post_close_engine_schema.sql', 'utf8')
const statsApi = readFileSync('app/api/buyers/pipeline-stats/route.ts', 'utf8')
const timelineApi = readFileSync('app/api/deals/timeline/route.ts', 'utf8')
const ladderCard = readFileSync('components/buyers/FollowUpLadderCard.tsx', 'utf8')
const postCloseCard = readFileSync('components/buyers/PostCloseCard.tsx', 'utf8')
const timelineCard = readFileSync('components/buyers/DealTimelineCard.tsx', 'utf8')
const dashboard = readFileSync('components/buyers/PipelineDashboard.tsx', 'utf8')
const studio = readFileSync('components/studio/AIDealStudio.tsx', 'utf8')

// --- Escalation ladder API ---------------------------------------------------
test('ladder API is agency-gated and returns ladder steps', () => {
  assert.match(ladderApi, /canManageAgency/)
  assert.match(ladderApi, /forbiddenResponse\(\)/)
  assert.match(ladderApi, /nextLadderStep/)
  assert.match(ladderApi, /ladderStep/)
})

test('ladder AI composer drafts but never auto-sends', () => {
  assert.match(ladderApi, /Sending stays a one-tap human decision — nothing auto-sends\./)
  assert.match(ladderApi, /One short text message, under 50 words/)
  assert.match(ladderApi, /Return ONLY the message text/)
  assert.match(ladderCard, /You approve before anything sends/)
})

test('ladder composer pulls last interaction for personalization', () => {
  assert.match(ladderApi, /communications/)
  assert.match(ladderApi, /Last interaction/)
})

// --- Post-close engine ---------------------------------------------------------
test('post-close lib schedules the full golden-referral sequence', () => {
  assert.match(postCloseLib, /schedulePostCloseSequence/)
  assert.match(postCloseLib, /day90/)
  assert.match(postCloseLib, /referral_ask/)
  assert.match(postCloseLib, /testimonial_ask/)
  assert.match(postCloseLib, /yearly_valuation/)
})

test('post-close sequence offsets are 90/95/100/365 days', () => {
  assert.match(postCloseLib, /day90: 90/)
  assert.match(postCloseLib, /referral_ask: 95/)
  assert.match(postCloseLib, /testimonial_ask: 100/)
  assert.match(postCloseLib, /yearly_valuation: 365/)
})

test('post-close schema has agency RLS + due index', () => {
  assert.match(postCloseSchema, /create table if not exists public.post_close_checkins/)
  assert.match(postCloseSchema, /enable row level security/)
  assert.match(postCloseSchema, /post_close_checkins_due_idx/)
  assert.match(postCloseSchema, /checkin_type/)
})

test('post-close API is agency-gated with schedule + patch actions', () => {
  assert.match(postCloseApi, /action: z\.literal\('schedule'\)/)
  assert.match(postCloseApi, /checkinId: z\.string\(\)\.uuid\(\)/)
  assert.match(postCloseApi, /canManageAgency/)
})

// --- Pipeline stats API ---------------------------------------------------------
test('pipeline-stats API aggregates agency-wide funnel', () => {
  assert.match(statsApi, /pipelineFunnel/)
  assert.match(statsApi, /conversionRate/)
  assert.match(statsApi, /perListing/)
  assert.match(statsApi, /heat/)
})

test('pipeline-stats API is agency-gated', () => {
  assert.match(statsApi, /canManageAgency/)
  assert.match(statsApi, /forbiddenResponse\(\)/)
})

// --- Deal timeline API ------------------------------------------------------------
test('deal timeline merges pipeline events, communications, offers, data room, files', () => {
  assert.match(timelineApi, /buyer_pipeline_events/)
  assert.match(timelineApi, /communications/)
  assert.match(timelineApi, /deal_offers/)
  assert.match(timelineApi, /data_room_activity/)
  assert.match(timelineApi, /financial_documents/)
})

test('deal timeline is agency-gated and sorted newest first', () => {
  assert.match(timelineApi, /canManageAgency/)
  assert.match(timelineApi, /sort\(\(a, b\) => new Date\(b\.at\)/)
})

// --- UI ----------------------------------------------------------------------------
test('ladder card shows day-based badges and AI draft flow', () => {
  assert.match(ladderCard, /No-reply ladder/)
  assert.match(ladderCard, /Day \{it\.ladderStep\.day\}/)
  assert.match(ladderCard, /AI-draft follow-up/)
})

test('post-close card shows due check-ins with mark-sent actions', () => {
  assert.match(postCloseCard, /Golden referrals/)
  assert.match(postCloseCard, /Mark sent/)
  assert.match(postCloseCard, /due \{new Date\(it\.due_at\)/)
})

test('deal timeline card renders unified event stream', () => {
  assert.match(timelineCard, /Deal timeline/)
  assert.match(timelineCard, /events\.map/)
  assert.match(timelineCard, /e\.kind/)
})

test('pipeline dashboard shows funnel + heat + per-listing breakdown', () => {
  assert.match(dashboard, /Funnel/)
  assert.match(dashboard, /Buyer heat/)
  assert.match(dashboard, /Per listing/)
  assert.match(dashboard, /conversions/)
})

test('Wave C+D cards are wired into the studio Sell rail', () => {
  assert.match(studio, /<FollowUpLadderCard \/>/)
  assert.match(studio, /<PostCloseCard \/>/)
  assert.match(studio, /<DealTimelineCard listingId=\{listingId\} \/>/)
})

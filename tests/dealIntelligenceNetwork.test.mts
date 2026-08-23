import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { getAiActionPolicy } from '../lib/aiPolicy.mjs'

const schema = readFileSync('sql/deal_intelligence_network_schema.sql', 'utf8')

test('deal intelligence schema includes every strategic module', () => {
  for (const table of ['deal_passports', 'deal_fact_evidence', 'data_room_ai_queries', 'relationship_edges', 'buyer_engagement_scores', 'deal_offers', 'value_growth_plans', 'exchange_partnerships', 'exchange_opportunities', 'transition_plans', 'agent_performance_snapshots', 'trust_center_settings']) {
    assert.match(schema, new RegExp(`create table if not exists public\\.${table}`))
  }
})

test('intelligence tables are tenant isolated and anonymous access is revoked', () => {
  assert.match(schema, /public\.is_agency_member\(agency_id\)/)
  assert.match(schema, /public\.is_agency_member\(origin_agency_id\)/)
  assert.match(schema, /from anon/)
  assert.doesNotMatch(schema, /to authenticated using \(true\)/)
})

test('permission-aware AI records allowed and cited files', () => {
  assert.match(schema, /allowed_file_ids uuid\[\]/)
  assert.match(schema, /cited_file_ids uuid\[\]/)
  assert.match(schema, /redactions_applied jsonb/)
  assert.match(schema, /blocked_reason text/)
})

test('safe intelligence analysis can automate', () => {
  assert.equal(getAiActionPolicy('deal_passport.analyze').approvalRequired, false)
  assert.equal(getAiActionPolicy('buyer_engagement.score').approvalRequired, false)
  assert.equal(getAiActionPolicy('offer.compare_draft').approvalRequired, false)
})

test('sensitive deal actions require approval', () => {
  for (const action of ['deal_fact.verify', 'buyer.disclosure_expand', 'exchange.publish', 'offer.accept', 'relationship.introduction_send']) {
    const policy = getAiActionPolicy(action)
    assert.equal(policy.allowed, true)
    assert.equal(policy.approvalRequired, true)
  }
})

test('trust center remains brokerage-specific legal content', () => {
  const page = readFileSync('app/(public)/marketplace/trust/page.tsx', 'utf8')
  assert.match(page, /Each brokerage must publish its own approved legal/)
  assert.match(page, /Permission-aware AI/)
  assert.match(page, /Evidence-backed answers/)
})

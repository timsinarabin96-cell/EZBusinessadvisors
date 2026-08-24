import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync('lib/listingIntelligence.ts', 'utf8')

test('listing studio separates public metadata from the private listing identity', () => {
  assert.match(source, /business_name: input\.business_name\.trim\(\)/)
  assert.match(source, /ai_metadata:\s*\{/)
  assert.match(source, /public_title:/)
  assert.match(source, /public_summary:/)
  assert.match(source, /public_highlights:/)
})

test('new listings remain draft until review and approval', () => {
  assert.match(source, /review_stage: 'draft'/)
  assert.match(source, /status: 'draft'/)
  assert.match(source, /seller_approval_reference/)
})

test('readiness considers financial, operating, and public quality', () => {
  for (const requiredSignal of ['annual_revenue', 'sde', 'ebitda', 'competitive_advantages', 'growth_opportunities', 'public_summary']) {
    assert.match(source, new RegExp(requiredSignal))
  }
  assert.match(source, /Approval ready/)
})

test('no auto-push to external marketplaces — syndication is manual', () => {
  const publishSource = readFileSync('lib/publish.ts', 'utf8')
  assert.doesNotMatch(publishSource, /from ['"]@\/lib\/bbs['"]/)
  assert.match(publishSource, /No auto-push to\n\s*\/\/      external marketplaces/)
})

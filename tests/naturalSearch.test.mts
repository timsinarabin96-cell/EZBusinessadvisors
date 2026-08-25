import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const lib = readFileSync('lib/naturalSearch.ts', 'utf8')
const page = readFileSync('app/(public)/marketplace/listings/page.tsx', 'utf8')
const client = readFileSync('components/public/SearchListingsClient.tsx', 'utf8')
const marketplace = readFileSync('lib/marketplace.ts', 'utf8')
const card = readFileSync('components/public/PublicListingCard.tsx', 'utf8')

test('nl search: parser is rule-based and zero-token (no LLM imports)', () => {
  assert.match(lib, /export function parseNaturalQuery/)
  assert.match(lib, /INDUSTRY_ALIASES/)
  assert.match(lib, /Zero tokens, zero cost/)
  assert.doesNotMatch(lib, /deepseek|claude|anthropic|openai/i)
  assert.match(lib, /MONEY_PATTERN/)
  assert.match(lib, /STATE_ABBREVS/)
})

test('nl search: industry aliases map to canonical categories', () => {
  assert.match(lib, /laundromat: 'Laundromat'/)
  assert.match(lib, /'car wash': 'Car Wash'/)
  assert.match(lib, /'convenience store': 'Convenience Store'/)
  assert.match(lib, /'e-commerce': 'E-Commerce'/)
  assert.match(lib, /'home care': 'Home Care'/)
})

test('nl search: money parsing handles k/m suffixes', () => {
  assert.match(lib, /under\|below\|less than\|up to\|at most\|max/)
  assert.match(lib, /k\|m\|million\|thousand\|billion/)
  assert.match(lib, /if \(s\.startsWith\('m'\)\) return value \* 1_000_000/)
  assert.match(lib, /if \(s\.startsWith\('k'\)/)
})

test('nl search: boolean flags for absentee/franchise/financing/relocatable', () => {
  assert.match(lib, /absenteeOnly = true/)
  assert.match(lib, /franchiseOnly = true/)
  assert.match(lib, /financingAvailable = true/)
  assert.match(lib, /relocatableOnly = true/)
  assert.match(lib, /maxSdeMultiple/)
})

test('nl search: listings page wires parser into filter submission', () => {
  assert.match(page, /SearchListingsClient/)
  assert.match(client, /parseNaturalQuery/)
  assert.match(client, /parsed\.maxPrice/)
  assert.match(client, /parsed\.absenteeOnly/)
  assert.match(client, /parsed\.financingAvailable/)
})

test('nl search: marketplace search supports new advanced filters', () => {
  assert.match(marketplace, /maxSdeMultiple/)
  assert.match(marketplace, /absenteeOnly/)
  assert.match(marketplace, /franchiseOnly/)
  assert.match(marketplace, /financingAvailable/)
  assert.match(marketplace, /relocatableOnly/)
  assert.match(marketplace, /minEmployees/)
})

test('nl search: public feed exposes marketing flags', () => {
  assert.match(marketplace, /is_absentee_owner/)
  assert.match(marketplace, /is_franchise/)
  assert.match(marketplace, /is_relocatable/)
  assert.match(marketplace, /seller_financing_available/)
  assert.match(marketplace, /established_year/)
  assert.match(marketplace, /employees_full_time/)
})

test('website: card shows marketing badges', () => {
  assert.match(card, /Financing/)
  assert.match(card, /Absentee/)
  assert.match(card, /Franchise/)
  assert.match(card, /Relocatable/)
  assert.match(card, /Featured/)
  assert.match(card, /NEW/)
  assert.match(card, /BadgeTone/)
})

test('website: listings page has advanced filter controls', () => {
  assert.match(client, /Max SDE multiple/)
  assert.match(client, /Min FT employees/)
  assert.match(client, /🏖️ Absentee/)
  assert.match(client, /🏷️ Franchise/)
  assert.match(client, /💰 Financing/)
})

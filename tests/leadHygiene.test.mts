import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const lib = readFileSync('lib/leads2.ts', 'utf8')
const core = readFileSync('lib/leadDedupCore.ts', 'utf8')
const wrapper = readFileSync('lib/leadDedup.ts', 'utf8')
const dash = readFileSync('components/leads/LeadsDashboard.tsx', 'utf8')
const modal = readFileSync('components/leads/LeadFormModal.tsx', 'utf8')
const sql = readFileSync('sql/lead_hygiene_schema.sql', 'utf8')

// Import the pure helpers (dependency-free core — no path aliases).
const { normalizeEmail, normalizePhone, normalizeName, findDuplicateGroups, findCrossKindPairs } =
  await import('../lib/leadDedupCore.ts')

// ---------------------------------------------------------------------------
// Pure normalization
// ---------------------------------------------------------------------------
test('lead-dedup: normalizes emails case/space-insensitively', () => {
  assert.equal(normalizeEmail('  John.Doe@Example.COM '), 'john.doe@example.com')
  assert.equal(normalizeEmail(null), '')
  assert.equal(normalizeEmail(''), '')
})

test('lead-dedup: normalizes phones to digits and strips US country code', () => {
  assert.equal(normalizePhone('(717) 555-0132'), '7175550132')
  assert.equal(normalizePhone('+1 717 555 0132'), '7175550132')
  assert.equal(normalizePhone('1-800-555-0199'), '8005550199')
  assert.equal(normalizePhone(null), '')
  // 10 digits stays as-is; a real 11-digit number is NOT stripped
  assert.equal(normalizePhone('447700900123'), '447700900123')
})

test('lead-dedup: normalizes names', () => {
  assert.equal(normalizeName('  John   Smith '), 'john smith')
  assert.equal(normalizeName(null), '')
})

// ---------------------------------------------------------------------------
// Duplicate grouping (union-find)
// ---------------------------------------------------------------------------
test('lead-dedup: groups leads sharing the same email', () => {
  const leads = [
    { kind: 'buyer', id: 'a', email: 'JOHN@example.com', phone: null },
    { kind: 'buyer', id: 'b', email: 'john@example.com', phone: null },
    { kind: 'buyer', id: 'c', email: 'other@example.com', phone: null },
  ]
  const groups = findDuplicateGroups(leads as any)
  assert.equal(groups.length, 1)
  assert.deepEqual(groups[0].members.map((m) => m.id).sort(), ['a', 'b'])
  assert.ok(groups[0].reason.includes('email'))
})

test('lead-dedup: groups leads sharing the same phone', () => {
  const leads = [
    { kind: 'seller', id: 'a', email: null, phone: '(717) 555-0132' },
    { kind: 'seller', id: 'b', email: null, phone: '7175550132' },
  ]
  const groups = findDuplicateGroups(leads as any)
  assert.equal(groups.length, 1)
  assert.ok(groups[0].reason.includes('phone'))
})

test('lead-dedup: chains groups via union-find (email on one, phone on another)', () => {
  const leads = [
    { kind: 'buyer', id: 'a', email: 'same@x.com', phone: '1112223333' },
    { kind: 'buyer', id: 'b', email: 'same@x.com', phone: null },
    { kind: 'buyer', id: 'c', email: null, phone: '1112223333' },
  ]
  const groups = findDuplicateGroups(leads as any)
  assert.equal(groups.length, 1)
  assert.equal(groups[0].members.length, 3)
  assert.ok(groups[0].reason.includes('email') && groups[0].reason.includes('phone'))
})

test('lead-dedup: ignores junk phones (too short) and empty leads', () => {
  const leads = [
    { kind: 'buyer', id: 'a', email: null, phone: '123' },
    { kind: 'buyer', id: 'b', email: null, phone: 'N/A' },
    { kind: 'buyer', id: 'c', email: null, phone: null },
  ]
  assert.equal(findDuplicateGroups(leads as any).length, 0)
})

test('lead-dedup: sorts members oldest → newest by created_at', () => {
  const leads = [
    { kind: 'buyer', id: 'newer', email: 'x@x.com', created_at: '2026-08-20T00:00:00Z' },
    { kind: 'buyer', id: 'older', email: 'x@x.com', created_at: '2026-08-01T00:00:00Z' },
  ]
  const groups = findDuplicateGroups(leads as any)
  assert.equal(groups[0].members[0].id, 'older')
})

// ---------------------------------------------------------------------------
// Cross-kind detection: same person as buyer AND seller
// ---------------------------------------------------------------------------
test('lead-dedup: flags the same person as buyer and seller', () => {
  const buyers = [{ kind: 'buyer', id: 'b1', email: 'sam@x.com', phone: '7175550100' }]
  const sellers = [{ kind: 'seller', id: 's1', email: 'SAM@x.com', phone: null }]
  const pairs = findCrossKindPairs(buyers as any, sellers as any)
  assert.equal(pairs.length, 1)
  assert.equal(pairs[0].via, 'email')
  assert.equal(pairs[0].seller.id, 's1')
})

test('lead-dedup: cross-kind match by phone too', () => {
  const buyers = [{ kind: 'buyer', id: 'b1', email: null, phone: '(717) 555-0100' }]
  const sellers = [{ kind: 'seller', id: 's1', email: null, phone: '7175550100' }]
  const pairs = findCrossKindPairs(buyers as any, sellers as any)
  assert.equal(pairs.length, 1)
  assert.equal(pairs[0].via, 'phone')
})

test('lead-dedup: no false cross-kind matches', () => {
  const buyers = [{ kind: 'buyer', id: 'b1', email: 'a@x.com', phone: '1112223333' }]
  const sellers = [{ kind: 'seller', id: 's1', email: 'b@x.com', phone: '4445556666' }]
  assert.equal(findCrossKindPairs(buyers as any, sellers as any).length, 0)
})

// ---------------------------------------------------------------------------
// Wiring: wrapper re-exports, dashboard renders hygiene UI, merge exists
// ---------------------------------------------------------------------------
test('lead-dedup: wrapper re-exports the core helpers', () => {
  for (const name of ['normalizeEmail', 'normalizePhone', 'findDuplicateGroups', 'findCrossKindPairs']) {
    assert.ok(wrapper.includes(name), `wrapper missing ${name}`)
  }
})

test('lead-dedup: dashboard imports and renders the hygiene panel + merge action', () => {
  assert.ok(dash.includes("findDuplicateGroups"), 'dashboard missing findDuplicateGroups import')
  assert.ok(dash.includes('findCrossKindPairs'), 'dashboard missing findCrossKindPairs import')
  assert.ok(dash.includes('🧹 Lead hygiene'), 'dashboard missing hygiene panel')
  assert.ok(dash.includes('mergeLeads'), 'dashboard missing mergeLeads')
  assert.ok(dash.includes('Dismiss'), 'dashboard missing dismiss control')
})

test('lead-dedup: merge helper exists in leads2 and moves activities', () => {
  assert.ok(lib.includes('export async function mergeLeads('), 'mergeLeads missing in leads2.ts')
  assert.ok(lib.includes("supabase.from('lead_activities').update({ lead_id: keepId })"), 'merge must re-point activities')
  assert.ok(lib.includes("'merge',"), 'merge must log an activity')
})

test('lead-dedup: source flows through lib, modal and schema', () => {
  assert.ok(lib.includes('source?: string | null'), 'UnifiedLead missing source')
  assert.ok(lib.includes('source: r.source || null'), 'fetchAllLeads missing source mapping')
  assert.ok(modal.includes('SOURCE_OPTIONS'), 'modal missing source options')
  assert.ok(modal.includes('Lead source'), 'modal missing source field')
  assert.ok(sql.includes('add column if not exists source text'), 'schema missing seller_leads source column')
})

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const schema = readFileSync('sql/visitorIntent_schema.sql', 'utf8')
const lib = readFileSync('lib/visitorIntent.ts', 'utf8')
const api = readFileSync('app/api/track-view/route.ts', 'utf8')
const page = readFileSync('components/ai/panels/VisitorIntentPanel.tsx', 'utf8')
const interactive = readFileSync('components/public/ListingDetailInteractive.tsx', 'utf8')
const shell = readFileSync('components/layout/navConfig.ts', 'utf8')

test('visitor-intent: schema creates listing_views with anonymous visitor + RLS', () => {
  assert.match(schema, /create table if not exists public\.listing_views/)
  assert.match(schema, /visitor_id uuid not null/)
  assert.match(schema, /viewed_at timestamptz not null default now\(\)/)
  assert.match(schema, /listing_views_public_insert/)
  assert.match(schema, /listing_views_agency_read/)
  assert.match(schema, /is_agency_member\(agency_id\)/)
  assert.match(schema, /browser-generated, anonymous/)
  assert.match(schema, /enable row level security/)
})

test('visitor-intent: lib exposes visitor id, tracking, agency stats, totals', () => {
  assert.match(lib, /export function getVisitorId/)
  assert.match(lib, /concord_visitor_id/)
  assert.match(lib, /export async function trackListingView/)
  assert.match(lib, /\/api\/track-view/)
  assert.match(lib, /export async function fetchIntentForAgency/)
  assert.match(lib, /export interface ListingIntentStats/)
  assert.match(lib, /uniqueVisitors/)
  assert.match(lib, /repeatViewers/)
  assert.match(lib, /viewsLast7d/)
  assert.match(lib, /hot: boolean/)
  assert.match(lib, /export async function fetchIntentTotals/)
  assert.match(lib, /anonymous 90%/)
})

test('visitor-intent: track API resolves agency server-side and validates', () => {
  assert.match(api, /POST \/api\/track-view/)
  assert.match(api, /listing_id and visitor_id required/)
  assert.match(api, /listing not found/)
  assert.match(api, /agency_id: listing\.agency_id \|\| null/)
  assert.match(api, /createServerClient/)
})

test('visitor-intent: listing page fires anonymous view tracking', () => {
  assert.match(interactive, /trackListingView/)
  assert.match(interactive, /document\.referrer/)
  assert.match(interactive, /useEffect/)
})

test('visitor-intent: dashboard page renders stats, hot list, per-listing rows', () => {
  assert.match(page, /Visitor Intent/)
  assert.match(page, /fetchIntentForAgency/)
  assert.match(page, /fetchIntentTotals/)
  assert.match(page, /Total views/)
  assert.match(page, /Unique visitors/)
  assert.match(page, /Hot listings/)
  assert.match(page, /s\.uniqueVisitors/)
  assert.match(page, /s\.repeatViewers/)
  assert.match(page, /s\.viewsLast7d/)
})

test('visitor-intent: AI cockpit exposes Visitor Intent tab', () => {
  const cockpit = readFileSync('components/ai/AICockpit.tsx', 'utf8')
  assert.match(cockpit, /key: 'intent'/)
  assert.match(cockpit, /Visitor Intent/)
})

// --- New (audit A2): per-visitor path tracking + intent score → lead linkage ---

test('visitor-intent: pure per-visitor score is recency-weighted + breadth-bonused, bounded 0-100', () => {
  assert.match(lib, /export function visitorRecencyWeight/)
  assert.match(lib, /days <= 7\) return 1/)
  assert.match(lib, /days <= 30\) return 0\.6/)
  assert.match(lib, /return 0\.3/)
  assert.match(lib, /export function computeVisitorIntentScore/)
  assert.match(lib, /14 \* Math\.log\(1 \+ activity\) \+ 6 \* Math\.min\(distinctListings, 4\)/)
  assert.match(lib, /Math\.max\(0, Math\.min\(100, score\)\)/)
})

test('visitor-intent: fetchVisitorPaths groups views into ranked journeys', () => {
  assert.match(lib, /export async function fetchVisitorPaths/)
  assert.match(lib, /distinctListings/)
  assert.match(lib, /firstSeenAt/)
  assert.match(lib, /computeVisitorIntentScore\(e\.views/)
  assert.match(lib, /sort\(\(a, b\) => b\.score - a\.score/)
  assert.match(lib, /export async function fetchVisitorIntentForVisitor/)
})

test('visitor-intent: broker API route for visitor paths is auth-gated', () => {
  const route = readFileSync('app/api/intelligence/visitor-paths/route.ts', 'utf8')
  assert.match(route, /authenticateProfileRequest/)
  assert.match(route, /unauthorizedResponse\(\)/)
  assert.match(route, /fetchVisitorPaths/)
  assert.match(route, /export const runtime = 'nodejs'/)
})

test('visitor-intent: NDA sign stamps visitor intent score onto converted lead', () => {
  const sign = readFileSync('app/api/public/nda/sign/route.ts', 'utf8')
  assert.match(sign, /visitorId/)
  assert.match(sign, /computeVisitorIntentScore/)
  assert.match(sign, /listing_views/)
  assert.match(sign, /Intent \$\{score\}\/100/)
})

test('visitor-intent: NDA gate sends visitorId; dashboard renders journeys panel', () => {
  const gate = readFileSync('components/public/NdaFinancialsGate.tsx', 'utf8')
  assert.match(gate, /getVisitorId\(\)/)
  assert.match(page, /Buyer journeys — ranked by intent/)
  assert.match(page, /fetchVisitorPaths/)
  assert.match(page, /expanded === p\.visitorId/)
  assert.match(page, /HOT/)
})

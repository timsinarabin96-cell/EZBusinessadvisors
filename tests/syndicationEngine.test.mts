import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const lib = readFileSync('lib/syndicationEngine.ts', 'utf8')
const route = readFileSync('app/api/listings/syndication/route.ts', 'utf8')
const panel = readFileSync('components/listings/SyndicationPanel.tsx', 'utf8')
const step8 = readFileSync('components/listings/Step8ListBusiness.tsx', 'utf8')

// Import the pure helpers (dependency-free core — no path aliases).
const { buildSyncPayload, SYNDICATION_PROVIDERS } = await import('../lib/syndicationEngineCore.ts')

test('syndication: provider registry covers the big marketplaces', () => {
  const ids = SYNDICATION_PROVIDERS.map((p) => p.id)
  for (const want of ['bizbuysell', 'loopnet', 'dealstream', 'facebook', 'local']) {
    assert.ok(ids.includes(want), `missing provider ${want}`)
  }
})

test('syndication: payload includes title, price, financials and description', () => {
  const payload = buildSyncPayload({
    business_name: 'Sunoco Gas Station',
    industry: 'Gas Station / C-Store',
    location_general: 'Dauphin County, PA',
    asking_price: 240000,
    sde: 75000,
    ebitda: 60000,
    annual_revenue: 900000,
    description: 'Prime corner location.',
  })
  assert.match(payload.title as string, /Sunoco Gas Station/)
  assert.match(payload.title as string, /Gas Station/)
  assert.match(payload.title as string, /Dauphin County/)
  assert.equal(payload.price, 240000)
  assert.equal(payload.sde, 75000)
  assert.equal(payload.ebitda, 60000)
  assert.match(payload.description as string, /Prime corner location/)
  assert.match(payload.description as string, /Confidential/)
})

test('syndication: payload degrades gracefully for sparse listings', () => {
  const payload = buildSyncPayload({ business_name: 'Acme' })
  assert.match(payload.title as string, /Acme/)
  assert.equal(payload.price, null)
  assert.ok((payload.description as string).includes('Confidential'))
})

test('syndication: engine records, lists, and updates sync rows', () => {
  assert.match(lib, /export async function recordSync/)
  assert.match(lib, /export async function fetchListingSyncs/)
  assert.match(lib, /export async function fetchListingSyncStatus/)
  assert.match(lib, /export async function updateSyncStatus/)
  assert.match(lib, /from\('bbs_syncs'\)/)
  assert.match(lib, /export async function fetchConnections/)
  assert.match(lib, /marketplace_connections/)
})

test('syndication: API validates, gates by agency, and upserts rows', () => {
  assert.match(route, /export const runtime = 'nodejs'/)
  assert.match(route, /export async function GET/)
  assert.match(route, /export async function POST/)
  assert.match(route, /export async function PATCH/)
  assert.match(route, /authenticateProfileRequest/)
  assert.match(route, /forbiddenResponse/)
  assert.match(route, /z\.object/)
  assert.match(route, /providers: z\.array/)
  assert.match(route, /bbs_syncs/)
  assert.match(route, /status: 'pending'/)
})

test('syndication: Step 8 mounts the panel with provider status UI', () => {
  assert.match(step8, /SyndicationPanel/)
  assert.match(panel, /SYNDICATION_PROVIDERS/)
  assert.match(panel, /📡 Syndication/)
  assert.match(panel, /Push selected/)
  assert.match(panel, /Mark posted/)
  assert.match(panel, /payload/)
  assert.match(panel, /STATUS_STYLE/)
})

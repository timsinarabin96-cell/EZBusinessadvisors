import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const schema = readFileSync('sql/syndication_schema.sql', 'utf8')
const lib = readFileSync('lib/syndication.ts', 'utf8')
const api = readFileSync('app/api/syndication/route.ts', 'utf8')
const hub = readFileSync('app/dashboard/syndication/page.tsx', 'utf8')
const shell = readFileSync('components/layout/AppShell.tsx', 'utf8')

test('syndication: schema creates syndication_offers with splits + RLS', () => {
  assert.match(schema, /create table if not exists public\.syndication_offers/)
  assert.match(schema, /listing_id uuid not null references public\.listings/)
  assert.match(schema, /from_agency_id uuid not null references public\.agencies/)
  assert.match(schema, /to_agency_id uuid not null references public\.agencies/)
  assert.match(schema, /split_pct numeric\(5,2\) not null default 50\.00/)
  assert.match(schema, /status text not null default 'offered' check \(status in \('offered','accepted','declined','withdrawn'\)\)/)
  assert.match(schema, /syndication_agency_access/)
  assert.match(schema, /is_agency_member\(from_agency_id\) or public\.is_agency_member\(to_agency_id\)/)
  assert.match(schema, /enable row level security/)
})

test('syndication: lib exposes inbox, outbox, offer, respond, withdraw, stats', () => {
  assert.match(lib, /export type SyndicationStatus = 'offered' \| 'accepted' \| 'declined' \| 'withdrawn'/)
  assert.match(lib, /export interface SyndicationOffer/)
  assert.match(lib, /export async function fetchSyndicationInbox/)
  assert.match(lib, /export async function fetchSyndicationOutbox/)
  assert.match(lib, /export async function fetchSyndicationStats/)
  assert.match(lib, /export async function offerListing/)
  assert.match(lib, /export async function respondToOffer/)
  assert.match(lib, /export async function withdrawOffer/)
  assert.match(lib, /export async function fetchMyListingsForSyndication/)
  assert.match(lib, /cannot syndicate to your own agency/i)
  assert.match(lib, /split must be 0–100%/i)
  assert.match(lib, /createNotification/)
  assert.match(lib, /Co-brokerage offer received/)
})

test('syndication: API guards auth, validates splits, supports accept/decline/withdraw', () => {
  assert.match(api, /view=inbox\|outbox/)
  assert.match(api, /stats=1/)
  assert.match(api, /authenticateProfileRequest/)
  assert.match(api, /unauthorizedResponse/)
  assert.match(api, /forbiddenResponse/)
  assert.match(api, /export async function POST/)
  assert.match(api, /export async function PATCH/)
  assert.match(api, /splitPct must be 0–100/)
  assert.match(api, /Cannot syndicate to your own agency/)
  assert.match(api, /action \(accept\|decline\|withdraw\)/)
  assert.match(api, /action === 'decline' \? 'declined' : 'withdrawn'/)
})

test('syndication: hub page renders inbox/outbox, stats, and offer composer', () => {
  assert.match(hub, /Co-Brokerage Network/)
  assert.match(hub, /fetchSyndicationInbox/)
  assert.match(hub, /fetchSyndicationOutbox/)
  assert.match(hub, /fetchSyndicationStats/)
  assert.match(hub, /offerListing/)
  assert.match(hub, /respondToOffer/)
  assert.match(hub, /withdrawOffer/)
  assert.match(hub, /fetchPublicBrokers/)
  assert.match(hub, /Syndicate a Listing/)
  assert.match(hub, /splitPct/)
  assert.match(hub, /Incoming/)
  assert.match(hub, /Outgoing/)
  assert.match(hub, /Co-brokered deals/)
})

test('syndication: dashboard nav includes Syndication', () => {
  assert.match(shell, /dashboard\/syndication/)
  assert.match(shell, /'Syndication'/)
})

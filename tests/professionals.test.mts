import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const schema = readFileSync('sql/professionals_schema.sql', 'utf8')
const lib = readFileSync('lib/professionals.ts', 'utf8')
const api = readFileSync('app/api/professionals/route.ts', 'utf8')
const directory = readFileSync('app/(public)/marketplace/professionals/page.tsx', 'utf8')
const profile = readFileSync('app/(public)/marketplace/professionals/[id]/page.tsx', 'utf8')
const manager = readFileSync('app/dashboard/professionals/page.tsx', 'utf8')
const panel = readFileSync('components/public/DealProfessionalsPanel.tsx', 'utf8')
const listingPage = readFileSync('app/(public)/marketplace/listings/[id]/page.tsx', 'utf8')
const nav = readFileSync('components/public/PublicNav.tsx', 'utf8')
const shell = readFileSync('components/layout/navConfig.ts', 'utf8')

test('professionals: schema creates deal_professionals with type enum + RLS', () => {
  assert.match(schema, /create table if not exists public\.deal_professionals/)
  assert.match(schema, /professional_type text not null check/)
  assert.match(schema, /'lawyer', 'accountant', 'qoe_agent', 'lender', 'consultant'/)
  assert.match(schema, /enable row level security/)
  assert.match(schema, /deal_professionals_public_read/)
  assert.match(schema, /is_agency_member\(agency_id\)/)
  assert.match(schema, /is_active boolean not null default true/)
  assert.match(schema, /is_platform_verified boolean not null default false/)
})

test('professionals: lib exposes types, labels, public search, CRUD, matcher', () => {
  assert.match(lib, /export type ProfessionalType =/)
  assert.match(lib, /export const PROFESSIONAL_TYPES/)
  assert.match(lib, /PROFESSIONAL_LABELS/)
  assert.match(lib, /export interface DealProfessional/)
  assert.match(lib, /export async function fetchPublicProfessionals/)
  assert.match(lib, /export async function fetchPublicProfessional/)
  assert.match(lib, /export async function fetchMyProfessionals/)
  assert.match(lib, /export async function createProfessional/)
  assert.match(lib, /export async function updateProfessional/)
  assert.match(lib, /export async function deleteProfessional/)
  assert.match(lib, /export async function matchProfessionalsForListing/)
  assert.match(lib, /export function extractStateFromLocation/)
  assert.match(lib, /Quality-of-Earnings Agent/)
  assert.match(lib, /SBA \/ Lender/)
})

test('professionals: public directory page filters by type, state, query', () => {
  assert.match(directory, /fetchPublicProfessionals\(/)
  assert.match(directory, /type === 'all'/)
  assert.match(directory, /setType/)
  assert.match(directory, /setQuery/)
  assert.match(directory, /setState/)
  assert.match(directory, /PROFESSIONAL_LABELS\[p\.professional_type\]/)
  assert.match(directory, /marketplace\/professionals\/\$\{p\.id\}/)
})

test('professionals: profile page is SEO-friendly with schema.org JSON-LD', () => {
  assert.match(profile, /generateMetadata/)
  assert.match(profile, /ProfessionalService/)
  assert.match(profile, /fetchPublicProfessional/)
  assert.match(profile, /notFound\(\)/)
  assert.match(profile, /PROFESSIONAL_LABELS/)
  assert.match(profile, /License/)
  assert.match(profile, /Deals closed/)
})

test('professionals: broker manager page adds, edits, hides, removes', () => {
  assert.match(manager, /fetchMyProfessionals/)
  assert.match(manager, /createProfessional/)
  assert.match(manager, /updateProfessional/)
  assert.match(manager, /deleteProfessional/)
  assert.match(manager, /toggleActive/)
  assert.match(manager, /Add Professional/)
  assert.match(manager, /professional_type/)
  assert.match(manager, /industries\.split/)
  assert.match(manager, /states_served/)
})

test('professionals: API supports public search + authenticated CRUD', () => {
  assert.match(api, /GET \/api\/professionals/)
  assert.match(api, /mine=1/)
  assert.match(api, /authenticateProfileRequest/)
  assert.match(api, /unauthorizedResponse/)
  assert.match(api, /export async function POST/)
  assert.match(api, /export async function PATCH/)
  assert.match(api, /export async function DELETE/)
  assert.match(api, /is_active', true/)
  assert.match(api, /PROFESSIONAL_TYPES\.includes/)
})

test('professionals: listing page shows referral panel + public nav links to directory', () => {
  assert.match(panel, /matchProfessionalsForListing/)
  assert.match(panel, /Professionals for this deal/)
  assert.match(panel, /marketplace\/professionals/)
  assert.match(listingPage, /DealProfessionalsPanel/)
  assert.match(nav, /marketplace\/professionals/)
  assert.match(shell, /dashboard\/professionals/)
  assert.match(shell, /Professional Network/)
})

test('professionals: dead code removed — no orphan AI/social components remain', () => {
  const files = ['components/ai/ChatInterface.tsx', 'components/ai/MarketingGenPanel.tsx', 'components/social/SocialConnections.tsx', 'components/social/SocialSettings.tsx']
  for (const f of files) {
    try {
      readFileSync(f, 'utf8')
      assert.fail(`${f} should have been deleted`)
    } catch (e: any) {
      assert.match(e.code || '', /ENOENT/)
    }
  }
})

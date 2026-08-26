import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const lib = readFileSync('lib/hiring.ts', 'utf8')
const route = readFileSync('app/api/hiring/route.ts', 'utf8')
const reviewRoute = readFileSync('app/api/hiring/review/route.ts', 'utf8')
const applicationsRoute = readFileSync('app/api/hiring/applications/route.ts', 'utf8')
const packagesRoute = readFileSync('app/api/hiring/packages/route.ts', 'utf8')
const page = readFileSync('app/dashboard/hiring/page.tsx', 'utf8')
const sql = readFileSync('sql/hiring_packages_schema.sql', 'utf8')

test('hiring packages define role, split, training, certification', () => {
  assert.match(lib, /commission_split/)
  assert.match(lib, /training_required/)
  assert.match(lib, /certification_required/)
  assert.match(lib, /Associate Advisor/)
  assert.match(lib, /Managing Broker/)
})

test('hiring schema is idempotent and seeds three packages', () => {
  assert.match(sql, /create table if not exists public\.hiring_packages/)
  assert.match(sql, /where not exists \(select 1 from public\.hiring_packages\)/)
})

test('applications are public-submit, broker-review', () => {
  assert.match(lib, /submitAgentApplication/)
  assert.match(route, /agent_applications/)
  // Review lives in its own route file (Next.js subpath routing).
  assert.match(reviewRoute, /agent_applications/)
  assert.match(reviewRoute, /status: action/)
  assert.match(applicationsRoute, /agent_applications/)
  assert.match(applicationsRoute, /applications: data/)
})

test('hiring API has public packages + authenticated review', () => {
  assert.match(packagesRoute, /hiring_packages/)
  assert.match(route, /authenticateProfileRequest/)
  assert.match(route, /forbiddenResponse|unauthorizedResponse/)
  // Subpath routes are auth-gated.
  assert.match(reviewRoute, /authenticateProfileRequest/)
  assert.match(reviewRoute, /unauthorizedResponse/)
  assert.match(applicationsRoute, /authenticateProfileRequest/)
  assert.match(applicationsRoute, /unauthorizedResponse/)
})

test('hiring dashboard is wired into nav', () => {
  assert.match(page, /Agent Hiring/)
  assert.match(page, /Submit Application/)
  const shell = readFileSync('components/layout/navConfig.ts', 'utf8')
  assert.match(shell, /dashboard\/hiring/)
})

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const lib = readFileSync('lib/agencySecurity.ts', 'utf8')
const route = readFileSync('app/api/agency/security/route.ts', 'utf8')
const page = readFileSync('app/dashboard/security/page.tsx', 'utf8')

test('security: agency lib reads and sets require_2fa', () => {
  assert.match(lib, /export async function getRequire2fa/)
  assert.match(lib, /export async function setRequire2fa/)
  assert.match(lib, /from\('agencies'\)\.select\('require_2fa'\)/)
  assert.match(lib, /update\(\{ require_2fa: value \}\)/)
})

test('security: API is auth-gated and owner/admin-only for PATCH', () => {
  assert.match(route, /export async function GET/)
  assert.match(route, /export async function PATCH/)
  assert.match(route, /authenticateProfileRequest/)
  assert.match(route, /canManageAgency/)
  assert.match(route, /forbiddenResponse\(\)/)
  assert.match(route, /require2fa must be a boolean/)
})

test('security: dashboard page has enforcement toggle for managers', () => {
  assert.match(page, /Agency policy/)
  assert.match(page, /Require 2FA for all brokers/)
  assert.match(page, /togglePolicy/)
  assert.match(page, /\/api\/agency\/security/)
  assert.match(page, /canManage/)
})

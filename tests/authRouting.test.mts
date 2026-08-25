import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const { resolvePortalRole, resolveLoginDestination, PORTAL_LABEL } = await import('../lib/authRouting.ts')

test('auth routing: super_admin always lands in the platform admin', () => {
  const role = resolvePortalRole({ role: 'super_admin' }, { role: null, is_owner: null })
  assert.equal(role, 'super_admin')
  assert.equal(resolveLoginDestination(role), '/admin')
})

test('auth routing: admin via profile role, membership role, or ownership', () => {
  assert.equal(resolvePortalRole({ role: 'admin' }, { role: null, is_owner: null }), 'admin')
  assert.equal(resolvePortalRole({ role: 'agent' }, { role: 'admin', is_owner: null }), 'admin')
  assert.equal(resolvePortalRole({ role: 'agent' }, { role: null, is_owner: true }), 'admin')
  assert.equal(resolveLoginDestination('admin'), '/dashboard/command-center')
})

test('auth routing: broker is distinct from agent — broker lands in deal tools', () => {
  assert.equal(resolvePortalRole({ role: 'broker' }, { role: null, is_owner: null }), 'broker')
  assert.equal(resolvePortalRole({ role: 'agent' }, { role: 'broker', is_owner: null }), 'broker')
  assert.equal(resolveLoginDestination('broker'), '/dashboard/listings')
})

test('auth routing: CRM seat without broker/admin role is an agent', () => {
  assert.equal(resolvePortalRole({ role: 'agent' }, { role: null, is_owner: null }, true), 'agent')
  assert.equal(resolveLoginDestination('agent'), '/dashboard')
})

test('auth routing: no CRM seat → owner portal', () => {
  assert.equal(resolvePortalRole({ role: 'owner' }, null, false), 'owner')
  assert.equal(resolvePortalRole(null, null, false), 'owner')
  assert.equal(resolveLoginDestination('owner'), '/dashboard/owner')
})

test('auth routing: labels cover every portal', () => {
  for (const r of ['super_admin', 'admin', 'broker', 'agent', 'owner'] as const) {
    assert.ok(PORTAL_LABEL[r], `missing label for ${r}`)
  }
})

test('auth routing: login page + nav share the resolver', () => {
  const page = readFileSync('app/auth/page.tsx', 'utf8')
  assert.match(page, /resolvePortalRole|resolveLoginDestination|authRouting/)
  const shell = readFileSync('components/layout/AppShell.tsx', 'utf8')
  assert.match(shell, /resolvePortalRole|authRouting/)
})

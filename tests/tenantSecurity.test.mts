import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('core CRM tables receive required agency IDs', () => {
  const sql = readFileSync('sql/core_agency_isolation.sql', 'utf8')
  for (const table of ['listings', 'buyer_leads', 'seller_leads', 'deals']) {
    assert.match(sql, new RegExp(`alter table public\\.${table} add column if not exists agency_id uuid`))
    assert.match(sql, new RegExp(`alter table public\\.${table} alter column agency_id set not null`))
  }
})

test('tenant policies use agency membership instead of global true access', () => {
  const sql = readFileSync('sql/core_agency_isolation.sql', 'utf8')
  for (const table of ['listings', 'buyer_leads', 'seller_leads', 'deals']) {
    assert.match(sql, new RegExp(`${table}_[a-z_]+.*is_agency_member`, 's'))
  }
  assert.doesNotMatch(sql, /to authenticated using \(true\)/)
})

test('privileged listing and profile functions enforce ownership', () => {
  const sql = readFileSync('sql/core_agency_isolation.sql', 'utf8')
  assert.match(sql, /Not authorized for this listing/)
  assert.match(sql, /Profiles may only update their own avatar/)
  assert.match(sql, /Listing and buyer lead must belong to your agency/)
})

test('service-role mutation routes require authenticated callers', () => {
  const routes = [
    'app/api/broker/upload-photo/route.ts',
    'app/api/newspaper/publish/route.ts',
    'app/api/certificates/route.ts',
    'app/api/onboarding/route.ts',
    'app/api/billing/convert-trial/route.ts',
    'app/api/billing/bump-usage/route.ts',
    'app/api/billing/create-agency/route.ts',
  ]

  for (const route of routes) {
    const source = readFileSync(route, 'utf8')
    assert.match(source, /authenticate(Request|ProfileRequest)\(req\)/, `${route} lacks an authentication gate`)
  }
})

test('broker uploads derive identity from the verified session', () => {
  const source = readFileSync('app/api/broker/upload-photo/route.ts', 'utf8')
  assert.match(source, /authenticated\.user\.id/)
  assert.doesNotMatch(source, /x-user-id/)
})

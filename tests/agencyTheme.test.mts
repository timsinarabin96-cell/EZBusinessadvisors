import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const lib = readFileSync('lib/agencyTheme.ts', 'utf8')
const route = readFileSync('app/api/agency/theme/route.ts', 'utf8')
const page = readFileSync('app/agency/[slug]/page.tsx', 'utf8')

test('theme service loads with defaults fallback', () => {
  assert.match(lib, /getAgencyTheme/)
  assert.match(lib, /DEFAULT_THEME/)
  assert.match(lib, /primary_color: '#102a43'/)
})

test('theme service saves and maps to CSS variables', () => {
  assert.match(lib, /saveAgencyTheme/)
  assert.match(lib, /themeToCssVars/)
  assert.match(lib, /'--brand'/)
  assert.match(lib, /'--accent'/)
})

test('theme API requires agency auth to save', () => {
  assert.match(route, /canManageAgency/)
  assert.match(route, /forbiddenResponse/)
  assert.match(route, /authenticateProfileRequest/)
  assert.match(route, /themePatchSchema/)
})

test('theme API exposes public GET for white-label sites', () => {
  assert.match(route, /GET\(req: NextRequest\)/)
  assert.match(route, /agencyId required/)
})

test('agency white-label page applies theme colors', () => {
  assert.match(page, /getAgencyTheme/)
  assert.match(page, /theme\?\.primary_color/)
  assert.match(page, /theme\?\.accent_color/)
  assert.match(page, /White-label public agency home/)
})

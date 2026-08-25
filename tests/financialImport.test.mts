import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const route = readFileSync('app/api/listings/financial-import/route.ts', 'utf8')
const form = readFileSync('components/listings/IntelligentListingForm.tsx', 'utf8')

test('financial-import: route is server-only with auth + agency gate', () => {
  assert.match(route, /export const runtime = 'nodejs'/)
  assert.match(route, /authenticateProfileRequest/)
  assert.match(route, /unauthorizedResponse/)
  assert.match(route, /req\.formData\(\)/)
  assert.match(route, /file instanceof File/)
  assert.match(route, /12 \* 1024 \* 1024/)
  assert.match(route, /Not a member of this listing/)
})

test('financial-import: stores the file and financial_documents row', () => {
  assert.match(route, /storage\n\s*\.from\(FF_BUCKET\)/)
  assert.match(route, /\.upload\(storagePath, bytes/)
  assert.match(route, /financial_documents/)
  assert.match(route, /autoTagCategory/)
  assert.match(route, /fileKindOf/)
  assert.match(route, /status: 'pending'/)
})

test('financial-import: reuses the proven extraction pipeline', () => {
  assert.match(route, /extractDocumentText/)
  assert.match(route, /analyzeDocumentText/)
  assert.match(route, /detectUniversalDocType/)
  assert.match(route, /isDeepSeekConfigured/)
})

test('financial-import: returns pre-fill financials incl. latest year', () => {
  assert.match(route, /revenueTotal/)
  assert.match(route, /expenseTotal/)
  assert.match(route, /sde: analysis\.sde/)
  assert.match(route, /ebitda: analysis\.ebitda/)
  assert.match(route, /latestYearRevenue/)
  assert.match(route, /tags/)
  assert.match(route, /summary/)
})

test('financial-import: studio wires the upload button into Financials', () => {
  assert.match(form, /Import financials/)
  assert.match(form, /financial-import/)
  assert.match(form, /listingId=\{createdListingId\}/)
  assert.match(form, /importFinancials/)
  assert.match(form, /accept="\.pdf,\.csv/)
})

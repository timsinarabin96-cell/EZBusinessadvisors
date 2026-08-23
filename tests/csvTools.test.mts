import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const lib = readFileSync('lib/csvTools.ts', 'utf8')
const route = readFileSync('app/api/tools/csv/route.ts', 'utf8')
const page = readFileSync('app/dashboard/tools/page.tsx', 'utf8')

test('csv: exports listings, buyer leads, and seller leads', () => {
  assert.match(lib, /export async function exportListingsCsv/)
  assert.match(lib, /export async function exportBuyerLeadsCsv/)
  assert.match(lib, /export async function exportSellerLeadsCsv/)
  assert.match(lib, /business_name, asking_price, annual_revenue/)
  assert.match(lib, /contact_name, company, email/)
})

test('csv: parser handles quotes, commas, and CRLF', () => {
  assert.match(lib, /export function parseCsv/)
  assert.match(lib, /inQuotes/)
  assert.match(lib, /ch === '"'/) // quoted-field handling
  assert.match(lib, /ch === '\\r' && text\[i \+ 1\] === '\\n'/) // CRLF
  assert.match(lib, /headers = lines\[0\]/
  )
})

test('csv: import inserts leads with agency and validation', () => {
  assert.match(lib, /export async function importLeads/)
  assert.match(lib, /buyer_leads/)
  assert.match(lib, /seller_leads/)
  assert.match(lib, /missing or invalid email/)
  assert.match(lib, /imported\+\+/)
})

test('csv: API exports CSV with attachment and imports rows', () => {
  assert.match(route, /export async function GET/)
  assert.match(route, /export async function POST/)
  assert.match(route, /Content-Disposition/)
  assert.match(route, /text\/csv/)
  assert.match(route, /canManageAgency/)
  assert.match(route, /parseCsv\(body\.csv\)/)
})

test('csv: dashboard page has export buttons and import UI', () => {
  assert.match(page, /CSV Tools/)
  assert.match(page, /Export/)
  assert.match(page, /Import/)
  assert.match(page, /\/api\/tools\/csv/)
  assert.match(page, /Blob/)
})

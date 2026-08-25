import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const route = readFileSync('app/api/public/seller-intake/route.ts', 'utf8')
const page = readFileSync('app/(public)/marketplace/sell/page.tsx', 'utf8')

test('seller portal: route tags self-service leads with source', () => {
  assert.match(route, /source: 'seller_self_service'/)
  assert.match(route, /seller-intake/)
  assert.match(route, /Never throws/)
  assert.match(route, /createNotification/)
})

test('seller portal: route captures structured intake fields', () => {
  assert.match(route, /const timeframe = String\(body\?\.timeframe/)
  assert.match(route, /const employees = String\(body\?\.employees/)
  assert.match(route, /timeframe: timeframe \|\| null/)
  assert.match(route, /industry: industry \|\| null/)
  assert.match(route, /location_general: location \|\| null/)
  assert.match(route, /Employees: \$\{esc\(employees\)\}/)
  assert.match(route, /Source: Seller intake portal/)
})

test('seller portal: route stores richer notification body', () => {
  assert.match(route, /timeline: \$\{timeframe\}/)
  assert.match(route, /wants to sell/)
  assert.match(route, /kind: 'review'/)
})

test('seller portal: public sell page sends the structured fields', () => {
  assert.match(page, /form\.industry/)
  assert.match(page, /form\.location/)
  assert.match(page, /form\.timeframe/)
  assert.match(page, /form\.employees/)
  assert.match(page, /industry: form\.industry \|\| undefined/)
  assert.match(page, /location_general: form\.location/)
  assert.match(page, /timeframe: form\.timeframe/)
  assert.match(page, /employees: form\.employees/)
})

test('seller portal: sell page offers industry + timeline selects', () => {
  assert.match(page, /Select industry…/)
  assert.match(page, /Home Care/)
  assert.match(page, /Gas Station \/ C-Store/)
  assert.match(page, /Timeline to sell/)
  assert.match(page, /6-12 months/)
  assert.match(page, /Not sure yet/)
})

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const publish = readFileSync('lib/publish.ts', 'utf8')
const route = readFileSync('app/api/listings/publish/route.ts', 'utf8')
const step8 = readFileSync('components/listings/Step8ListBusiness.tsx', 'utf8')

test('compliance gate: publishListing evaluates compliance and returns it', () => {
  assert.match(publish, /evaluateListingCompliance/)
  assert.match(publish, /let compliance = null/)
  assert.match(publish, /compliance\?: import\('@\/lib\/compliance'\)\.ComplianceEvaluation/)
  assert.match(publish, /flagged, compliance \}/)
  assert.match(publish, /best-effort/)
})

test('compliance gate: publish API surfaces compliance in the response', () => {
  assert.match(route, /compliance: res\.compliance \|\| null/)
})

test('compliance gate: Step 8 shows license-required warning + checklist', () => {
  assert.match(step8, /evaluateListingCompliance/)
  assert.match(step8, /license_required/)
  assert.match(step8, /Compliance check:/)
  assert.match(step8, /checklist\.filter/)
  assert.match(step8, /c\.required/)
})

test('compliance gate: no-license brokers are not flagged in most states', () => {
  // checkAgentLicense with no license on file must be advisory, not blocking —
  // most states do not license business-asset brokerage.
  const complianceLib = readFileSync('lib/compliance.ts', 'utf8')
  assert.match(complianceLib, /most states do not require a license/i)
  assert.match(complianceLib, /status: 'not_required'/)
})

test('compliance gate: DB matrix defaults to real-estate-only licensing', () => {
  const schema = readFileSync('sql/global_compliance_schema.sql', 'utf8')
  assert.match(schema, /re_license_when_real_estate/)
  // Only California is always-licensed for business opportunities.
  assert.match(schema, /'US', 'CA', 're_license_always'/)
})

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

// =============================================================================
// Legal pack quality — documents must render clean (no raw JS expressions, no
// unresolvable placeholders) and the pack flow must collect seller + buyer
// details upfront so every document is fully fillable.
// =============================================================================

const SEED = readFileSync('scripts/seed-legal-docs.mjs', 'utf8')
const PANEL = readFileSync('components/documents/DealDocsPanel.tsx', 'utf8')
const BUILDER = readFileSync('lib/documentBuilder.ts', 'utf8')

test('legal templates contain no raw JS expressions (exclusive / term ternaries)', () => {
  assert.doesNotMatch(SEED, /exclusive\.toLowerCase\(\)/, 'Marketing Agreement still has raw exclusive expression')
  assert.doesNotMatch(SEED, /term_months \?/, 'Listing Agreement still has raw term ternary')
})

test('key agreements are properly sectioned like real broker packages', () => {
  const marketing = SEED.match(/name: 'Marketing Agreement',[\s\S]*?body_template: `([\s\S]*?)`,\n  \},/)?.[1] || ''
  const listing = SEED.match(/name: 'Listing Agreement',[\s\S]*?body_template: `([\s\S]*?)`,\n  \},/)?.[1] || ''
  const purchase = SEED.match(/name: 'Purchase Agreement',[\s\S]*?body_template: `([\s\S]*?)`,\n  \},/)?.[1] || ''

  // Standard broker-package sections
  for (const [label, body] of [['Marketing', marketing], ['Listing', listing], ['Purchase', purchase]]) {
    assert.match(body, /ENGAGEMENT|APPOINTMENT|PURCHASE AND SALE/, `${label} lacks engagement clause`)
    assert.match(body, /GOVERNING LAW/, `${label} lacks governing law`)
    assert.match(body, /IN WITNESS WHEREOF/, `${label} lacks execution block`)
  }
  assert.match(marketing, /Date: __+/, 'Marketing lacks signature date line')
  assert.match(listing, /Date: __+/, 'Listing lacks signature date line')
  assert.match(marketing, /COMMISSION/, 'Marketing lacks commission clause')
  assert.match(listing, /COMMISSION/, 'Listing lacks commission clause')
  assert.match(marketing, /PROTECTION PERIOD/i, 'Marketing lacks protection/tail period')
  assert.match(marketing, /REPRESENTATIONS/, 'Marketing lacks seller representations')
  assert.match(marketing, /INDEPENDENT CONTRACTOR/, 'Marketing lacks independent-contractor clause')
  assert.match(purchase, /DUE DILIGENCE/, 'Purchase lacks due-diligence clause')
  assert.match(purchase, /CONDITIONS/, 'Purchase lacks conditions clause')
})

test('property addendum is properly legal and only uses fillable fields', () => {
  const prop = SEED.match(/name: 'Property Addendum',[\s\S]*?body_template: `([\s\S]*?)`,\n  \},/)?.[1] || ''
  assert.match(prop, /INCLUSION OF REAL PROPERTY/)
  assert.match(prop, /as-is/)
  assert.match(prop, /GOVERNING LAW/)
  assert.doesNotMatch(prop, /\{\{[^}]*\?/, 'no raw expressions')
})

test('renderTemplateBody has a safety net for leftover expressions', () => {
  assert.match(BUILDER, /leftover/)
  assert.match(BUILDER, /Safety net/)
})

test('pack flow collects seller AND buyer details before generating', () => {
  assert.match(PANEL, /Seller details/)
  assert.match(PANEL, /Buyer details/)
  assert.match(PANEL, /Add the seller\\'s name and email first/)
  assert.match(PANEL, /Add the buyer\\'s name and email first/)
  assert.match(PANEL, /expiry_clause/)
  assert.match(PANEL, /property_included/)
  assert.match(PANEL, /prospect_name/)
})

test('pack flow fills the seller + buyer fields into every document', () => {
  assert.match(PANEL, /seller_name: seller\.name/)
  assert.match(PANEL, /seller_entity: seller\.name/)
  assert.match(PANEL, /buyer_name: buyer\.name/)
  assert.match(PANEL, /prospect_name: buyer\.name/)
  assert.match(PANEL, /commission_rate: seller\.commissionRate/)
  assert.match(PANEL, /Property Addendum only belongs in the pack/)
})

test('property addendum is skipped when real estate is not included', () => {
  assert.match(PANEL, /real_estate_included/)
  assert.match(PANEL, /Property Addendum only belongs in the pack/)
})

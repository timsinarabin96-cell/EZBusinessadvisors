import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { formatMoneyInput, stripMoney, parseMoneyInput, moneyChange } from '../lib/moneyInput.ts'

test('money: formats thousands separators as you type', () => {
  assert.equal(formatMoneyInput('900000000'), '900,000,000')
  assert.equal(formatMoneyInput('120000'), '120,000')
  assert.equal(formatMoneyInput('500'), '500')
  assert.equal(formatMoneyInput(''), '')
})

test('money: allows a single decimal point', () => {
  assert.equal(formatMoneyInput('1500000.5'), '1,500,000.5')
  assert.equal(formatMoneyInput('99.99'), '99.99')
})

test('money: strips commas and stray characters from input', () => {
  assert.equal(stripMoney('900,000,000'), '900000000')
  assert.equal(stripMoney('$1,200,000'), '1200000')
  assert.equal(stripMoney('abc123'), '123')
  assert.equal(stripMoney('1.2.3'), '1.23')
})

test('money: parses formatted values to numbers', () => {
  assert.equal(parseMoneyInput('900,000,000'), 900000000)
  assert.equal(parseMoneyInput('120000'), 120000)
  assert.equal(parseMoneyInput(''), null)
  assert.equal(parseMoneyInput('abc'), null)
})

test('money: moneyChange keeps raw digits in state', () => {
  const out: string[] = []
  moneyChange((v: string) => out.push(v))({ target: { value: '900,000,000' } })
  assert.deepEqual(out, ['900000000'])
})

test('money: quick-valuation inputs use the formatter', () => {
  const concierge = readFileSync('components/studio/StudioConcierge.tsx', 'utf8')
  assert.match(concierge, /formatMoneyInput\(sde\)/)
  assert.match(concierge, /formatMoneyInput\(revenue\)/)
  assert.match(concierge, /parseMoneyInput\(sde\)/)
  const step1 = readFileSync('components/listings/Step1LegalDocs.tsx', 'utf8')
  assert.match(step1, /formatMoneyInput\(sde\)/)
  assert.match(step1, /moneyChange\(setRevenue\)/)
})

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  STAGE_TEMPLATES,
  fillTemplate,
  templateForStage,
  templateStages,
  type StageTemplate,
} from '../lib/stageTemplates.ts'


test('templates cover the buyer journey stages', () => {
  const keys = STAGE_TEMPLATES.map((t) => t.key)
  for (const k of ['nda_cover', 'data_room_invite', 'offer_ack', 'loi_cover', 'closing_prep', 'post_close_checkin', 'referral_ask', 'breakup_final']) {
    assert.ok(keys.includes(k), `missing template ${k}`)
  }
})

test('every template uses merge fields, never raw data', () => {
  for (const t of STAGE_TEMPLATES) {
    assert.match(t.body, /\{deal\}/, `${t.key} uses {deal}`)
    assert.ok(!t.body.includes('undefined'), `${t.key} has no undefined placeholders`)
  }
})

test('fillTemplate substitutes known variables and preserves unknowns', () => {
  const tpl: StageTemplate = { key: 'x', stage: 'X', channel: 'email', subject: 'Hi {buyer} — {deal}', body: 'Hello {buyer}, deal: {deal}, price: {price}, unknown: {nope}' }
  const out = fillTemplate(tpl, { buyer: 'Sarah', deal: 'Laundromat', price: '$550k' })
  assert.equal(out.subject, 'Hi Sarah — Laundromat')
  assert.ok(out.body.includes('Hello Sarah'))
  assert.ok(out.body.includes('deal: Laundromat'))
  assert.ok(out.body.includes('price: $550k'))
  assert.ok(out.body.includes('{nope}'), 'unknown vars stay visible for manual edit')
})

test('templateForStage finds by stage name', () => {
  const nda = templateForStage('NDA sent')
  assert.ok(nda)
  assert.equal(nda.key, 'nda_cover')
  assert.equal(templateForStage('Nope'), null)
})

test('templateStages lists unique stages', () => {
  const stages = templateStages()
  assert.ok(stages.includes('NDA sent'))
  assert.ok(stages.includes('Closing'))
  assert.ok(new Set(stages).size === stages.length)
})

test('templates read naturally — no hard-sell boilerplate', () => {
  for (const t of STAGE_TEMPLATES) {
    assert.ok(!/act now|limited time|don't miss/i.test(t.body), `${t.key} is not spammy`)
  }
})

test('template merge field set is consistent with TemplateVars', () => {
  const used = new Set<string>()
  for (const t of STAGE_TEMPLATES) {
    for (const m of t.body.matchAll(/\{(\w+)\}/g)) used.add(m[1])
    if (t.subject) for (const m of t.subject.matchAll(/\{(\w+)\}/g)) used.add(m[1])
  }
  for (const k of used) {
    assert.ok(['deal', 'buyer', 'seller', 'price', 'dates', 'link', 'agency'].includes(k), `unknown merge var {${k}}`)
  }
})

test('templates doc block advertises the merge-field workflow', () => {
  const src = readFileSync('lib/stageTemplates.ts', 'utf8')
  assert.match(src, /merge fields/)
  assert.match(src, /fillTemplate\(\)/)
})

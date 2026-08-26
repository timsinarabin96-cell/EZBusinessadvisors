import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ROLEPLAY_SCENARIOS, gradeRoleplay } from '../lib/negotiationRoleplay.ts'

const scenario = ROLEPLAY_SCENARIOS[0]

test('every roleplay scenario has sane bands and roles', () => {
  for (const s of ROLEPLAY_SCENARIOS) {
    assert.ok(s.fair_range[0] < s.fair_range[1], `${s.id} fair band ordered`)
    assert.ok(s.walk_away[0] < s.walk_away[1], `${s.id} walk-away ordered`)
    assert.ok(s.fair_range[0] >= s.walk_away[0], `${s.id} fair inside walk-away`)
    assert.ok(s.fair_range[1] <= s.walk_away[1], `${s.id} fair inside walk-away`)
    assert.ok(s.roles.buyer.opening.length > 0)
    assert.ok(s.roles.seller.opening.length > 0)
    assert.ok(s.tips.length >= 3)
  }
})

test('closing inside the fair band scores 100 and passes', () => {
  const grade = gradeRoleplay(scenario, 300000)
  assert.equal(grade.score, 100)
  assert.equal(grade.passed, true)
  assert.equal(grade.inFairRange, true)
})

test('closing inside walk-away but outside fair band scores 65 and passes', () => {
  const grade = gradeRoleplay(scenario, 340000) // asking — inside walk-away, above fair
  assert.equal(grade.score, 65)
  assert.equal(grade.passed, true)
  assert.equal(grade.inFairRange, false)
  assert.equal(grade.insideWalkAway, true)
})

test('closing beyond walk-away fails with feedback', () => {
  const grade = gradeRoleplay(scenario, 390000)
  assert.equal(grade.passed, false)
  assert.ok(grade.feedback.length >= 2)
  assert.match(grade.feedback[0], /walk-away/)
})

test('multiple is derived from price ÷ SDE', () => {
  const grade = gradeRoleplay(scenario, 281600)
  assert.equal(grade.sdeMultiple.toFixed(1), '2.2')
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SCENARIOS, recalcSde, gradeSimulator } from '../lib/dealSimulator.ts'

const scenario = SCENARIOS[0]

test('recalcSde adds back owner comp, perks, one-time, non-cash, interest, taxes', () => {
  assert.equal(recalcSde(scenario.financials), scenario.answer.sde)
})

test('perfect answers score 100 and pass', () => {
  const grade = gradeSimulator(scenario, scenario.answer.sde, scenario.answer.multiple)
  assert.equal(grade.score, 100)
  assert.equal(grade.passed, true)
  assert.equal(grade.sdeCorrect, true)
  assert.equal(grade.multipleCorrect, true)
  assert.equal(grade.priceCorrect, true)
})

test('within-tolerance answers pass', () => {
  const grade = gradeSimulator(scenario, scenario.answer.sde * 1.04, scenario.answer.multiple + 0.2)
  assert.equal(grade.passed, true)
  assert.ok(grade.score >= 70)
})

test('way-off answers fail with actionable feedback', () => {
  const grade = gradeSimulator(scenario, 50000, 6)
  assert.equal(grade.passed, false)
  assert.ok(grade.feedback.length >= 2)
  assert.match(grade.feedback[0], /SDE recast/)
})

test('price derives from SDE × multiple in the grade', () => {
  const grade = gradeSimulator(scenario, 154200, 3.0)
  assert.equal(grade.priceGiven, 462600)
  assert.equal(grade.priceExpected, 462600)
})

test('every scenario carries a hidden answer + band', () => {
  for (const s of SCENARIOS) {
    assert.ok(s.answer.sde > 0)
    assert.ok(s.multiple_band[0] < s.multiple_band[1])
    assert.equal(recalcSde(s.financials), s.answer.sde)
  }
})

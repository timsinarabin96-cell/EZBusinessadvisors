import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyActivity, tierForXp, nextTier, TIER_LABEL, TIER_ICON, XP } from '../lib/trainingGamification.ts'

const base = { xp: 0, current_streak: 0, best_streak: 0, modules_certified: 0, program_certified: false }

test('first lesson completion starts a streak and awards base XP', () => {
  const delta = applyActivity(base, 'lesson_complete', null, new Date('2026-08-25T12:00:00Z'))
  assert.equal(delta.xp, XP.lesson_complete + XP.streak_bonus(1))
  assert.equal(delta.current_streak, 1)
  assert.equal(delta.best_streak, 1)
})

test('same-day activity keeps the streak without advancing', () => {
  const day = new Date('2026-08-25T12:00:00Z')
  const first = applyActivity(base, 'lesson_complete', null, day)
  const second = applyActivity({ ...base, current_streak: first.current_streak, best_streak: first.best_streak }, 'quiz_pass', day.toISOString(), new Date('2026-08-25T20:00:00Z'))
  assert.equal(second.current_streak, 1)
})

test('next-day activity extends the streak', () => {
  // Realistic state: streak 1 recorded yesterday → today continues to 2.
  const state = { ...base, current_streak: 1, best_streak: 1 }
  const delta = applyActivity(state, 'lesson_complete', '2026-08-25T10:00:00Z', new Date('2026-08-26T09:00:00Z'))
  assert.equal(delta.current_streak, 2)
  assert.equal(delta.best_streak, 2)
})

test('a gap resets the streak to 1', () => {
  const delta = applyActivity(base, 'lesson_complete', '2026-08-20T10:00:00Z', new Date('2026-08-25T09:00:00Z'))
  assert.equal(delta.current_streak, 1)
  assert.equal(delta.best_streak, 1)
})

test('module certificates are the big XP milestone with no streak bonus', () => {
  const delta = applyActivity(base, 'module_certified', null, new Date('2026-08-25T12:00:00Z'))
  assert.equal(delta.xp, XP.module_certified)
})

test('tier ladder: associate → senior → master', () => {
  assert.equal(tierForXp(0), 'associate')
  assert.equal(tierForXp(499), 'associate')
  assert.equal(tierForXp(500), 'senior')
  assert.equal(tierForXp(1199), 'senior')
  assert.equal(tierForXp(1200), 'master')
})

test('nextTier reports the gap to the next title', () => {
  const n = nextTier(200)
  assert.equal(n?.tier, 'senior')
  assert.equal(n?.needed, 300)
  assert.equal(nextTier(2000), null)
})

test('tier labels and icons exist for every tier', () => {
  for (const tier of ['associate', 'senior', 'master'] as const) {
    assert.ok(TIER_LABEL[tier].length > 0)
    assert.ok(TIER_ICON[tier].length > 0)
  }
})

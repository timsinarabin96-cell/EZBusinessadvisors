import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { evaluateTrainingState } from '../lib/trainingGateCore.ts'

test('users without an assigned onboarding hold remain unblocked', () => {
  assert.deepEqual(evaluateTrainingState({ onboarding_required: false }, null), { ok: true })
})

test('assigned onboarding blocks actions until completion', () => {
  const result = evaluateTrainingState(
    { onboarding_required: true },
    { status: 'in_progress', training_hold: true },
  )
  assert.equal(result.ok, false)
  assert.equal(result.link, '/dashboard/onboarding')
})

test('completed onboarding releases the action hold', () => {
  assert.deepEqual(
    evaluateTrainingState({ onboarding_required: true }, { status: 'completed', training_hold: false }),
    { ok: true },
  )
})

test('missing enrollment fails closed for a held profile', () => {
  assert.equal(evaluateTrainingState({ onboarding_required: true }, null).ok, false)
})

test('migration isolates onboarding from global CBI tables and seeds five modules', () => {
  const sql = readFileSync('sql/agent_onboarding_training_2026_09_02.sql', 'utf8')
  assert.match(sql, /create table if not exists public\.agency_training_programs/)
  assert.match(sql, /create trigger agent_onboarding_invite_created/)
  assert.equal((sql.match(/'a1000000-0000-4000-8000-00000000000[1-5]'/g) || []).length, 5)
  assert.doesNotMatch(sql, /insert into public\.training_modules/)
})

test('sensitive routes use the shared training gate', () => {
  const routes = [
    'app/api/listings/publish/route.ts',
    'app/api/communications/route.ts',
    'app/api/nda/send/route.ts',
    'app/api/nda/counter-sign/route.ts',
    'app/api/documents/esign/route.ts',
    'app/api/documents/send-for-signature/route.ts',
    'app/api/documents/deliver/route.ts',
    'app/api/data-rooms/room/route.ts',
    'app/api/listings/documents/signed-url/route.ts',
    'app/api/share/cim/route.ts',
    'app/api/financial/bov/finalize/route.ts',
  ]
  for (const route of routes) assert.match(readFileSync(route, 'utf8'), /trainingGateResponse/)
})

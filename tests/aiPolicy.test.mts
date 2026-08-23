import assert from 'node:assert/strict'
import test from 'node:test'
import { getAiActionPolicy } from '../lib/aiPolicy.mjs'

test('routine CRM actions can run without approval', () => {
  assert.deepEqual(getAiActionPolicy('appointment.create'), {
    riskLevel: 'low', approvalRequired: false, allowed: true,
  })
})

test('external sending requires approval', () => {
  assert.deepEqual(getAiActionPolicy('email.send'), {
    riskLevel: 'high', approvalRequired: true, allowed: true,
  })
})

test('unknown actions fail closed', () => {
  assert.deepEqual(getAiActionPolicy('computer.take_over'), {
    riskLevel: 'critical', approvalRequired: true, allowed: false,
  })
})

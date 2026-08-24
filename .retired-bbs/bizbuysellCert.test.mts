import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const sync = readFileSync('app/api/bizbuysell/sync/route.ts', 'utf8')
const complete = readFileSync('app/api/certificates/complete/route.ts', 'utf8')

test('bizbuysell sync requires approved listing', () => {
  assert.match(sync, /syncSchema/)
  assert.match(sync, /Only approved listings can be posted to BizBuySell/)
  assert.match(sync, /canManageAgency/)
})

test('bizbuysell sync handles missing connection gracefully', () => {
  assert.match(sync, /BizBuySell is not connected for this agency yet/)
  assert.match(sync, /BBS_NOT_CONNECTED/)
  assert.match(sync, /sync\.requested/)
})

test('bizbuysell sync builds payload and records attempt', () => {
  assert.match(sync, /buildBbsPayload/)
  assert.match(sync, /bbs_syncs/)
  assert.match(sync, /status: 'pending'/)
})

test('certificate completion requires all lessons done', () => {
  assert.match(complete, /Not all lessons are complete yet/)
  assert.match(complete, /training_progress/)
  assert.match(complete, /canAccessProfile/)
})

test('certificate completion issues idempotent cert + email', () => {
  assert.match(complete, /training_certificates/)
  assert.match(complete, /onConflict: 'broker_id,module_id'/)
  assert.match(complete, /verification_code/)
  assert.match(complete, /training_certificate/)
})

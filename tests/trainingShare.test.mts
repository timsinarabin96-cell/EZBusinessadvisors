import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ensureAgentInvite, ensureProfileTrainingEnrollment } from '../lib/trainingShare.ts'
import { onboardingCertificateDocument } from '../lib/agentOnboarding.ts'

class Query {
  table: string
  operation = 'select'
  payload: any
  handler: (query: Query) => any
  constructor(table: string, handler: (query: Query) => any) { this.table = table; this.handler = handler }
  select() { return this }
  eq() { return this }
  is() { return this }
  gt() { return this }
  order() { return this }
  limit() { return this }
  maybeSingle() { return this }
  single() { return this }
  in() { return this }
  upsert(payload: any) { this.operation = 'upsert'; this.payload = payload; return this }
  insert(payload: any) { this.operation = 'insert'; this.payload = payload; return this }
  update(payload: any) { this.operation = 'update'; this.payload = payload; return this }
  then(resolve: (value: any) => void, reject: (reason: any) => void) {
    return Promise.resolve(this.handler(this)).then(resolve, reject)
  }
}

function database(handler: (query: Query) => any) {
  return { from: (table: string) => new Query(table, handler) }
}

test('sharing training to an enrolled profile remains idempotent', async () => {
  let enrollmentInserts = 0
  const db = database((query) => {
    if (query.table === 'agency_training_programs') return { data: [{ id: 'program-1' }], error: null }
    if (query.table === 'onboarding_module_templates') return { data: [{ id: 'template-1', title: 'One', order: 1 }], error: null }
    if (query.table === 'agency_training_enrollments' && query.operation === 'select') return { data: { id: 'enrollment-1', status: 'assigned' }, error: null }
    if (query.table === 'agency_training_enrollments' && query.operation === 'insert') enrollmentInserts += 1
    if (query.table === 'agency_training_modules' && query.operation === 'select') return { data: [{ id: 'module-1' }], error: null }
    return { data: null, error: null }
  })

  const first = await ensureProfileTrainingEnrollment(db, 'agency-1', 'profile-1')
  const second = await ensureProfileTrainingEnrollment(db, 'agency-1', 'profile-1')
  assert.equal(first.created, false)
  assert.equal(second.enrollmentId, 'enrollment-1')
  assert.equal(enrollmentInserts, 0)
})

test('sharing training by email creates an agent invite', async () => {
  let inserted: any = null
  const db = database((query) => {
    if (query.table === 'invite_tokens' && query.operation === 'select') return { data: null, error: null }
    if (query.table === 'invite_tokens' && query.operation === 'insert') {
      inserted = query.payload
      return { data: { id: 'invite-1', token: query.payload.token, expires_at: query.payload.expires_at }, error: null }
    }
    return { data: null, error: null }
  })
  const invite = await ensureAgentInvite(db, { agencyId: 'agency-1', email: 'Agent@Example.com ', createdBy: 'admin-1' })
  assert.equal(invite.created, true)
  assert.equal(inserted.target_type, 'agent')
  assert.equal(inserted.email, 'agent@example.com')
})

test('certificate document is saved in the employee folder', () => {
  const row = onboardingCertificateDocument({
    agentName: 'A. Agent', agencyId: 'agency-1', profileId: 'profile-1',
    storagePath: 'agency/agency-1/employee-files/profile-1/certificates/onboarding-2026-09-02.pdf',
    completedAt: '2026-09-02T00:00:00.000Z',
  })
  assert.equal(row.folder, 'Employee Files')
  assert.equal(row.filled_data.employee_profile_id, 'profile-1')
  assert.match(row.filled_data.storage_path, /employee-files\/profile-1\/certificates/)
})

test('employee folder migration scopes employee files', () => {
  const sql = readFileSync('sql/employee_folders_2026_09_02.sql', 'utf8')
  assert.match(sql, /add column if not exists folder text not null default 'General'/)
  assert.match(sql, /public\.is_agency_admin/)
  assert.match(sql, /employee_profile_id/)
})

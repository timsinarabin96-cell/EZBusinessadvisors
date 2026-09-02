import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  addAgencyTrainingModule,
  archiveAgencyTrainingModule,
  ensureAgencyTrainingProgram,
  moveAgencyTrainingModule,
  syncDefaultTrainingModules,
  updateAgencyTrainingModule,
  validateMaterial,
  validateModuleInput,
} from '../lib/agencyTraining.ts'
import { ensureProfileTrainingEnrollment } from '../lib/trainingShare.ts'

class Query {
  table: string
  operation = 'select'
  payload: any
  filters: [string, unknown][] = []
  handler: (query: Query) => any
  constructor(table: string, handler: (query: Query) => any) { this.table = table; this.handler = handler }
  select() { return this }
  eq(column: string, value: unknown) { this.filters.push([column, value]); return this }
  is(column: string, value: unknown) { this.filters.push([column, value]); return this }
  gt() { return this }
  order() { return this }
  limit() { return this }
  maybeSingle() { return this }
  single() { return this }
  in() { return this }
  neq() { return this }
  upsert(payload: any) { this.operation = 'upsert'; this.payload = payload; return this }
  insert(payload: any) { this.operation = 'insert'; this.payload = payload; return this }
  update(payload: any) { this.operation = 'update'; this.payload = payload; return this }
  then(resolve: (value: any) => void, reject: (reason: any) => void) { return Promise.resolve(this.handler(this)).then(resolve, reject) }
}

function database(handler: (query: Query) => any) {
  return { from: (table: string) => new Query(table, handler) }
}

const validModule = {
  title: 'Agency Standards', description: 'How our brokerage works', lessonContent: 'Read the standards.',
  quizQuestion: 'What should you follow?', quizOptions: ['Agency standards', 'Guesswork'],
  quizCorrectAnswer: 'Agency standards', isRequired: true,
}

test('module and material validation enforces quiz and URL shapes', () => {
  assert.equal(validateModuleInput(validModule).quizOptions.length, 2)
  assert.throws(() => validateModuleInput({ ...validModule, quizCorrectAnswer: 'Missing' }), /Correct answer/)
  assert.equal(validateMaterial({ title: 'Handbook', kind: 'pdf', url: 'https://example.com/handbook.pdf' }).kind, 'pdf')
  assert.throws(() => validateMaterial({ title: 'Handbook', kind: 'pdf', url: 'javascript:alert(1)' }), /http/)
})

test('add module uses the next order and writes custom content', async () => {
  let inserted: any
  const db = database((query) => {
    if (query.operation === 'select') return { data: [{ order: 5 }], error: null }
    if (query.operation === 'insert') { inserted = query.payload; return { data: { id: 'module-6', order: 6 }, error: null } }
    return { data: null, error: null }
  })
  const result = await addAgencyTrainingModule(db, 'program-1', validModule)
  assert.equal(result.order, 6)
  assert.equal(inserted.template_id, null)
  assert.deepEqual(inserted.quiz_options, validModule.quizOptions)
})

test('update and delete are limited to custom modules', async () => {
  let updated: any
  const customDb = database((query) => {
    if (query.operation === 'select') return { data: { id: 'module-1', template_id: null }, error: null }
    if (query.operation === 'update') { updated = query.payload; return { data: { id: 'module-1', order: 1 }, error: null } }
    return { data: null, error: null }
  })
  await updateAgencyTrainingModule(customDb, 'program-1', 'module-1', validModule)
  assert.equal(updated.title, validModule.title)
  await archiveAgencyTrainingModule(customDb, 'program-1', 'module-1')
  assert.ok(updated.archived_at)

  const templateDb = database((query) => ({ data: { id: 'module-1', template_id: 'template-1' }, error: null }))
  await assert.rejects(updateAgencyTrainingModule(templateDb, 'program-1', 'module-1', validModule), /cannot be edited/)
  await assert.rejects(archiveAgencyTrainingModule(templateDb, 'program-1', 'module-1'), /cannot be deleted/)
})

test('reorder swaps adjacent module orders through a collision-safe temporary value', async () => {
  const writes: any[] = []
  const db = database((query) => {
    if (query.operation === 'select') return { data: [{ id: 'one', order: 1 }, { id: 'two', order: 2 }], error: null }
    if (query.operation === 'update') { writes.push(query.payload.order); return { data: null, error: null } }
    return { data: null, error: null }
  })
  await moveAgencyTrainingModule(db, 'program-1', 'two', 'up')
  assert.equal(writes.length, 3)
  assert.ok(writes[0] < 0)
  assert.deepEqual(writes.slice(1), [2, 1])
})

test('default sync only adds missing templates without deleting custom modules', async () => {
  const inserts: any[] = []
  const db = database((query) => {
    if (query.table === 'onboarding_module_templates') return { data: [{ id: 't1', title: 'One', order: 1 }, { id: 't2', title: 'Two', order: 2 }], error: null }
    if (query.table === 'agency_training_modules' && query.operation === 'select') return { data: [{ id: 'm1', template_id: 't1', order: 1 }, { id: 'custom', template_id: null, order: 2 }], error: null }
    if (query.operation === 'insert') { inserts.push(query.payload); return { data: null, error: null } }
    return { data: null, error: null }
  })
  const result = await syncDefaultTrainingModules(db, 'program-1')
  assert.deepEqual(result, { added: 1, restored: 0 })
  assert.equal(inserts[0].template_id, 't2')
  assert.equal(inserts[0].order, 3)
})

test('share enrollment skips default seeding when program flag is false', async () => {
  let templateReads = 0
  const db = database((query) => {
    if (query.table === 'agency_training_programs') return { data: [{ id: 'program-1', use_default_templates: false }], error: null }
    if (query.table === 'onboarding_module_templates') { templateReads += 1; return { data: [], error: null } }
    if (query.table === 'agency_training_enrollments' && query.operation === 'select') return { data: { id: 'enrollment-1', status: 'assigned' }, error: null }
    if (query.table === 'agency_training_modules') return { data: [{ id: 'custom-1', is_required: true }], error: null }
    return { data: null, error: null }
  })
  const program = await ensureAgencyTrainingProgram(db, 'agency-1')
  assert.equal(program.use_default_templates, false)
  const result = await ensureProfileTrainingEnrollment(db, 'agency-1', 'profile-1')
  assert.equal(result.moduleCount, 1)
  assert.equal(templateReads, 0)
})

test('custom migration makes invite bootstrap honor the default flag', () => {
  const sql = readFileSync('sql/agency_training_custom_2026_09_02.sql', 'utf8')
  assert.match(sql, /add column if not exists use_default_templates boolean not null default true/)
  assert.match(sql, /if v_use_default_templates then/)
  assert.match(sql, /v_use_default_templates or template_id is null/)
  assert.match(sql, /agency_training_module_manage/)
})

test('agency route exposes all manager actions', () => {
  const route = readFileSync('app/api/training/agency/route.ts', 'utf8')
  for (const action of ['add-module', 'update-module', 'delete-module', 'reorder', 'set-default-mode', 'reset-to-default', 'attach-material']) {
    assert.match(route, new RegExp(action))
  }
  assert.match(route, /canManageTeam/)
})

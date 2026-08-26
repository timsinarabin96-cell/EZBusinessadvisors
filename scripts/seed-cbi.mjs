/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Seed CBI Program into live Supabase
// Usage: node scripts/seed-cbi.mjs
// Reads .env.local, uses SERVICE ROLE key. Replaces the legacy 10-module
// curriculum with the new 12-module CBI program (3 phases). Idempotent.
// =============================================================================
import { readFile } from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'
import { MODULES_1 } from './data-cbi-part1.mjs'
import { MODULES_2 } from './data-cbi-part2.mjs'
import { MODULES_3 } from './data-cbi-part3.mjs'
import { QUIZ_BANK } from './data-cbi-quiz.mjs'
import { QUIZ_BANK_3 } from './data-cbi-quiz3.mjs'

function parseEnv(source) {
  return Object.fromEntries(source
    .split(/\r?\n/)
    .filter((line) => line && !line.trimStart().startsWith('#') && line.includes('='))
    .map((line) => {
      const index = line.indexOf('=')
      const key = line.slice(0, index).trim()
      let value = line.slice(index + 1).trim()
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
      return [key, value]
    }))
}

const env = parseEnv(await readFile('.env.local', 'utf8'))
const url = env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) throw new Error('Supabase URL and service-role key are required in .env.local')

const db = createClient(url, serviceKey, { auth: { persistSession: false } })

// Program-level module (hidden from the module grid, used for the course
// completion certificate). is_published=false keeps it out of /api/training.
const PROGRAM_MODULE = {
  id: 'c0dec0de-00ff-4000-8000-0000000000ff',
  title: 'Business Intermediary Course Completion',
  description: 'Full CBI program completion — all 14 modules certified.',
  icon: '🏆',
  order: 99,
  is_published: false,
}

// --- 1. Wipe legacy curriculum (cascades lessons/quizzes/progress/certs) -----
console.log('Deleting legacy training content…')
const { error: delErr } = await db.from('training_modules').delete().neq('id', '00000000-0000-0000-0000-000000000000')
if (delErr) {
  // Some tables may not exist yet — create them via schema file first if so.
  console.warn('Delete warning (ok if tables are new):', delErr.message)
}

// --- 2. Insert program module + 12 curriculum modules ------------------------
const allModules = [PROGRAM_MODULE, ...MODULES_1, ...MODULES_2, ...MODULES_3]
console.log(`Inserting ${allModules.length} modules…`)
const { error: modErr } = await db.from('training_modules').upsert(
  allModules.map((m) => ({
    id: m.id,
    title: m.title,
    description: m.description ?? null,
    icon: m.icon ?? '📘',
    order: m.order,
    is_published: m.is_published ?? true,
  })),
  { onConflict: 'id' },
)
if (modErr) throw new Error('modules upsert failed: ' + modErr.message)

// --- 3. Lessons ----------------------------------------------------------------
const lessons = []
for (const m of [...MODULES_1, ...MODULES_2, ...MODULES_3]) {
  m.lessons.forEach((l, i) => {
    lessons.push({
      id: l.id,
      module_id: m.id,
      title: l.title,
      content: l.content ?? null,
      video_url: l.video_url ?? null,
      pdf_url: l.pdf_url ?? null,
      order: i + 1,
      duration_minutes: l.duration_minutes ?? 12,
      is_published: true,
    })
  })
}
console.log(`Inserting ${lessons.length} lessons…`)
const { error: lesErr } = await db.from('training_lessons').upsert(lessons, { onConflict: 'id' })
if (lesErr) throw new Error('lessons upsert failed: ' + lesErr.message)

// --- 4. Quiz questions ----------------------------------------------------------
const questions = []
let qi = 0
for (const [lessonId, qs] of Object.entries({ ...QUIZ_BANK, ...QUIZ_BANK_3 })) {
  for (const item of qs) {
    qi += 1
    questions.push({
      id: `c0dec0de-${String(qi).padStart(4, '0')}-4000-8000-000000000000`,
      lesson_id: lessonId,
      question: item.q,
      options: item.opts,
      correct_answer: item.a,
    })
  }
}
console.log(`Inserting ${questions.length} quiz questions…`)
const { error: qErr } = await db.from('training_quiz_questions').upsert(questions, { onConflict: 'id' })
if (qErr) throw new Error('quiz upsert failed: ' + qErr.message)

// --- 5. Verify -------------------------------------------------------------------
const { data: mods, error: vErr } = await db.from('training_modules').select('id,title,"order",is_published').order('order')
if (vErr) throw new Error('verify failed: ' + vErr.message)
const { count: lessonCount } = await db.from('training_lessons').select('id', { count: 'exact', head: true })
const { count: quizCount } = await db.from('training_quiz_questions').select('id', { count: 'exact', head: true })

console.log('\n✅ CBI SEED COMPLETE')
console.log(`Modules: ${mods.length} (${mods.filter((m) => m.is_published).length} published + 1 hidden program)`)
mods.forEach((m) => console.log(`  [${m.order}] ${m.title}`))
console.log(`Lessons: ${lessonCount} · Quiz questions: ${quizCount}`)

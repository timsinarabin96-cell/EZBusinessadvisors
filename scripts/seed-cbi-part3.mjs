// =============================================================================
// Additive seed — CBI modules 13–14 (Code of Ethics, Brand Awareness)
// Usage: node scripts/seed-cbi-part3.mjs
// Upserts ONLY the new modules/lessons/quizzes. Never deletes — existing
// agent progress and certificates are untouched.
// =============================================================================
import { readFile } from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'
import { MODULES_3 } from './data-cbi-part3.mjs'
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

// --- 1. Upsert modules 13–14 -------------------------------------------------
console.log(`Upserting ${MODULES_3.length} new modules…`)
const { error: modErr } = await db.from('training_modules').upsert(
  MODULES_3.map((m) => ({
    id: m.id,
    title: m.title,
    description: m.description ?? null,
    icon: m.icon ?? '📘',
    order: m.order,
    is_published: true,
  })),
  { onConflict: 'id' },
)
if (modErr) throw new Error('modules upsert failed: ' + modErr.message)

// --- 2. Upsert lessons --------------------------------------------------------
const lessons = []
for (const m of MODULES_3) {
  m.lessons.forEach((l, i) => {
    lessons.push({
      id: l.id,
      module_id: m.id,
      title: l.title,
      content: l.content ?? null,
      video_url: null,
      pdf_url: null,
      order: i + 1,
      duration_minutes: l.duration_minutes ?? 12,
      is_published: true,
    })
  })
}
console.log(`Upserting ${lessons.length} lessons…`)
const { error: lesErr } = await db.from('training_lessons').upsert(lessons, { onConflict: 'id' })
if (lesErr) throw new Error('lessons upsert failed: ' + lesErr.message)

// --- 3. Upsert quiz questions -------------------------------------------------
const questions = []
let qi = 0
for (const [lessonId, qs] of Object.entries(QUIZ_BANK_3)) {
  for (const item of qs) {
    qi += 1
    questions.push({
      id: `c0dec0de-${String(72 + qi).padStart(4, '0')}-4000-8000-000000000000`,
      lesson_id: lessonId,
      question: item.q,
      options: item.opts,
      correct_answer: item.a,
    })
  }
}
console.log(`Upserting ${questions.length} quiz questions…`)
const { error: qErr } = await db.from('training_quiz_questions').upsert(questions, { onConflict: 'id' })
if (qErr) throw new Error('quiz upsert failed: ' + qErr.message)

// --- 4. Verify -----------------------------------------------------------------
const { data: mods } = await db.from('training_modules').select('id,title,"order",is_published').order('order')
const { count: lessonCount } = await db.from('training_lessons').select('id', { count: 'exact', head: true })
const { count: quizCount } = await db.from('training_quiz_questions').select('id', { count: 'exact', head: true })

console.log('\n✅ PART-3 SEED COMPLETE (additive — progress preserved)')
console.log(`Modules now: ${mods.length} (${mods.filter((m) => m.is_published).length} published + 1 hidden program)`)
mods.forEach((m) => console.log(`  [${m.order}] ${m.title}`))
console.log(`Lessons: ${lessonCount} · Quiz questions: ${quizCount}`)

'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'

type Module = {
  id: string
  title: string
  description: string | null
  lesson_content: string
  quiz_question: string
  quiz_options: string[]
  order: number
  task: { completed: boolean; quiz_score: number | null } | null
}

export function AgentOnboardingDashboard() {
  const [modules, setModules] = useState<Module[]>([])
  const [enrollment, setEnrollment] = useState<any>(null)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)

  async function request(path: string, init?: RequestInit) {
    const { data } = await supabase.auth.getSession()
    return fetch(path, { ...init, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token || ''}`, ...(init?.headers || {}) } })
  }

  async function load() {
    setLoading(true)
    const response = await request('/api/training/onboarding')
    const json = await response.json()
    if (json.ok) {
      setModules(json.modules || [])
      setEnrollment(json.enrollment || null)
    } else setMessage(json.error || 'Could not load onboarding')
    setLoading(false)
  }

  useEffect(() => { void load() }, [])

  async function submit(moduleId: string) {
    setMessage('')
    const response = await request('/api/training/onboarding', { method: 'POST', body: JSON.stringify({ moduleId, answer: answers[moduleId] }) })
    const json = await response.json()
    if (!json.ok) return setMessage(json.error || 'Could not save quiz')
    if (!json.passed) return setMessage('Not quite. Review the lesson and try again.')
    setMessage(json.completed ? 'All modules complete — your certificate is ready.' : 'Module complete.')
    await load()
  }

  if (loading) return <div style={{ padding: 32 }}>Loading onboarding…</div>
  if (!enrollment) return <div style={{ padding: 32 }}>No required agent onboarding is assigned to this account.</div>
  const completed = modules.filter((module) => module.task?.completed).length

  return <div style={{ maxWidth: 920, margin: '0 auto', padding: '32px 22px 64px' }}>
    <div style={{ background: 'linear-gradient(135deg,#111a2e,#253653)', color: 'white', padding: 28, borderRadius: 18, marginBottom: 22 }}>
      <div style={{ color: '#d6b75e', textTransform: 'uppercase', letterSpacing: '.16em', fontSize: 12, fontWeight: 800 }}>Required Agent Training</div>
      <h1 style={{ margin: '8px 0 6px', fontFamily: 'Georgia,serif' }}>Platform Onboarding</h1>
      <p style={{ margin: 0, color: '#d8deea' }}>Browse the CRM while you learn. Deal actions unlock after all five quizzes are complete.</p>
      <div style={{ marginTop: 18, height: 9, background: '#ffffff22', borderRadius: 99, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${modules.length ? completed / modules.length * 100 : 0}%`, background: '#d6b75e' }} />
      </div>
      <div style={{ marginTop: 7, fontSize: 13 }}>{completed} of {modules.length} modules complete</div>
    </div>

    {message && <div style={{ padding: 14, borderRadius: 10, background: '#fff7d6', marginBottom: 16 }}>{message}</div>}
    {enrollment.certificateUrl && <a href={enrollment.certificateUrl} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginBottom: 18, color: '#8a6415', fontWeight: 800 }}>Download Certificate of Completion →</a>}

    <div style={{ display: 'grid', gap: 16 }}>
      {modules.map((module) => <section key={module.id} style={{ border: '1px solid #dfe3ea', borderRadius: 14, padding: 22, background: 'white' }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          <div style={{ width: 34, height: 34, borderRadius: 99, display: 'grid', placeItems: 'center', background: module.task?.completed ? '#176b48' : '#15223b', color: 'white', fontWeight: 800 }}>{module.task?.completed ? '✓' : module.order}</div>
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: 0, fontSize: 20 }}>{module.title}</h2>
            <p style={{ color: '#667085', margin: '5px 0 16px' }}>{module.description}</p>
            <p style={{ whiteSpace: 'pre-line', lineHeight: 1.65, color: '#26303f' }}>{module.lesson_content}</p>
            {!module.task?.completed && <div style={{ marginTop: 18, paddingTop: 18, borderTop: '1px solid #edf0f4' }}>
              <div style={{ fontWeight: 800, marginBottom: 10 }}>{module.quiz_question}</div>
              <div style={{ display: 'grid', gap: 8 }}>
                {module.quiz_options.map((option) => <label key={option} style={{ display: 'flex', gap: 9, alignItems: 'center' }}>
                  <input type="radio" name={module.id} value={option} checked={answers[module.id] === option} onChange={() => setAnswers((current) => ({ ...current, [module.id]: option }))} /> {option}
                </label>)}
              </div>
              <button onClick={() => void submit(module.id)} disabled={!answers[module.id]} style={{ marginTop: 15, border: 0, borderRadius: 9, padding: '10px 16px', background: '#15223b', color: 'white', fontWeight: 800, cursor: 'pointer' }}>Submit Quiz</button>
            </div>}
          </div>
        </div>
      </section>)}
    </div>
  </div>
}


'use client'

// =============================================================================
// /onboarding — AI-guided first-week setup for new agency owners.
// Shows the step checklist (profile → agency → API key → first listing → team
// → billing), an AI guide bot that answers "how do I…", and the "I'm good"
// button that completes onboarding. Accessible for the agency owner until
// they click through — the guide stays for 7 days.
// =============================================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { authenticatedFetch } from '@/lib/authenticatedFetch'
import { LoadingState } from '@/components/ui'
import { useToast } from '@/components/ui/Toast'
import {
  fetchAgencyOnboarding, markAgencyStepDone, completeAgencyOnboarding, agencyDaysRemaining,
  DEFAULT_ONBOARDING_STEPS, STEP_LINKS, STEP_HELP,
  type AgencyOnboarding,
} from '@/lib/onboarding'

interface ChatMsg { role: 'user' | 'bot'; text: string }

export default function OnboardingPage() {
  const toast = useToast()
  const router = useRouter()
  const [onboard, setOnboard] = useState<AgencyOnboarding | null>(null)
  const [loading, setLoading] = useState(true)
  const [chat, setChat] = useState<ChatMsg[]>([{ role: 'bot', text: "Hey! 👋 I'm Yavin, your setup guide. I'll walk you through getting your agency live this week. Ask me anything — 'how do I add my API key?' — or just start checking off steps. When you're done, hit **I'm good** and I'll leave you alone. 😊" }])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    const o = await fetchAgencyOnboarding()
    setOnboard(o)
    setLoading(false)
    // Auto-mark any steps that are already satisfied (e.g. profile exists).
    if (o && o.status === 'active') {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: profile } = await supabase.from('profiles').select('full_name, avatar_url').eq('id', user.id).maybeSingle()
        if (profile?.full_name) {
          const step = (o.steps || []).find((s) => s.key === 'profile')
          if (step && !step.done) await markAgencyStepDone('profile').then((r) => { if (r.ok) load() })
        }
      }
    }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [chat])

  const doStep = async (key: string) => {
    const r = await markAgencyStepDone(key)
    if (r.ok) { toast('Step complete ✅', 'success'); load() }
    else toast(r.error || 'Failed', 'error')
  }

  const finish = async () => {
    const r = await completeAgencyOnboarding()
    if (r.ok) {
      toast('Welcome aboard! 🎉 Your setup is complete.', 'success')
      router.push('/dashboard')
    } else toast(r.error || 'Failed', 'error')
  }

  const send = async () => {
    const text = input.trim()
    if (!text || sending) return
    setInput('')
    setChat((c) => [...c, { role: 'user', text }])
    setSending(true)
    try {
      const res = await authenticatedFetch('/api/onboarding/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      })
      const j = await res.json()
      setChat((c) => [...c, { role: 'bot', text: j.ok ? j.reply : (j.error || 'Guide unavailable') }])
    } catch (e: any) {
      setChat((c) => [...c, { role: 'bot', text: e.message || 'Guide unavailable' }])
    } finally {
      setSending(false)
    }
  }

  if (loading) return <LoadingState label="Loading your setup guide..." />

  if (!onboard || onboard.status === 'completed') {
    return (
      <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#0b0c10,#1a1a2e)', display: 'grid', placeItems: 'center', padding: 40 }}>
        <div style={{ background: '#fff', borderRadius: 18, padding: '40px 36px', maxWidth: 460, textAlign: 'center', boxShadow: '0 24px 80px rgba(0,0,0,0.4)' }}>
          <div style={{ fontSize: 44 }}>🎉</div>
          <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 24, color: '#1a1a2e', margin: '10px 0 6px' }}>{onboard?.status === 'completed' ? 'Setup complete!' : 'Nothing to set up'}</h1>
          <p style={{ color: '#777', fontSize: 14, lineHeight: 1.6 }}>{onboard?.status === 'completed' ? 'Your agency is fully configured. Enjoy the platform!' : 'No active onboarding for your account.'}</p>
          <Link href="/dashboard" style={{ display: 'inline-block', marginTop: 18, background: '#1a1a2e', color: '#c9a84c', padding: '12px 28px', borderRadius: 9, textDecoration: 'none', fontWeight: 800 }}>Go to Dashboard →</Link>
        </div>
      </div>
    )
  }

  const days = agencyDaysRemaining(onboard)
  const steps = onboard.steps && onboard.steps.length ? onboard.steps : DEFAULT_ONBOARDING_STEPS.map((s) => ({ ...s, done: false }))
  const doneCount = steps.filter((s) => s.done).length

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#0b0c10 0%,#12395a 60%,#176b87 100%)', padding: '30px 18px 60px' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 26 }}>
          <div style={{ fontSize: 38 }}>🦅</div>
          <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 30, color: '#fff', margin: '6px 0 4px' }}>Welcome — let's set up your agency</h1>
          <p style={{ color: '#b9c6d4', fontSize: 14, margin: 0 }}>
            {days !== null && days > 0 ? <>Your AI guide is here for <b style={{ color: '#c9a84c' }}>{days} more day{days === 1 ? '' : 's'}</b> — no rush.</> : 'Your AI guide is here — no rush.'} · {doneCount}/{steps.length} steps done
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(430px, 1fr))', gap: 20, alignItems: 'start' }}>
          {/* Left: checklist */}
          <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.35)' }}>
            <div style={{ padding: '18px 22px', background: '#1a1a2e', color: '#fff' }}>
              <div style={{ fontWeight: 800, fontSize: 16 }}>✅ Your setup checklist</div>
              <div style={{ fontSize: 12.5, color: '#c9a84c', marginTop: 3 }}>{onboard.plan_type === 'enterprise' ? 'Enterprise' : onboard.plan_type === 'professional' ? 'Professional' : 'Owner'} plan · {onboard.owner_email}</div>
            </div>
            <div style={{ padding: '16px 22px 22px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {steps.map((s, i) => (
                <div key={s.key} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: 12, borderRadius: 10, background: s.done ? '#e8f7ee' : '#f8f6ef', border: s.done ? '1px solid #bfe8cd' : '1px solid #ece8dc' }}>
                  <div style={{ width: 26, height: 26, flex: '0 0 26px', borderRadius: '50%', background: s.done ? '#15803d' : '#fff', color: s.done ? '#fff' : '#999', border: '1px solid #d8d2c2', display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 800 }}>
                    {s.done ? '✓' : i + 1}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 13.5, color: '#1a1a2e' }}>{s.label}</div>
                    <div style={{ fontSize: 12, color: '#777', marginTop: 3 }}>{STEP_HELP[s.key] || ''}</div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <Link href={STEP_LINKS[s.key] || '/dashboard'} style={{ fontSize: 12, color: '#0e7490', fontWeight: 800, textDecoration: 'none' }}>Go there →</Link>
                      {!s.done && (
                        <button onClick={() => doStep(s.key)} style={{ fontSize: 12, background: 'transparent', border: 'none', color: '#15803d', fontWeight: 800, cursor: 'pointer' }}>Mark done ✓</button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              <button onClick={finish} style={{ marginTop: 8, padding: '14px 0', borderRadius: 10, background: '#15803d', color: '#fff', border: 'none', fontWeight: 800, fontSize: 15, cursor: 'pointer', fontFamily: 'Georgia, serif' }}>
                🎉 I'm good — finish setup
              </button>
            </div>
          </div>

          {/* Right: AI guide chat */}
          <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.35)', display: 'flex', flexDirection: 'column', height: 560 }}>
            <div style={{ padding: '14px 18px', background: '#0e7490', color: '#fff', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#fff', display: 'grid', placeItems: 'center', fontSize: 17 }}>🤖</div>
              <div>
                <div style={{ fontWeight: 800, fontSize: 14 }}>Yavin — your setup guide</div>
                <div style={{ fontSize: 11.5, opacity: 0.85 }}>Ask anything: API keys, profile, first listing…</div>
              </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {chat.map((m, i) => (
                <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
                  <div style={{ padding: '10px 14px', borderRadius: 12, fontSize: 13, lineHeight: 1.55, whiteSpace: 'pre-wrap', background: m.role === 'user' ? '#1a1a2e' : '#f0f4f8', color: m.role === 'user' ? '#fff' : '#1a1a2e' }}>
                    {m.text}
                  </div>
                </div>
              ))}
              {sending && <div style={{ alignSelf: 'flex-start', fontSize: 12.5, color: '#888' }}>Yavin is typing…</div>}
              <div ref={chatEndRef} />
            </div>
            <div style={{ padding: 12, borderTop: '1px solid #ece8dc', display: 'flex', gap: 8 }}>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') send() }}
                placeholder="Ask your guide… (e.g. how do I add an API key?)"
                style={{ flex: 1, padding: '11px 13px', borderRadius: 9, border: '1px solid #d8d2c2', fontSize: 13.5, outline: 'none' }}
              />
              <button onClick={send} disabled={sending || !input.trim()} style={{ padding: '11px 18px', borderRadius: 9, background: sending || !input.trim() ? '#cbd5e1' : '#0e7490', color: '#fff', border: 'none', fontWeight: 800, fontSize: 13, cursor: sending || !input.trim() ? 'not-allowed' : 'pointer' }}>
                Send
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

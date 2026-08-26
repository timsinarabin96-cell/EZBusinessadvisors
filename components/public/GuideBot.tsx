/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

// =============================================================================
// GuideBot — floating DeepSeek-powered chat widget (bottom-right).
// Helps visitors figure out where to go and what to do on the site:
// browse listings, sell a business, join the network, contact a broker, etc.
// =============================================================================

import { useEffect, useRef, useState } from 'react'

interface Msg { role: 'user' | 'assistant'; content: string }

const PUBLIC_SUGGESTIONS = [
  'I want to buy a business',
  'I want to sell my business',
  'I am an attorney / CPA / broker — how do I join?',
  'How do I get the full financial details?',
]

const CRM_SUGGESTIONS = [
  'How do I create and publish a listing?',
  'How does Save & Go Live work?',
  'How do I invite an attorney to the network?',
  'Where is my deal pipeline?',
]

export default function GuideBot({ mode = 'public' }: { mode?: 'public' | 'crm' }) {
  const isCrm = mode === 'crm'
  const [open, setOpen] = useState(false)
  const [showHint, setShowHint] = useState(false)
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: 'assistant', content: isCrm
      ? '👋 Hi! I\'m your CRM assistant. Ask me how to use any feature — listings, pipeline, invites, documents, AI agents — and I\'ll point you to the right place.'
      : '👋 Hi! I\'m your Concord guide. Tell me what you\'re looking for — buying, selling, or joining our network — and I\'ll point you the right way.' },
  ])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs, open])

  // First-visit hint so the assistant is impossible to miss.
  useEffect(() => {
    try {
      const key = isCrm ? 'crm-bot-hint-shown' : 'bot-hint-shown'
      if (!localStorage.getItem(key)) {
        setShowHint(true)
        const t = setTimeout(() => {
          setShowHint(false)
          try { localStorage.setItem(key, '1') } catch {}
        }, 9000)
        return () => clearTimeout(t)
      }
    } catch {}
  }, [isCrm])

  const send = async (text: string) => {
    const content = text.trim()
    if (!content || busy) return
    const next: Msg[] = [...msgs, { role: 'user', content }]
    setMsgs(next)
    setInput('')
    setBusy(true)
    try {
      // Session id persists per visitor (localStorage) so the agent
      // remembers the conversation across page loads.
      let sessionId = ''
      try { sessionId = localStorage.getItem('concord-chat-session') || '' } catch {}

      const res = await fetch('/api/chat-widget/message', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: content, sessionId: sessionId || undefined, mode: isCrm ? 'crm' : 'public' }),
      })
      const j = await res.json()
      if (!j.ok) throw new Error(j.error || 'send failed')
      try { localStorage.setItem('concord-chat-session', j.sessionId) } catch {}

      // Poll for the agent's reply (same brain as SMS/voice — books
      // appointments into the CRM, alerts the broker, remembers context).
      const lastSeen = Date.now()
      let reply = ''
      for (let i = 0; i < 25 && !reply; i++) {
        await new Promise((r) => setTimeout(r, 1800))
        try {
          const p = await fetch(`/api/chat-widget/poll?session=${encodeURIComponent(j.sessionId)}&after=${new Date(lastSeen - 60000).toISOString()}`)
          const pj = await p.json()
          const latest = (pj.messages || []).filter((m: any) => m.role === 'assistant')
          if (latest.length) reply = latest[latest.length - 1].content
        } catch {}
      }
      setMsgs((m) => [...m, { role: 'assistant', content: reply || 'A broker will get back to you shortly — hang tight!' }])
    } catch {
      setMsgs((m) => [...m, { role: 'assistant', content: 'Sorry — I hit a connection error. Please try again in a moment.' }])
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {/* First-visit hint bubble */}
      {showHint && !open && (
        <div
          onClick={() => { setOpen(true); setShowHint(false) }}
          style={{
            position: 'fixed', bottom: 92, right: 22, zIndex: 9998,
            background: '#fff', border: '1px solid #0e7490', borderRadius: 14,
            padding: '12px 16px', boxShadow: '0 12px 40px rgba(14,116,144,0.25)',
            maxWidth: 260, cursor: 'pointer', animation: 'none',
            fontSize: 13, color: '#1e293b', lineHeight: 1.5,
          }}
        >
          <span style={{ fontWeight: 800, color: '#0e7490' }}>✨ Need help?</span>
          <div>Ask me anything about {isCrm ? 'the CRM' : 'this site'} — I\'m the AI assistant.</div>
        </div>
      )}
      {/* Floating button */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Chat with our guide"
        style={{
          position: 'fixed', bottom: 22, right: 22, zIndex: 9999,
          width: 58, height: 58, borderRadius: '50%', border: 'none', cursor: 'pointer',
          background: 'linear-gradient(135deg,#0e7490,#155e75)', color: '#fff', fontSize: 26,
          boxShadow: '0 10px 30px rgba(14,116,144,0.45)', display: 'grid', placeItems: 'center',
          transition: 'transform .15s ease',
        }}
      >
        {open ? '✕' : '💬'}
      </button>

      {/* Chat window */}
      {open && (
        <div style={{
          position: 'fixed', bottom: 92, right: 22, zIndex: 9999,
          width: 'min(380px, calc(100vw - 44px))', height: 'min(520px, calc(100vh - 130px))',
          background: '#fff', borderRadius: 18, boxShadow: '0 24px 70px rgba(16,42,67,0.3)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden', border: '1px solid #e2e8f0',
        }}>
          {/* Header */}
          <div style={{ background: 'linear-gradient(135deg,#0e7490,#155e75)', color: '#fff', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'grid', placeItems: 'center', fontSize: 17 }}>🤖</div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 14 }}>{isCrm ? 'CRM Assistant' : 'Concord Assistant'}</div>
              <div style={{ fontSize: 11, opacity: 0.85 }}>Live agent · books appointments · 24/7</div>
            </div>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10, background: '#f8fafc' }}>
            {msgs.map((m, i) => (
              <div key={i} style={{
                maxWidth: '85%', padding: '10px 13px', borderRadius: 14, fontSize: 13.5, lineHeight: 1.55, whiteSpace: 'pre-wrap',
                background: m.role === 'assistant' ? '#fff' : '#0e7490', color: m.role === 'assistant' ? '#1e293b' : '#fff',
                alignSelf: m.role === 'assistant' ? 'flex-start' : 'flex-end',
                border: m.role === 'assistant' ? '1px solid #e2e8f0' : 'none',
                borderBottomLeftRadius: m.role === 'assistant' ? 4 : 14, borderBottomRightRadius: m.role === 'assistant' ? 14 : 4,
              }}>
                {m.content}
              </div>
            ))}
            {busy && (
              <div style={{ alignSelf: 'flex-start', padding: '10px 13px', borderRadius: 14, background: '#fff', border: '1px solid #e2e8f0', fontSize: 13.5, color: '#64748b' }}>
                Thinking…
              </div>
            )}
            <div ref={endRef} />
          </div>

          {/* Suggestions */}
          {msgs.length <= 2 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '0 12px 8px', background: '#f8fafc' }}>
              {(isCrm ? CRM_SUGGESTIONS : PUBLIC_SUGGESTIONS).map((s) => (
                <button key={s} onClick={() => send(s)} style={{ padding: '6px 10px', borderRadius: 999, border: '1px solid #cbd5e1', background: '#fff', color: '#0e7490', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div style={{ display: 'flex', gap: 8, padding: 12, borderTop: '1px solid #e2e8f0', background: '#fff' }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') send(input) }}
              placeholder="Ask me anything…"
              style={{ flex: 1, padding: '10px 12px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 13.5, outline: 'none', fontFamily: 'inherit' }}
            />
            <button onClick={() => send(input)} disabled={busy || !input.trim()} style={{ padding: '10px 16px', borderRadius: 10, background: '#0e7490', color: '#fff', border: 'none', fontWeight: 700, cursor: busy || !input.trim() ? 'not-allowed' : 'pointer', fontSize: 14 }}>
              ➤
            </button>
          </div>
        </div>
      )}
    </>
  )
}

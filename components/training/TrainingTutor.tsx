/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useEffect, useRef, useState } from 'react'
import { authenticatedFetch } from '@/lib/authenticatedFetch'

interface TutorMessage {
  role: 'user' | 'assistant'
  content: string
}

/**
 * AI Tutor — Socratic coach panel for a lesson. Ask questions about the
 * material, get grounded answers from DeepSeek with the lesson + quiz as
 * context. Server-side API keeps the key out of the browser.
 */
export default function TrainingTutor({ lessonId, lessonTitle }: { lessonId: string; lessonTitle?: string }) {
  const [messages, setMessages] = useState<TutorMessage[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, open])

  const ask = async () => {
    const text = input.trim()
    if (!text || busy) return
    setError('')
    const next: TutorMessage[] = [...messages, { role: 'user', content: text }]
    setMessages(next)
    setInput('')
    setBusy(true)
    try {
      const res = await authenticatedFetch('/api/training/tutor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lessonId,
          message: text,
          history: next.slice(0, -1).map((m) => ({ role: m.role, content: m.content })),
        }),
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error || 'Tutor unavailable')
      setMessages((m) => [...m, { role: 'assistant', content: json.reply }])
    } catch (e: any) {
      setError(e.message || 'Tutor unavailable — try again in a moment.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ marginTop: 24, border: '1px solid var(--line)', borderRadius: 12, background: '#fff', overflow: 'hidden' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
      >
        <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--navy)' }}>🎓 AI Tutor {lessonTitle ? `— ${lessonTitle}` : ''}</span>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{open ? 'Hide ▲' : 'Ask questions ▼'}</span>
      </button>

      {open && (
        <div style={{ borderTop: '1px solid var(--line)', padding: '16px 18px' }}>
          {messages.length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12, lineHeight: 1.6 }}>
              Stuck on a concept? Ask anything about this lesson — I&apos;ll coach you through it (Socratic style, no answers handed over 😉).
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 320, overflowY: 'auto', marginBottom: 12 }}>
            {messages.map((m, i) => (
              <div
                key={i}
                style={{
                  alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '85%',
                  padding: '10px 14px',
                  borderRadius: 12,
                  fontSize: 13.5,
                  lineHeight: 1.55,
                  whiteSpace: 'pre-wrap',
                  background: m.role === 'user' ? 'var(--navy)' : '#f4f2ea',
                  color: m.role === 'user' ? '#fff' : 'var(--ink)',
                }}
              >
                {m.content}
              </div>
            ))}
            {busy && (
              <div style={{ alignSelf: 'flex-start', fontSize: 13, color: 'var(--muted)', padding: '6px 4px' }}>Tutor is thinking…</div>
            )}
            <div ref={bottomRef} />
          </div>

          {error && <div style={{ fontSize: 12.5, color: '#c0392b', marginBottom: 10 }}>{error}</div>}

          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') ask() }}
              placeholder="Ask about this lesson…"
              maxLength={2000}
              style={{ flex: 1, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--line)', fontSize: 13.5, outline: 'none' }}
            />
            <button
              type="button"
              onClick={ask}
              disabled={busy || !input.trim()}
              style={{ padding: '10px 18px', borderRadius: 8, background: 'var(--gold)', color: 'var(--navy)', border: 'none', fontWeight: 800, fontSize: 13.5, cursor: busy || !input.trim() ? 'not-allowed' : 'pointer', opacity: busy || !input.trim() ? 0.6 : 1 }}
            >
              Ask
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

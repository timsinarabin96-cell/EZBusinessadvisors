'use client'

// =============================================================================
// ListingCopilot — the AI Listing Copilot: chat inside the listing workflow.
// Scoped to one listing (entityId) with the listing agent, which loads the
// listing's readiness, financials, market band, workflow and documents so the
// AI can diagnose blockers, draft copy, explain valuation, and recommend next
// steps. Mirrors AgentChat's patterns; renders as a compact rail panel.
// =============================================================================

import { useEffect, useRef, useState } from 'react'
import { authHeaders } from '@/lib/authToken'

interface Msg {
  id: string
  role: 'user' | 'assistant'
  content: string
}

const QUICK_PROMPTS = [
  'Draft a headline for this listing',
  'Write the buyer-facing description',
  'Why is this listing not publish-ready?',
  'What should I do next?',
  'Explain the valuation range',
]

let counter = 0
const uid = () => `c${Date.now()}-${counter++}`

export default function ListingCopilot({ listingId, businessName }: { listingId: string; businessName?: string | null }) {
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, loading])

  async function send(text?: string) {
    const trimmed = (text ?? input).trim()
    if (!trimmed || loading) return
    const userMsg: Msg = { id: uid(), role: 'user', content: trimmed }
    const next = [...messages, userMsg]
    setMessages(next)
    setInput('')
    setError(null)
    setLoading(true)

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          agent: 'listing',
          entityId: listingId,
          message: trimmed,
          history: next.map((m) => ({ role: m.role, content: m.content })).slice(-10),
        }),
      })
      const payload = (await res.json().catch(() => null)) as
        | { ok?: boolean; reply?: string; error?: string; code?: string }
        | null

      if (!res.ok || !payload?.ok) {
        const code = payload?.code
        const hint =
          code === 'AI_NOT_CONFIGURED'
            ? 'AI is not configured for this deployment yet.'
            : payload?.error || 'The AI service returned an error. Please try again.'
        throw new Error(hint)
      }

      setMessages((m) => [...m, { id: uid(), role: 'assistant', content: payload.reply || '' }])
    } catch (e: any) {
      setError(e.message || 'Copilot unavailable')
      setMessages((m) => m.filter((x) => x.id !== userMsg.id))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 14, overflow: 'hidden', background: '#fff', display: 'flex', flexDirection: 'column', height: 460 }}>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, var(--navy), #23234a)', color: '#fff', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 18 }}>🤖</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 800 }}>AI Listing Copilot</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)' }}>
            {businessName ? `Advising on ${businessName}` : 'Listing advisor'} · knows this deal's readiness & market
          </div>
        </div>
        {messages.length > 0 && (
          <button onClick={() => setMessages([])} style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', borderRadius: 7, padding: '4px 9px', fontSize: 11, cursor: 'pointer' }}>
            Clear
          </button>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 9, background: '#fafbfc' }}>
        {messages.length === 0 && (
          <div style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.55, padding: '4px 2px' }}>
            Ask me anything about this listing — readiness, valuation, copy, or what to do next.
          </div>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            style={{
              alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '88%',
              padding: '9px 12px',
              borderRadius: 12,
              fontSize: 13,
              lineHeight: 1.5,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              background: m.role === 'user' ? 'var(--navy)' : '#fff',
              color: m.role === 'user' ? '#fff' : 'var(--text)',
              border: m.role === 'user' ? 'none' : '1px solid var(--line)',
            }}
          >
            {m.content}
          </div>
        ))}
        {loading && (
          <div style={{ alignSelf: 'flex-start', fontSize: 12.5, color: 'var(--muted)', padding: '4px 2px' }}>
            Copilot is thinking…
          </div>
        )}
      </div>

      {/* Quick prompts */}
      {messages.length === 0 && (
        <div style={{ padding: '8px 12px', display: 'flex', gap: 6, flexWrap: 'wrap', borderTop: '1px solid var(--line)', background: '#fff' }}>
          {QUICK_PROMPTS.map((q) => (
            <button
              key={q}
              onClick={() => send(q)}
              disabled={loading}
              style={{ fontSize: 11.5, padding: '5px 10px', borderRadius: 999, cursor: 'pointer', background: '#fff7ed', color: '#92400e', border: '1px solid #fed7aa', fontWeight: 600 }}
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {error && <div style={{ padding: '8px 14px', fontSize: 12, color: '#b91c1c', background: '#fee2e2', borderTop: '1px solid #fecaca' }}>{error}</div>}

      {/* Input */}
      <div style={{ display: 'flex', gap: 8, padding: 12, borderTop: '1px solid var(--line)', background: '#fff' }}>
        <input
          className="input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Ask the copilot…"
          style={{ flex: 1, fontSize: 13 }}
        />
        <button className="btn btn-navy" onClick={() => send()} disabled={loading || !input.trim()} style={{ padding: '8px 14px', fontSize: 12.5 }}>
          Send
        </button>
      </div>
    </div>
  )
}

/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useState } from 'react'
import { Card, CardHeader } from '@/components/ui'
import { useToast } from '@/components/ui/Toast'

// Caption Studio — generate social captions from a topic. Zero-token template
// engine always works; when DeepSeek is configured we boost with AI copy via
// the existing /api/ai/marketing-copy endpoint. Copy one-click.

const TEMPLATES = (topic: string) => [
  `📈 New on the market: ${topic || 'a vetted, profitable business'}. Confidential financials available to qualified buyers. Message us to learn more.`,
  `💼 Sellers: is ${topic || 'your business'} ready for its next chapter? Get a free, confidential valuation today.`,
  `🤝 Buyers: ${topic || 'a new acquisition opportunity'} just landed. Pre-qualify now to get first access before it's public.`,
  `🏆 Proven. Profitable. Confidential. ${topic || 'This week\'s featured opportunity'} is one you don't want to miss.`,
  `🔔 Deal alert: ${topic || 'a fresh listing'} is live. Saved searches get notified first — set yours up today.`,
]

export default function CaptionStudio() {
  const toast = useToast()
  const [topic, setTopic] = useState('')
  const [captions, setCaptions] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [aiMode, setAiMode] = useState(false)

  const generate = async () => {
    setCaptions(TEMPLATES(topic.trim()))
    setAiMode(false)
    setBusy(true)
    try {
      const res = await fetch('/api/ai/marketing-copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productCategory: 'flyers',
          businessName: topic.trim() || 'this business',
          summary: 'Social media caption',
          industry: '',
          city: '',
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data?.design?.text?.body) {
        const ai = data.design.text
        setCaptions([
          `✨ AI: ${(ai.headline || 'New opportunity').slice(0, 120)}`,
          (ai.body || 'Confidential, vetted opportunity — message us to learn more.').slice(0, 280),
          `📣 ${(ai.tagline || 'Your next move').slice(0, 120)}`,
        ])
        setAiMode(true)
      }
    } catch {
      /* template captions already set — AI is a bonus */
    } finally {
      setBusy(false)
    }
  }

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast('Caption copied 📋', 'success')
    } catch {
      window.prompt('Copy this caption:', text)
    }
  }

  return (
    <Card style={{ marginBottom: 18 }}>
      <CardHeader title="✍️ Caption Studio" subtitle="Generate ready-to-post captions for your listings — instant templates, AI-boosted when available." />
      <div style={{ padding: '0 20px 20px' }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Business type or topic (e.g. 'boutique fitness studio in Austin')"
            style={{ flex: 1, minWidth: 240, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--line)', fontSize: 14 }}
          />
          <button className="btn btn-primary" onClick={generate} disabled={busy}>
            {busy ? 'Generating…' : 'Generate captions'}
          </button>
        </div>
        {captions.length > 0 && (
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {aiMode && (
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                ✨ AI-boosted captions (DeepSeek)
              </div>
            )}
            {captions.map((c, i) => (
              <div
                key={i}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px',
                  background: 'var(--cream)', border: '1px solid var(--line)', borderRadius: 8,
                }}
              >
                <div style={{ flex: 1, fontSize: 13.5, lineHeight: 1.55 }}>{c}</div>
                <button
                  onClick={() => copy(c)}
                  style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 16, color: 'var(--gold-dark)' }}
                  title="Copy caption"
                >
                  📋
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  )
}

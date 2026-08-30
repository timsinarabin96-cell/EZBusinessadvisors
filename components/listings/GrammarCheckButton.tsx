/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useState } from 'react'
import { authenticatedFetch } from '@/lib/authenticatedFetch'

// =============================================================================
// GrammarCheckButton — "✨ AI proofread" for a listing text field.
// Calls /api/ai/grammar with the current field text, shows the corrected copy
// + focused tips, and lets the agent apply the corrected text in one click.
// =============================================================================

export default function GrammarCheckButton({
  text,
  kind,
  onApply,
}: {
  text: string
  kind?: string
  onApply: (corrected: string) => void
}) {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ corrected: string; suggestions: string[] } | null>(null)
  const [error, setError] = useState('')

  const run = async () => {
    if (!text.trim() || busy) return
    setBusy(true)
    setError('')
    setResult(null)
    try {
      const res = await authenticatedFetch('/api/ai/grammar', {
        method: 'POST',
        headers: { 'content-type': 'application/json',  },
        body: JSON.stringify({ text, kind }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'Grammar check failed')
      setResult(data)
    } catch (e: any) {
      setError(e.message || 'Grammar check unavailable')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ margin: '6px 0 2px' }}>
      <button type="button" onClick={run} disabled={busy || !text.trim()} className="btn btn-ghost" style={{ fontSize: 12.5, padding: '6px 12px' }}>
        {busy ? '✨ Checking…' : '✨ AI proofread & suggest'}
      </button>
      {error && <div style={{ fontSize: 12, color: '#b91c1c', marginTop: 6 }}>{error}</div>}
      {result && (
        <div style={{ marginTop: 10, border: '1px solid #dbe7f3', background: '#f8fbff', borderRadius: 10, padding: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
            <strong style={{ fontSize: 13, color: 'var(--navy)' }}>AI suggestions</strong>
            <button
              type="button"
              onClick={() => { onApply(result.corrected); setResult(null) }}
              className="btn btn-primary"
              style={{ fontSize: 12, padding: '5px 12px' }}
            >
              Apply corrected text
            </button>
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.6, color: '#374151', whiteSpace: 'pre-wrap', background: '#fff', border: '1px solid #e5eef6', borderRadius: 8, padding: 10, marginBottom: 10 }}>
            {result.corrected}
          </div>
          {result.suggestions.length > 0 && (
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: '#52606d', lineHeight: 1.6 }}>
              {result.suggestions.map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

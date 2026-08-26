'use client'

// AI Call Summaries panel — shared by the AI cockpit and the standalone route.
import { useCallback, useEffect, useState } from 'react'
import { LoadingState } from '@/components/ui'
import { useToast } from '@/components/ui/Toast'
import { getAgencyContext } from '@/lib/agencyContext'
import { getStoredAccessToken } from '@/lib/authToken'

interface Summary {
  id: string
  call_id: string | null
  transcript_excerpt: string | null
  summary: string
  action_items: string[]
  sentiment: string | null
  model: string | null
  created_at: string
}

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })

const sentimentColor = (s: string | null) => {
  if (s === 'positive') return 'bg-green-50 text-green-700 border-green-200'
  if (s === 'negative') return 'bg-red-50 text-red-700 border-red-200'
  return 'bg-gray-50 text-gray-600 border-gray-200'
}

export default function CallSummariesPanel() {
  const toast = useToast()
  const [summaries, setSummaries] = useState<Summary[]>([])
  const [callId, setCallId] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async (agencyId: string) => {
    const token = getStoredAccessToken()
    const res = await fetch(`/api/intelligence/call-summaries?agencyId=${agencyId}`, { headers: { authorization: `Bearer ${token}` } })
    const data = await res.json().catch(() => ({}))
    setSummaries(data.summaries || [])
  }, [])

  useEffect(() => {
    ;(async () => {
      const ctx = await getAgencyContext()
      if (!ctx) { setLoading(false); return }
      await load(ctx.agencyId)
      setLoading(false)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const makeReminder = async (item: string) => {
    const token = getStoredAccessToken()
    const res = await fetch('/api/reminders', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        title: `Follow up: ${item}`,
        due_at: new Date(Date.now() + 24 * 3600000).toISOString(),
        assignToMe: true,
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.ok) return toast(data.error || 'Could not create reminder', 'error')
    toast('Reminder set for tomorrow ⏰', 'success')
  }

  const generate = async () => {
    if (!callId.trim()) return toast('Enter a call session ID', 'error')
    setBusy(true)
    const token = getStoredAccessToken()
    const res = await fetch('/api/intelligence/call-summaries', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ callId: callId.trim() }),
    })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok || !data.ok) return toast(data.error || 'Failed to summarize call', 'error')
    setCallId('')
    toast('Call summarized', 'success')
    const ctx = await getAgencyContext()
    if (ctx) await load(ctx.agencyId)
  }

  if (loading) return <LoadingState />

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">📞 AI Call Summaries</h1>
        <p className="text-gray-500 text-sm mt-1">
          Transcripts from voice call sessions are condensed into intent, key phrases, action items, and sentiment.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <h2 className="font-semibold mb-3">Summarize a call</h2>
        <div className="flex flex-col md:flex-row gap-3">
          <input
            className="border rounded-lg px-3 py-2 text-sm flex-1 font-mono"
            placeholder="Call session ID (uuid)"
            value={callId}
            onChange={(e) => setCallId(e.target.value)}
          />
          <button
            onClick={generate}
            disabled={busy}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg"
          >
            {busy ? 'Summarizing…' : 'Generate summary'}
          </button>
        </div>
      </div>

      {summaries.length === 0 ? (
        <p className="text-gray-400 text-sm">No summaries yet — paste a call session ID above to generate the first one.</p>
      ) : (
        <ul className="space-y-4">
          {summaries.map((s) => (
            <li key={s.id} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between gap-3 mb-2">
                <p className="text-xs text-gray-400 font-mono">call {s.call_id?.slice(0, 8)}… · {fmtDate(s.created_at)}</p>
                <div className="flex items-center gap-2">
                  <span className={`text-xs border rounded-full px-2 py-0.5 ${sentimentColor(s.sentiment)}`}>
                    {s.sentiment || 'neutral'}
                  </span>
                  <span className="text-xs text-gray-400 border border-gray-200 rounded-full px-2 py-0.5">{s.model || 'deterministic'}</span>
                </div>
              </div>
              <p className="text-sm text-gray-800">{s.summary}</p>
              {s.action_items.length > 0 && (
                <ul className="mt-3 space-y-1">
                  {s.action_items.map((item, i) => (
                    <li key={i} className="text-xs text-gray-600 flex items-start gap-2">
                      <span className="text-blue-600 mt-0.5">☐</span> {item}
                      <button
                        onClick={() => makeReminder(item)}
                        className="ml-auto shrink-0 text-blue-600 hover:underline"
                        title="Turn this action item into a reminder"
                      >
                        ⏰ Remind
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {s.transcript_excerpt && (
                <details className="mt-3">
                  <summary className="text-xs text-blue-600 cursor-pointer">Transcript excerpt</summary>
                  <p className="mt-2 text-xs text-gray-500 bg-gray-50 rounded-lg p-3 whitespace-pre-wrap">{s.transcript_excerpt}</p>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

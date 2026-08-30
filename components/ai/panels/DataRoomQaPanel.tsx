/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

// Data Room Q&A panel — shared by the AI cockpit and the standalone route.
import { useCallback, useEffect, useState } from 'react'
import { LoadingState } from '@/components/ui'
import { useToast } from '@/components/ui/Toast'
import { getAgencyContext } from '@/lib/agencyContext'
import { getStoredAccessToken } from '@/lib/authToken'
import { authenticatedFetch } from '@/lib/authenticatedFetch'

interface DataRoomOpt {
  id: string
  name: string
  status: string
  businessName: string | null
}

interface QaRow {
  id: string
  data_room_id: string
  question: string
  answer: string | null
  status: string
  created_at: string
}

interface IntentBuyer {
  email: string
  views: number
  downloads: number
  distinctDocs: number
  categories: Record<string, number>
  lastActiveAt: string | null
  score: number
}

interface IntentDoc {
  fileId: string
  fileName: string
  fileKind: string | null
  views: number
  downloads: number
  lastViewedAt: string | null
}

interface RoomIntent {
  roomId: string
  totalViews: number
  totalDownloads: number
  activeBuyers: number
  buyers: IntentBuyer[]
  topDocs: IntentDoc[]
}

const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'

export default function DataRoomQaPanel() {
  const toast = useToast()
  const [agencyId, setAgencyId] = useState('')
  const [rooms, setRooms] = useState<DataRoomOpt[]>([])
  const [selectedRoom, setSelectedRoom] = useState('')
  const [questions, setQuestions] = useState<QaRow[]>([])
  const [question, setQuestion] = useState('')
  const [intent, setIntent] = useState<RoomIntent | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const token = () => getStoredAccessToken()
  const authHeaders = () => ({ authorization: `Bearer ${token()}`, 'content-type': 'application/json' })

  const loadRooms = useCallback(async (agency: string) => {
    const res = await authenticatedFetch(`/api/intelligence/data-room-qa?agencyId=${agency}&action=rooms`, {
      headers: { authorization: `Bearer ${token()}` },
    })
    const data = await res.json().catch(() => ({}))
    setRooms(data.rooms || [])
  }, [])

  const loadQuestions = useCallback(async (agency: string, roomId: string) => {
    const res = await authenticatedFetch(`/api/intelligence/data-room-qa?agencyId=${agency}&dataRoomId=${roomId}`, {
      headers: { authorization: `Bearer ${token()}` },
    })
    const data = await res.json().catch(() => ({}))
    setQuestions(data.questions || [])
  }, [])

  const loadIntent = useCallback(async (roomId: string) => {
    const res = await authenticatedFetch(`/api/data-rooms/intent?roomId=${roomId}`, {
      headers: { authorization: `Bearer ${token()}` },
    })
    const data = await res.json().catch(() => ({}))
    setIntent(data.ok ? data.intent : null)
  }, [])

  useEffect(() => {
    ;(async () => {
      const ctx = await getAgencyContext()
      if (!ctx) {
        setLoading(false)
        return
      }
      setAgencyId(ctx.agencyId)
      await loadRooms(ctx.agencyId)
      setLoading(false)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const ask = async () => {
    if (!selectedRoom || !question.trim()) return
    setBusy(true)
    const res = await authenticatedFetch('/api/intelligence/data-room-qa', {
      method: 'POST',
      headers: {},
      body: JSON.stringify({ dataRoomId: selectedRoom, question: question.trim() }),
    })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok || !data.ok) {
      toast(data.error || 'Failed to answer question', 'error')
      return
    }
    toast('Question answered', 'success')
    setQuestion('')
    if (agencyId && selectedRoom) await loadQuestions(agencyId, selectedRoom)
  }

  if (loading) return <LoadingState />

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">💬 Data Room Q&A</h1>
        <p className="text-gray-500 text-sm mt-1">
          Ask anything about a deal&apos;s data room — the engine answers from the file index (names, notes, kinds), polished by AI when available.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <h2 className="font-semibold mb-3">Ask a question</h2>
        <div className="flex flex-col md:flex-row gap-3">
          <select
            className="border rounded-lg px-3 py-2 text-sm flex-1"
            value={selectedRoom}
            onChange={(e) => {
              setSelectedRoom(e.target.value)
              if (e.target.value && agencyId) {
                loadQuestions(agencyId, e.target.value)
                loadIntent(e.target.value)
              }
            }}
          >
            <option value="">Select a data room…</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
                {r.businessName ? ` — ${r.businessName}` : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col md:flex-row gap-3 mt-3">
          <input
            className="border rounded-lg px-3 py-2 text-sm flex-1"
            placeholder="e.g. Do we have the last 3 years of tax returns?"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') ask()
            }}
          />
          <button
            onClick={ask}
            disabled={!selectedRoom || !question.trim() || busy}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-5 py-2 rounded-lg"
          >
            {busy ? 'Answering…' : 'Ask'}
          </button>
        </div>
        {rooms.length === 0 && (
          <p className="text-xs text-gray-400 mt-2">No data rooms found for this agency yet — create one from a deal or listing first.</p>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <h2 className="font-semibold mb-1">🎯 Buyer intent</h2>
        <p className="text-xs text-gray-400 mb-3">
          Which documents buyers actually open, and who&apos;s most engaged — ranked by a recency-weighted intent score.
        </p>
        {!selectedRoom ? (
          <p className="text-gray-400 text-sm">Select a data room to see buyer intent.</p>
        ) : !intent ? (
          <p className="text-gray-400 text-sm">No view activity yet — intent appears once buyers open documents.</p>
        ) : (
          <div className="grid md:grid-cols-2 gap-5">
            {/* Top docs */}
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Most-viewed documents</h3>
              {intent.topDocs.length === 0 ? (
                <p className="text-gray-400 text-sm">No document opens logged yet.</p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {intent.topDocs.map((d) => (
                    <li key={d.fileId} className="py-2 flex items-center gap-3">
                      <span className="text-lg">📄</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{d.fileName}</div>
                        <div className="text-xs text-gray-400">{d.fileKind || 'document'}{d.lastViewedAt ? ` · last ${fmtDate(d.lastViewedAt)}` : ''}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-semibold">{d.views} <span className="text-gray-400 font-normal">views</span></div>
                        {d.downloads > 0 && <div className="text-xs text-emerald-600">{d.downloads} downloads</div>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {/* Buyers */}
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Engaged buyers ({intent.activeBuyers})
              </h3>
              {intent.buyers.length === 0 ? (
                <p className="text-gray-400 text-sm">No buyer activity in this room yet.</p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {intent.buyers.map((b) => (
                    <li key={b.email} className="py-2">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">{b.email}</div>
                          <div className="text-xs text-gray-400">
                            {b.views} views · {b.downloads} downloads · {b.distinctDocs} docs
                            {b.lastActiveAt ? ` · ${fmtDate(b.lastActiveAt)}` : ''}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="text-sm font-bold" style={{ color: b.score >= 70 ? '#15803d' : b.score >= 40 ? '#b45309' : '#6b7280' }}>
                            {b.score}/100
                          </div>
                        </div>
                      </div>
                      <div className="mt-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${Math.max(4, b.score)}%`, background: b.score >= 70 ? '#22c55e' : b.score >= 40 ? '#f59e0b' : '#9ca3af' }} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="font-semibold mb-3">Q&A history</h2>
        {questions.length === 0 ? (
          <p className="text-gray-400 text-sm">No questions yet for this data room.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {questions.map((qa) => (
              <li key={qa.id} className="py-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium text-sm">Q: {qa.question}</p>
                  <span
                    className={`text-xs rounded-full px-2 py-0.5 shrink-0 ${
                      qa.status === 'answered'
                        ? 'bg-green-50 text-green-700 border border-green-200'
                        : qa.status === 'failed'
                          ? 'bg-red-50 text-red-700 border border-red-200'
                          : 'bg-amber-50 text-amber-700 border border-amber-200'
                    }`}
                  >
                    {qa.status}
                  </span>
                </div>
                {qa.answer && (
                  <pre className="mt-2 text-xs text-gray-600 whitespace-pre-wrap font-sans bg-gray-50 border border-gray-100 rounded-lg p-3">
                    A: {qa.answer}
                  </pre>
                )}
                <p className="text-xs text-gray-400 mt-1">{fmtDate(qa.created_at)}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

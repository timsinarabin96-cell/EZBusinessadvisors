'use client'

import { useCallback, useEffect, useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import { LoadingState } from '@/components/ui'
import { ToastProvider, useToast } from '@/components/ui/Toast'
import { getAgencyContext } from '@/lib/agencyContext'

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

const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'

export default function DataRoomQaPage() {
  return (
    <AppShell active="Data Room Q&A">
      <ToastProvider>
        <div style={{ maxWidth: 1080, margin: '0 auto', padding: '24px 20px 60px' }}>
          <DataRoomQa />
        </div>
      </ToastProvider>
    </AppShell>
  )
}

function DataRoomQa() {
  const toast = useToast()
  const [agencyId, setAgencyId] = useState('')
  const [rooms, setRooms] = useState<DataRoomOpt[]>([])
  const [selectedRoom, setSelectedRoom] = useState('')
  const [questions, setQuestions] = useState<QaRow[]>([])
  const [question, setQuestion] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const token = () => localStorage.getItem('sb-access-token') || ''
  const authHeaders = () => ({ authorization: `Bearer ${token()}`, 'content-type': 'application/json' })

  const loadRooms = useCallback(async (agency: string) => {
    const res = await fetch(`/api/intelligence/data-room-qa?agencyId=${agency}&action=rooms`, {
      headers: { authorization: `Bearer ${token()}` },
    })
    const data = await res.json().catch(() => ({}))
    setRooms(data.rooms || [])
  }, [])

  const loadQuestions = useCallback(async (agency: string, roomId: string) => {
    const res = await fetch(`/api/intelligence/data-room-qa?agencyId=${agency}&dataRoomId=${roomId}`, {
      headers: { authorization: `Bearer ${token()}` },
    })
    const data = await res.json().catch(() => ({}))
    setQuestions(data.questions || [])
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
    const res = await fetch('/api/intelligence/data-room-qa', {
      method: 'POST',
      headers: authHeaders(),
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
          Ask anything about a deal's data room — the engine answers from the file index (names, notes, kinds), polished by AI when available.
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
              if (e.target.value && agencyId) loadQuestions(agencyId, e.target.value)
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

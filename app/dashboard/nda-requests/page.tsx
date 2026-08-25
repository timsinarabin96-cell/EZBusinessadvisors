'use client'

import { useCallback, useEffect, useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import { LoadingState } from '@/components/ui'
import { ToastProvider, useToast } from '@/components/ui/Toast'
import { getAgencyContext } from '@/lib/agencyContext'
import { getStoredAccessToken } from '@/lib/authToken'

interface NdaRequest {
  id: string
  listing_id: string
  data_room_id: string | null
  requester_name: string
  requester_email: string
  requester_company: string | null
  rationale: string | null
  nda_signature: string
  nda_signed_at: string
  status: string
  review_note: string | null
  created_at: string
  listings?: { business_name: string } | null
}

const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

export default function NdaRequestsPage() {
  return (
    <AppShell active="NDA Requests">
      <ToastProvider>
        <div style={{ maxWidth: 1080, margin: '0 auto', padding: '24px 20px 60px' }}>
          <NdaRequests />
        </div>
      </ToastProvider>
    </AppShell>
  )
}

function NdaRequests() {
  const toast = useToast()
  const [requests, setRequests] = useState<NdaRequest[]>([])
  const [agencyId, setAgencyId] = useState('')
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('pending')
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async (agency: string, status: string) => {
    setLoading(true)
    const token = getStoredAccessToken()
    const res = await fetch(`/api/data-rooms/access-request?agencyId=${agency}&status=${status}`, {
      headers: { authorization: `Bearer ${token}` },
    })
    const data = await res.json().catch(() => ({}))
    setRequests(data.requests || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    ;(async () => {
      const ctx = await getAgencyContext()
      if (!ctx) { setLoading(false); return }
      setAgencyId(ctx.agencyId)
      await load(ctx.agencyId, filter)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const changeFilter = async (status: string) => {
    setFilter(status)
    if (agencyId) await load(agencyId, status)
  }

  const review = async (requestId: string, action: 'approve' | 'reject') => {
    setBusy(requestId)
    const token = getStoredAccessToken()
    const res = await fetch('/api/data-rooms/access-request/review', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ requestId, action }),
    })
    const data = await res.json().catch(() => ({}))
    setBusy(null)
    if (!res.ok || !data.ok) {
      toast(data.error || 'Failed to update request', 'error')
      return
    }
    toast(action === 'approve' ? 'Access granted — buyer notified' : 'Request rejected', 'success')
    if (agencyId) await load(agencyId, filter)
  }

  if (loading && requests.length === 0) return <LoadingState />

  const counts: Record<string, number> = { pending: 0, approved: 0, rejected: 0 }
  for (const r of requests) counts[r.status] = (counts[r.status] || 0) + 1

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">🛡️ NDA Access Requests</h1>
        <p className="text-gray-500 text-sm mt-1">
          Buyers sign your NDA and request confidential access here. Approve to grant them the data room.
        </p>
      </div>

      <div className="flex gap-2 mb-4">
        {['pending', 'approved', 'rejected'].map((s) => (
          <button
            key={s}
            onClick={() => changeFilter(s)}
            className={`text-sm px-3 py-1.5 rounded-full border capitalize ${
              filter === s ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-gray-200 text-gray-600'
            }`}
          >
            {s} ({counts[s] || 0})
          </button>
        ))}
      </div>

      {requests.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400 text-sm">
          No {filter} requests.
        </div>
      ) : (
        <div className="space-y-4">
          {requests.map((r) => (
            <div key={r.id} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-semibold">{r.requester_name}</p>
                  <p className="text-sm text-gray-500">{r.requester_email}{r.requester_company ? ` · ${r.requester_company}` : ''}</p>
                  <p className="text-sm mt-1">
                    Wants access to <span className="font-medium">{r.listings?.business_name || 'a listing'}</span> · NDA signed {fmtDate(r.nda_signed_at)}
                  </p>
                  {r.rationale && <p className="text-sm text-gray-600 mt-2 italic">“{r.rationale}”</p>}
                  <p className="text-xs text-gray-400 mt-2">
                    e-signature: <span className="font-mono">{r.nda_signature}</span> · requested {fmtDate(r.created_at)}
                    {r.status !== 'pending' && r.review_note ? ` · note: ${r.review_note}` : ''}
                  </p>
                  {/* Jump to the CRM lead this NDA signer became */}
                  <a
                    href={`/dashboard/leads?q=${encodeURIComponent(r.requester_email)}`}
                    className="inline-block text-xs text-blue-600 font-medium mt-2 hover:underline"
                  >
                    → View in Lead Management
                  </a>
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  {r.status === 'pending' ? (
                    <>
                      <button
                        onClick={() => review(r.id, 'approve')}
                        disabled={busy === r.id}
                        className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-1.5 rounded-lg"
                      >
                        {busy === r.id ? '…' : 'Approve & grant access'}
                      </button>
                      <button
                        onClick={() => review(r.id, 'reject')}
                        disabled={busy === r.id}
                        className="bg-white border border-red-200 text-red-600 hover:bg-red-50 text-sm font-medium px-4 py-1.5 rounded-lg"
                      >
                        Reject
                      </button>
                    </>
                  ) : (
                    <span className={`text-xs font-medium px-3 py-1 rounded-full ${
                      r.status === 'approved' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
                    }`}>
                      {r.status.toUpperCase()}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

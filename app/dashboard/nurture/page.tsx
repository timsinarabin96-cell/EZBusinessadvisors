/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useCallback, useEffect, useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import { LoadingState } from '@/components/ui'
import { ToastProvider, useToast } from '@/components/ui/Toast'
import { getAgencyContext } from '@/lib/agencyContext'
import { getStoredAccessToken } from '@/lib/authToken'

interface NurtureStep {
  id: string
  day: number
  title: string
}

interface NurtureSequence {
  id: string
  name: string
  audience: string
  steps: NurtureStep[]
  active: boolean
  created_at: string
}

interface NurtureRecipient {
  id: string
  sequence_id: string
  email: string
  lead_type: string
  current_step: number
  next_send_at: string | null
  status: string
  created_at: string
  nurture_sequences?: { name: string; audience: string } | null
}

const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

export default function NurturePage() {
  return (
    <AppShell active="Nurture Drips">
      <ToastProvider>
        <div style={{ maxWidth: 1080, margin: '0 auto', padding: '24px 20px 60px' }}>
          <NurtureApp />
        </div>
      </ToastProvider>
    </AppShell>
  )
}

function NurtureApp() {
  const toast = useToast()
  const [sequences, setSequences] = useState<NurtureSequence[]>([])
  const [recipients, setRecipients] = useState<NurtureRecipient[]>([])
  const [agencyId, setAgencyId] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const [sequenceId, setSequenceId] = useState('')
  const [email, setEmail] = useState('')
  const [leadType, setLeadType] = useState('buyer')

  const load = useCallback(async (agency: string) => {
    const token = getStoredAccessToken()
    const res = await fetch(`/api/nurture?agencyId=${agency}`, { headers: { authorization: `Bearer ${token}` } })
    const data = await res.json().catch(() => ({}))
    setSequences(data.sequences || [])
    setRecipients(data.recipients || [])
    if (data.sequences?.length && !sequenceId) setSequenceId(data.sequences[0].id)
  }, [sequenceId])

  useEffect(() => {
    ;(async () => {
      const ctx = await getAgencyContext()
      if (!ctx) { setLoading(false); return }
      setAgencyId(ctx.agencyId)
      await load(ctx.agencyId)
      setLoading(false)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const authHeaders = () => ({
    authorization: `Bearer ${getStoredAccessToken()}`,
    'content-type': 'application/json',
  })

  const seed = async () => {
    setBusy(true)
    const res = await fetch('/api/nurture', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ action: 'seed', agencyId }),
    })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok || !data.ok) {
      toast(data.error || 'Could not seed sequences', 'error')
      return
    }
    toast(`Seeded ${data.created || 0} default sequences`, 'success')
    await load(agencyId)
  }

  const enrollContact = async () => {
    setBusy(true)
    const res = await fetch('/api/nurture', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ action: 'enroll', sequenceId, email, leadType }),
    })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok || !data.ok) {
      toast(data.error || 'Could not enroll contact', 'error')
      return
    }
    toast('Contact enrolled — step 1 goes out now', 'success')
    setEmail('')
    await load(agencyId)
  }

  if (loading) return <LoadingState />

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">💌 Nurture Drips</h1>
        <p className="text-gray-500 text-sm mt-1">
          Automated email sequences for buyers and sellers. Enroll a contact and the drip fires on its own — step 1 now, then every 4 days.
        </p>
      </div>

      {/* Seed + enroll */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <div className="flex flex-col md:flex-row md:items-end gap-3">
          <div className="flex-1">
            <h2 className="font-semibold mb-3">Enroll a contact</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <select className="border rounded-lg px-3 py-2 text-sm" value={sequenceId} onChange={(e) => setSequenceId(e.target.value)}>
                {sequences.length === 0 && <option value="">No sequences yet — seed first</option>}
                {sequences.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.audience})
                  </option>
                ))}
              </select>
              <input className="border rounded-lg px-3 py-2 text-sm" placeholder="Contact email *" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              <select className="border rounded-lg px-3 py-2 text-sm" value={leadType} onChange={(e) => setLeadType(e.target.value)}>
                <option value="buyer">Buyer</option>
                <option value="seller">Seller</option>
              </select>
            </div>
            <div className="flex items-center gap-3 mt-3">
              <button
                onClick={enrollContact}
                disabled={busy || !sequenceId || !email.trim()}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg"
              >
                {busy ? 'Working…' : '+ Enroll contact'}
              </button>
              <button
                onClick={seed}
                disabled={busy}
                className="border border-gray-300 hover:bg-gray-50 disabled:opacity-50 text-sm font-medium px-4 py-2 rounded-lg"
              >
                Seed default sequences
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Sequences */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <h2 className="font-semibold mb-3">📋 Sequences</h2>
        {sequences.length === 0 ? (
          <p className="text-gray-400 text-sm">No sequences yet. Hit “Seed default sequences” to create buyer + seller drips.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {sequences.map((sequence) => (
              <li key={sequence.id} className="py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-sm">
                      {sequence.name}{' '}
                      <span className={`text-xs border rounded-full px-2 py-0.5 ${sequence.audience === 'seller' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>
                        {sequence.audience}
                      </span>
                    </p>
                    <p className="text-xs text-gray-500">{sequence.steps?.length || 0} steps · {sequence.active ? 'active' : 'paused'}</p>
                  </div>
                </div>
                <ul className="mt-2 space-y-1">
                  {(sequence.steps || []).map((step) => (
                    <li key={step.id} className="text-xs text-gray-600">
                      Day {step.day} — {step.title}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Drip pipeline summary */}
      {recipients.length > 0 && (() => {
        const buyers = recipients.filter((r) => (r.lead_type || r.nurture_sequences?.audience) === 'buyer').length
        const sellers = recipients.length - buyers
        const active = recipients.filter((r) => r.status === 'active').length
        const completed = recipients.filter((r) => r.status === 'completed').length
        const paused = recipients.filter((r) => r.status === 'paused').length
        return (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            {[
              ['👥 Enrolled', recipients.length, '#1a1a2e'],
              ['🔄 Active', active, '#3b82f6'],
              ['✅ Completed', completed, '#22c55e'],
              ['⏸️ Paused', paused, '#f59e0b'],
            ].map(([label, value, color]) => (
              <div key={label as string} style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: '14px 16px' }}>
                <div style={{ fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 700 }}>{label}</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: color as string, fontFamily: 'Georgia, serif' }}>{value}</div>
              </div>
            ))}
          </div>
        )
      })()}

      {/* Recipients */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="font-semibold mb-3">👥 Enrolled contacts</h2>
        {recipients.length === 0 ? (
          <p className="text-gray-400 text-sm">No contacts enrolled yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {recipients.map((recipient) => (
              <li key={recipient.id} className="py-3 flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-sm">{recipient.email}</p>
                  <p className="text-xs text-gray-500">
                    {recipient.nurture_sequences?.name || 'Sequence'} · step {recipient.current_step + 1} · next send {fmtDate(recipient.next_send_at)}
                  </p>
                </div>
                <span
                  className={`text-xs border rounded-full px-2 py-0.5 ${
                    recipient.status === 'completed'
                      ? 'bg-green-50 text-green-700 border-green-200'
                      : recipient.status === 'paused'
                        ? 'bg-gray-100 text-gray-600 border-gray-200'
                        : 'bg-blue-50 text-blue-700 border-blue-200'
                  }`}
                >
                  {recipient.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

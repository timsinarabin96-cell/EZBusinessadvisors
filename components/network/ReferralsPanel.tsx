/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useCallback, useEffect, useState } from 'react'
import { LoadingState } from '@/components/ui'
import { getAgencyContext } from '@/lib/agencyContext'
import { authenticatedFetch } from '@/lib/authenticatedFetch'
import { useToast } from '@/components/ui/Toast'

interface Referral {
  id: string
  referrer_name: string
  referrer_email: string
  referral_type: string
  referee_name: string | null
  referee_email: string | null
  status: 'new' | 'contacted' | 'converted' | 'paid'
  commission_pct: number | null
  notes: string | null
  converted_at: string | null
  created_at: string
}

const STATUS_FLOW = ['new', 'contacted', 'converted', 'paid'] as const
const STATUS_COLORS: Record<string, string> = {
  new: 'bg-blue-50 text-blue-700 border-blue-200',
  contacted: 'bg-amber-50 text-amber-700 border-amber-200',
  converted: 'bg-green-50 text-green-700 border-green-200',
  paid: 'bg-emerald-50 text-emerald-700 border-emerald-200',
}
const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

export function ReferralsPanel() {
  const toast = useToast()
  const [referrals, setReferrals] = useState<Referral[]>([])
  const [agencyId, setAgencyId] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [referrerName, setReferrerName] = useState('')
  const [referrerEmail, setReferrerEmail] = useState('')
  const [referralType, setReferralType] = useState('buyer')
  const [refereeName, setRefereeName] = useState('')
  const [refereeEmail, setRefereeEmail] = useState('')
  const [commissionPct, setCommissionPct] = useState('')

  const load = useCallback(async (agency: string) => {
    const res = await authenticatedFetch(`/api/referrals?agencyId=${agency}`)
    const data = await res.json().catch(() => ({}))
    setReferrals(data.referrals || [])
  }, [])

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
    'content-type': 'application/json',
  })

  const createReferral = async () => {
    setSaving(true)
    const res = await authenticatedFetch('/api/referrals', {
      method: 'POST',
      headers: {},
      body: JSON.stringify({
        agencyId,
        referrerName,
        referrerEmail,
        referralType,
        refereeName: refereeName || null,
        refereeEmail: refereeEmail || null,
        commissionPct: commissionPct ? Number(commissionPct) : null,
      }),
    })
    const data = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok || !data.ok) {
      toast(data.error || 'Could not save referral', 'error')
      return
    }
    toast('Referral saved', 'success')
    setReferrerName('')
    setReferrerEmail('')
    setRefereeName('')
    setRefereeEmail('')
    setCommissionPct('')
    await load(agencyId)
  }

  const exportCsv = () => {
    if (!referrals.length) return
    const header = 'referrer_name,referrer_email,referral_type,referee_name,referee_email,status,commission_pct,notes,created_at'
    const rows = referrals.map((r) =>
      [r.referrer_name, r.referrer_email, r.referral_type, r.referee_name || '', r.referee_email || '', r.status, r.commission_pct ?? '', (r.notes || '').replace(/,/g, ' '), r.created_at || ''].join(','),
    )
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `referrals-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    toast('Referrals exported', 'success')
  }

  const advanceStatus = async (referral: Referral) => {
    const idx = STATUS_FLOW.indexOf(referral.status)
    const next = STATUS_FLOW[idx + 1]
    if (!next) return
    const res = await authenticatedFetch('/api/referrals', {
      method: 'PATCH',
      headers: {},
      body: JSON.stringify({
        id: referral.id,
        status: next,
        convertedAt: next === 'converted' ? new Date().toISOString() : undefined,
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.ok) {
      toast(data.error || 'Could not update referral', 'error')
      return
    }
    toast(`Marked ${next}`, 'success')
    await load(agencyId)
  }

  if (loading) return <LoadingState />

  // Reward tracking — totals by status.
  const totals = { new: 0, contacted: 0, converted: 0, paid: 0 }
  referrals.forEach((r) => { totals[r.status] += 1 })
  const rewardCards: [string, string, number][] = [
    ['New', 'bg-blue-50 text-blue-700 border-blue-200', totals.new],
    ['Contacted', 'bg-amber-50 text-amber-700 border-amber-200', totals.contacted],
    ['Converted', 'bg-green-50 text-green-700 border-green-200', totals.converted],
    ['Paid', 'bg-emerald-50 text-emerald-700 border-emerald-200', totals.paid],
  ]

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">🎁 Referral Program</h1>
        <p className="text-gray-500 text-sm mt-1">
          Log buyer & seller referrals, track them from first contact through paid, and keep the commission you agreed on.
        </p>
      </div>

      {/* Partner portal link — copyable referral URL */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-semibold">🤝 Partner portal link</h2>
            <p className="text-xs text-gray-500 mt-1">Share this link with partners — referrals land straight in this pipeline.</p>
          </div>
          <div className="flex items-center gap-2">
            <code style={{ background: '#f8f6ef', border: '1px solid #e5e2d8', borderRadius: 8, padding: '8px 12px', fontSize: 12.5, color: '#1a1a2e', maxWidth: 340, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {typeof window !== 'undefined' ? `${window.location.origin}/contact?ref=${agencyId || 'partner'}` : '/contact?ref=partner'}
            </code>
            <button
              onClick={() => {
                const link = `${window.location.origin}/contact?ref=${agencyId || 'partner'}`
                navigator.clipboard?.writeText(link).then(() => toast('Partner link copied 📋', 'success')).catch(() => { window.prompt('Copy partner link:', link) })
              }}
              className="text-xs border border-gray-300 hover:bg-gray-50 text-gray-600 font-medium px-3 py-2 rounded-lg"
            >
              📋 Copy
            </button>
          </div>
        </div>
      </div>

      {/* Reward tracking strip */}
      {referrals.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {rewardCards.map(([label, cls, count]) => (
            <div key={label} className={`rounded-lg border p-3 ${cls}`}>
              <div className="text-xs font-medium uppercase tracking-wide">{label}</div>
              <div className="text-lg font-bold mt-1">{count}</div>
            </div>
          ))}
        </div>
      )}

      {/* New referral */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <h2 className="font-semibold mb-3">Log a new referral</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input className="border rounded-lg px-3 py-2 text-sm" placeholder="Referrer name *" value={referrerName} onChange={(e) => setReferrerName(e.target.value)} />
          <input className="border rounded-lg px-3 py-2 text-sm" placeholder="Referrer email *" type="email" value={referrerEmail} onChange={(e) => setReferrerEmail(e.target.value)} />
          <select className="border rounded-lg px-3 py-2 text-sm" value={referralType} onChange={(e) => setReferralType(e.target.value)}>
            <option value="buyer">Buyer referral</option>
            <option value="seller">Seller referral</option>
          </select>
          <input className="border rounded-lg px-3 py-2 text-sm" placeholder="Referee name" value={refereeName} onChange={(e) => setRefereeName(e.target.value)} />
          <input className="border rounded-lg px-3 py-2 text-sm" placeholder="Referee email" type="email" value={refereeEmail} onChange={(e) => setRefereeEmail(e.target.value)} />
          <input className="border rounded-lg px-3 py-2 text-sm" placeholder="Commission %" type="number" value={commissionPct} onChange={(e) => setCommissionPct(e.target.value)} />
        </div>
        <button
          onClick={createReferral}
          disabled={saving || !referrerName.trim() || !referrerEmail.trim()}
          className="mt-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg"
        >
          {saving ? 'Saving…' : '+ Log referral'}
        </button>
      </div>

      {/* Referral list */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Referrals</h2>
          {referrals.length > 0 && (
            <button onClick={exportCsv} className="text-xs border border-gray-300 hover:bg-gray-50 text-gray-600 font-medium px-3 py-1.5 rounded-lg">
              ⬇ Export CSV
            </button>
          )}
        </div>
        {referrals.length === 0 ? (
          <p className="text-gray-400 text-sm">No referrals yet. Log your first one above.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {referrals.map((referral) => {
              const idx = STATUS_FLOW.indexOf(referral.status)
              const next = STATUS_FLOW[idx + 1]
              return (
                <li key={referral.id} className="py-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-sm">
                      {referral.referee_name || 'Referral'} <span className="text-gray-400">→ {referral.referral_type}</span>
                    </p>
                    <p className="text-xs text-gray-500">
                      {referral.referrer_name} · {referral.referrer_email}
                      {referral.referee_email ? ` · referee: ${referral.referee_email}` : ''}
                      {referral.commission_pct != null ? ` · ${referral.commission_pct}%` : ''}
                      {' · '}
                      {fmtDate(referral.created_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-xs border rounded-full px-2 py-0.5 ${STATUS_COLORS[referral.status] || ''}`}>
                      {referral.status}
                    </span>
                    {next && (
                      <button
                        onClick={() => advanceStatus(referral)}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        Mark {next}
                      </button>
                    )}
                    {referral.referrer_email && (
                      <a
                        href={`mailto:${referral.referrer_email}?subject=${encodeURIComponent('Thank you for your referral!')}&body=${encodeURIComponent(`Hi ${referral.referrer_name || 'there'},\n\nThank you for referring a ${referral.referral_type} — we really appreciate it. We'll keep you updated on progress.\n\nBest,\nThe Team`)}`}
                        className="text-xs text-green-600 hover:underline"
                        title="Send a thank-you email to the referrer"
                      >
                        🙏 Thank-you
                      </a>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

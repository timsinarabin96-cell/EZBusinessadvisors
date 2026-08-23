'use client'

import { useCallback, useEffect, useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import { LoadingState } from '@/components/ui'
import { supabase } from '@/lib/supabase/client'

interface Factor {
  id: string
  factor_type: string
  status: string
  created_at: string
}

export default function SecurityPage() {
  return (
    <AppShell active="Security">
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '24px 20px 60px' }}>
        <Security />
      </div>
    </AppShell>
  )
}

function Security() {
  const [factors, setFactors] = useState<Factor[]>([])
  const [loading, setLoading] = useState(true)
  const [enrolling, setEnrolling] = useState(false)
  const [qrUrl, setQrUrl] = useState('')
  const [factorId, setFactorId] = useState('')
  const [code, setCode] = useState('')
  const [message, setMessage] = useState('')
  const [messageKind, setMessageKind] = useState<'ok' | 'err'>('ok')
  const [require2fa, setRequire2fa] = useState(false)
  const [canManage, setCanManage] = useState(false)
  const [savingPolicy, setSavingPolicy] = useState(false)

  const loadFactors = useCallback(async () => {
    const { data, error } = await supabase.auth.mfa.listFactors()
    setFactors((data?.all || []) as Factor[])
    setLoading(false)
    if (error) {
      setMessage(error.message)
      setMessageKind('err')
    }
    // Agency 2FA policy
    try {
      const token = localStorage.getItem('sb-access-token') || ''
      const res = await fetch('/api/agency/security', { headers: { authorization: `Bearer ${token}` } })
      const sec = await res.json().catch(() => ({}))
      if (sec.ok) {
        setRequire2fa(!!sec.require2fa)
        setCanManage(!!sec.canManage)
      }
    } catch {
      // best-effort
    }
  }, [])

  const togglePolicy = async () => {
    setSavingPolicy(true)
    const token = localStorage.getItem('sb-access-token') || ''
    const res = await fetch('/api/agency/security', {
      method: 'PATCH',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ require2fa: !require2fa }),
    })
    const data = await res.json().catch(() => ({}))
    setSavingPolicy(false)
    if (!res.ok || !data.ok) {
      setMessage(data.error || 'Failed to update policy')
      setMessageKind('err')
      return
    }
    setRequire2fa(!!data.require2fa)
    setMessage(data.require2fa ? '2FA now required for all agency brokers.' : '2FA policy relaxed.')
    setMessageKind('ok')
  }

  useEffect(() => {
    loadFactors()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const enroll = async () => {
    setEnrolling(true)
    setMessage('')
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' })
    setEnrolling(false)
    if (error || !data) {
      setMessage(error?.message || 'Enrollment failed')
      setMessageKind('err')
      return
    }
    setFactorId(data.id)
    setQrUrl(data.totp.qr_code)
    setMessage('Scan the QR code with your authenticator app, then enter the 6-digit code to verify.')
    setMessageKind('ok')
  }

  const verify = async () => {
    if (!factorId || !code.trim()) return
    const { data: challenge } = await supabase.auth.mfa.challenge({ factorId })
    if (!challenge) {
      setMessage('Could not start verification challenge')
      setMessageKind('err')
      return
    }
    const { data, error } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code: code.trim() })
    if (error || !data) {
      setMessage(error?.message || 'Verification failed — check the code')
      setMessageKind('err')
      return
    }
    setMessage('2FA enabled 🎉 Your account now requires a code at sign-in.')
    setMessageKind('ok')
    setQrUrl('')
    setFactorId('')
    setCode('')
    await loadFactors()
  }

  const unenroll = async (id: string) => {
    const { error } = await supabase.auth.mfa.unenroll({ factorId: id })
    if (error) {
      setMessage(error.message)
      setMessageKind('err')
    } else {
      setMessage('Authenticator removed.')
      setMessageKind('ok')
      await loadFactors()
    }
  }

  if (loading) return <LoadingState />

  const enrolled = factors.filter((f) => f.status === 'verified')

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">🛂 Security</h1>
        <p className="text-gray-500 text-sm mt-1">Two-factor authentication for your broker account.</p>
      </div>

      {message && (
        <div className={`mb-4 text-sm rounded-lg p-3 border ${messageKind === 'ok' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
          {message}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <h2 className="font-semibold mb-3">Authenticator app</h2>
        {enrolled.length > 0 ? (
          <ul className="divide-y divide-gray-100">
            {enrolled.map((f) => (
              <li key={f.id} className="py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">TOTP authenticator</p>
                  <p className="text-xs text-gray-500">Added {new Date(f.created_at).toLocaleDateString()}</p>
                </div>
                <button onClick={() => unenroll(f.id)} className="text-xs text-red-500 hover:underline">
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-gray-500 text-sm mb-3">No authenticator enrolled yet. Add one for an extra layer of protection.</p>
        )}

        {!qrUrl ? (
          !enrolled.length && (
            <button
              onClick={enroll}
              disabled={enrolling}
              className="mt-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg"
            >
              {enrolling ? 'Generating…' : '+ Enroll authenticator'}
            </button>
          )
        ) : (
          <div className="mt-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrUrl} alt="Scan with your authenticator app" className="w-48 h-48 border rounded-lg" />
            <div className="flex gap-2 mt-3">
              <input
                className="border rounded-lg px-3 py-2 text-sm w-40 tracking-widest"
                placeholder="6-digit code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              />
              <button onClick={verify} className="bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-4 py-2 rounded-lg">
                Verify & enable
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <h2 className="font-semibold mb-2">Security notes</h2>
        <ul className="text-sm text-gray-600 space-y-1.5 list-disc list-inside">
          <li>2FA uses TOTP (Google Authenticator, Authy, 1Password, etc.).</li>
          <li>Keep your recovery codes in a safe place — account access requires your password + code.</li>
          <li>All external actions (sends, publishing, payments) still require your explicit approval.</li>
        </ul>
      </div>

      {canManage && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold mb-2">Agency policy</h2>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Require 2FA for all brokers</p>
              <p className="text-xs text-gray-500 mt-0.5">
                When enabled, every agency member must enroll an authenticator before using the dashboard.
              </p>
            </div>
            <button
              onClick={togglePolicy}
              disabled={savingPolicy}
              className={`shrink-0 text-sm font-medium px-4 py-2 rounded-lg border transition-colors ${
                require2fa
                  ? 'bg-green-600 hover:bg-green-700 border-green-600 text-white'
                  : 'bg-white hover:bg-gray-50 border-gray-300 text-gray-600'
              }`}
            >
              {savingPolicy ? '…' : require2fa ? '✅ Enforced' : 'Turn on enforcement'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

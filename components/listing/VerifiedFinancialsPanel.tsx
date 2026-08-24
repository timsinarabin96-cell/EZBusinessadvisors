'use client'

import { useCallback, useEffect, useState } from 'react'

declare global {
  interface Window {
    Plaid?: {
      create: (config: {
        token: string
        onSuccess: (public_token: string, metadata: { institution?: { name?: string }; accounts?: { mask?: string; name?: string; subtype?: string }[] }) => void
        onExit?: (err: unknown, metadata: unknown) => void
      }) => { open: () => void; destroy: () => void }
    }
  }
}

/**
 * Verified Financials panel — broker connects the seller's business bank
 * account through Plaid Link (sandbox-first). On success the public listing
 * gets the "✅ Verified Revenue" badge.
 */
export default function VerifiedFinancialsPanel({ listingId }: { listingId: string }) {
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<'idle' | 'loading' | 'connected' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const [institution, setInstitution] = useState<string | null>(null)
  const [accountLabel, setAccountLabel] = useState<string | null>(null)

  const loadPlaidScript = (): Promise<boolean> =>
    new Promise((resolve) => {
      if (window.Plaid) return resolve(true)
      const script = document.createElement('script')
      script.src = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js'
      script.onload = () => resolve(true)
      script.onerror = () => resolve(false)
      document.head.appendChild(script)
    })

  const openLink = useCallback(async () => {
    setBusy(true)
    setStatus('loading')
    setMessage('')
    try {
      const loaded = await loadPlaidScript()
      if (!loaded) {
        setStatus('error')
        setMessage('Could not load Plaid Link. Try again in a moment.')
        return
      }
      const res = await fetch('/api/plaid/link-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingId }),
      })
      const data = await res.json()
      if (!res.ok || !data.link_token) {
        setStatus('error')
        setMessage(data.error || 'Could not create Plaid link.')
        return
      }
      if (!window.Plaid) {
        setStatus('error')
        setMessage('Plaid Link unavailable.')
        return
      }
      const handler = window.Plaid.create({
        token: data.link_token,
        onSuccess: async (publicToken, metadata) => {
          const exchange = await fetch('/api/plaid/exchange', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ listingId, public_token: publicToken }),
          })
          const exchangeData = await exchange.json()
          if (exchange.ok && exchangeData.ok) {
            setStatus('connected')
            setInstitution(exchangeData.institution || metadata.institution?.name || null)
            setAccountLabel(exchangeData.account ? `${exchangeData.account.name} (…${exchangeData.account.mask || '••'})` : null)
            setMessage('Bank connected — Verified Revenue badge is now live on the public listing.')
          } else {
            setStatus('error')
            setMessage(exchangeData.error || 'Connection failed.')
          }
          handler.destroy()
        },
        onExit: () => {
          setStatus('idle')
          setBusy(false)
          handler.destroy()
        },
      })
      handler.open()
    } catch {
      setStatus('error')
      setMessage('Unexpected error. Try again.')
    } finally {
      setBusy(false)
    }
  }, [listingId])

  return (
    <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: 18, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 800, color: 'var(--navy)', fontSize: 15 }}>✅ Verified Revenue</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 3, maxWidth: 420 }}>
            Connect the seller&apos;s business bank account to verify real revenue and mint the public trust badge. Buyers trust verified financials — this is the #1 closing advantage.
          </div>
        </div>
        <button
          onClick={openLink}
          disabled={busy || status === 'loading'}
          style={{
            background: 'linear-gradient(135deg, var(--gold), var(--gold-dark))', color: 'var(--navy)',
            border: 'none', borderRadius: 8, padding: '10px 18px', fontWeight: 800, fontSize: 13.5,
            cursor: busy ? 'wait' : 'pointer', fontFamily: 'Georgia, serif', opacity: busy ? 0.7 : 1,
          }}
        >
          {busy || status === 'loading' ? 'Opening bank connect…' : status === 'connected' ? 'Reconnect Bank' : 'Connect Bank Account'}
        </button>
      </div>

      {status === 'connected' && (
        <div style={{ marginTop: 12, padding: 12, borderRadius: 10, background: '#e6f6ec', color: '#1e7e34', fontSize: 13.5, lineHeight: 1.55 }}>
          <b>Connected.</b> {message}
          {institution && <div style={{ marginTop: 4 }}>🏦 {institution}{accountLabel ? ` · ${accountLabel}` : ''}</div>}
          <div style={{ fontSize: 12, color: '#1e7e34', marginTop: 6 }}>The public listing now shows the ✅ Verified Revenue badge.</div>
        </div>
      )}
      {status === 'error' && (
        <div style={{ marginTop: 12, padding: 12, borderRadius: 10, background: 'rgba(176,0,32,0.08)', color: '#b00020', fontSize: 13.5 }}>
          ⚠️ {message}
        </div>
      )}
      {status === 'idle' && (
        <p style={{ fontSize: 11.5, color: '#9aa5b1', marginTop: 10, marginBottom: 0 }}>
          Sandbox mode: use Plaid test credentials (e.g. user_good / pass_good) when prompted.
        </p>
      )}
    </div>
  )
}

/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { LoadingState } from '@/components/ui'

interface VerifyResult {
  ok: boolean
  reason?: string
  certificate?: {
    id: string
    brokerName: string | null
    brokerEmail: string | null
    moduleTitle: string | null
    issuedAt: string | null
    code: string | null
    verified: boolean
    verifiedAt: string | null
  }
}

/**
 * /verify — public certificate verification (the trust moat).
 * Anyone with a certificate code (or QR scan) can confirm a broker's CBI
 * credential here. No login required.
 */
export default function VerifyPage() {
  const searchParams = useSearchParams()
  const [code, setCode] = useState('')
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState<VerifyResult | null>(null)

  useEffect(() => {
    const param = searchParams.get('code')
    if (param) {
      setCode(param.toUpperCase())
      runVerify(param.toUpperCase())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  const runVerify = async (value?: string) => {
    const trim = (value ?? code).trim().toUpperCase()
    if (!trim) return
    setChecking(true)
    setResult(null)
    try {
      const res = await fetch(`/api/certificates?code=${encodeURIComponent(trim)}`)
      setResult(await res.json())
    } catch {
      setResult({ ok: false, reason: 'Verification failed. Try again.' })
    } finally {
      setChecking(false)
    }
  }

  const cert = result?.certificate
  const valid = result?.ok && cert

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#1a1a2e 0%,#16213e 60%,#0f3460 100%)', padding: '60px 20px' }}>
      <div style={{ maxWidth: 620, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <Link href="/" style={{ color: '#c9a84c', textDecoration: 'none', fontFamily: 'Georgia, serif', fontSize: 24, fontWeight: 800, letterSpacing: 1 }}>CONCORD</Link>
          <div style={{ fontSize: 11, letterSpacing: '0.3em', color: '#c9a84c', textTransform: 'uppercase', marginTop: 2 }}>Credential Verification</div>
        </div>

        <div style={{ background: '#fff', borderRadius: 16, padding: '30px 28px', boxShadow: '0 24px 80px rgba(0,0,0,0.4)' }}>
          <h1 style={{ margin: '0 0 6px', fontFamily: 'Georgia, serif', fontSize: 24, color: '#1a1a2e' }}>Verify a CBI Certificate</h1>
          <p style={{ fontSize: 13.5, color: '#888', margin: '0 0 20px', lineHeight: 1.6 }}>
            Enter a certificate code (printed on every CBI certificate and embedded in its QR code) to confirm it&apos;s genuine.
          </p>

          <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => { if (e.key === 'Enter') runVerify() }}
              placeholder="e.g. ABC23456"
              maxLength={12}
              style={{ flex: 1, padding: '12px 14px', borderRadius: 8, border: '1px solid #e2dccb', fontSize: 15, letterSpacing: '0.08em', fontWeight: 700, textTransform: 'uppercase', outline: 'none' }}
            />
            <button onClick={() => runVerify()} disabled={checking || !code.trim()} style={{ padding: '12px 22px', borderRadius: 8, background: '#1a1a2e', color: '#c9a84c', border: 'none', fontWeight: 800, fontSize: 14, cursor: checking || !code.trim() ? 'not-allowed' : 'pointer', opacity: checking || !code.trim() ? 0.6 : 1 }}>
              {checking ? 'Checking…' : 'Verify'}
            </button>
          </div>

          {checking && <LoadingState label="Checking certificate..." />}

          {result && !checking && (
            <div style={{ border: `1px solid ${valid ? '#c6e9d3' : '#f0dfc0'}`, background: valid ? '#f0faf3' : '#fdf6e8', borderRadius: 12, padding: '18px 20px' }}>
              {valid ? (
                <>
                  <div style={{ fontSize: 15, fontWeight: 800, color: '#15803d' }}>✅ Certificate Verified</div>
                  <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14, color: '#333' }}>
                    <div><strong>Recipient:</strong> {cert.brokerName || 'Verified broker'}</div>
                    <div><strong>Credential:</strong> {cert.moduleTitle || 'Business Intermediary Course Completion'}</div>
                    <div><strong>Issued:</strong> {cert.issuedAt ? new Date(cert.issuedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '—'}</div>
                    <div><strong>Code:</strong> <span style={{ fontFamily: 'monospace', letterSpacing: '0.06em' }}>{cert.code}</span></div>
                  </div>
                  <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(0,0,0,0.08)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <a
                      href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(`https://concorddeal.com/verify?code=${cert.code}`)}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{ padding: '9px 18px', borderRadius: 8, background: '#0a66c2', color: '#fff', textDecoration: 'none', fontWeight: 800, fontSize: 13 }}
                    >
                      Share on LinkedIn ↗
                    </a>
                    <Link href="/marketplace/certified" style={{ padding: '9px 18px', borderRadius: 8, background: '#f4f2ea', color: '#1a1a2e', textDecoration: 'none', fontWeight: 700, fontSize: 13 }}>
                      See all certified intermediaries →
                    </Link>
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 14, color: '#92400e', lineHeight: 1.6 }}>
                  <div style={{ fontWeight: 800, marginBottom: 4 }}>❌ Not verified</div>
                  {result.reason || 'No certificate matches this code. Check the code and try again.'}
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ textAlign: 'center', marginTop: 18, fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
          <Link href="/" style={{ color: '#c9a84c', textDecoration: 'none' }}>← Back to home</Link>
        </div>
      </div>
    </div>
  )
}

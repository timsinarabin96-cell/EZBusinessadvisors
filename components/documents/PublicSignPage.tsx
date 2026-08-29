/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// =============================================================================
// /sign/[token] — accountless signing page. Seller/buyer opens their private
// link (emailed by the broker), reviews the filled document, signs with the
// in-app pad (draw or type). When ALL parties have signed, the executed PDF
// is archived and the document flips to 'signed'.
// =============================================================================

interface SigningDoc {
  title: string
  body: string
  partyLabel: string
  partyName: string | null
}

export default function PublicSignPage({ token }: { token: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const drawing = useRef(false)
  const [doc, setDoc] = useState<SigningDoc | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [mode, setMode] = useState<'draw' | 'type'>('draw')
  const [typedName, setTypedName] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [allSigned, setAllSigned] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/public/sign?token=${encodeURIComponent(token)}`)
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.ok) throw new Error(j.error || 'Invalid link')
      setDoc(j.document)
      setTypedName(j.document.partyName || '')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid link')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { load() }, [load])

  // Canvas setup for draw mode.
  useEffect(() => {
    if (mode !== 'draw') return
    const c = canvasRef.current
    if (!c) return
    const dpr = window.devicePixelRatio || 1
    c.width = c.clientWidth * dpr
    c.height = c.clientHeight * dpr
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)
    ctx.strokeStyle = '#102a43'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }, [mode, done])

  const pos = (e: React.PointerEvent) => {
    const c = canvasRef.current
    if (!c) return
    const r = c.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  const onDown = (e: React.PointerEvent) => {
    drawing.current = true
    const c = canvasRef.current
    const ctx = c?.getContext('2d')
    const p = pos(e)
    if (ctx && p) { ctx.beginPath(); ctx.moveTo(p.x, p.y) }
  }
  const onMove = (e: React.PointerEvent) => {
    if (!drawing.current) return
    const c = canvasRef.current
    const ctx = c?.getContext('2d')
    const p = pos(e)
    if (ctx && p) ctx.lineTo(p.x, p.y), ctx.stroke()
  }
  const onUp = () => { drawing.current = false }

  const signatureDataUrl = (): string | undefined => {
    const c = canvasRef.current
    if (!c) return undefined
    // Trim whitespace: only return data when ink exists.
    const ctx = c.getContext('2d')
    const img = ctx?.getImageData(0, 0, c.width, c.height)
    if (!img) return undefined
    let hasInk = false
    for (let i = 3; i < img.data.length; i += 4) { if (img.data[i] > 0) { hasInk = true; break } }
    if (!hasInk) return undefined
    return c.toDataURL('image/png')
  }

  const sign = async () => {
    if (mode === 'type' && !typedName.trim()) { setError('Please type your full name'); return }
    if (mode === 'draw' && !signatureDataUrl()) { setError('Please draw your signature'); return }
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/public/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          name: mode === 'type' ? typedName.trim() : (doc?.partyName || 'Signed'),
          mode,
          dataUrl: mode === 'draw' ? signatureDataUrl() : undefined,
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.ok) throw new Error(j.error || 'Signing failed')
      setDone(true)
      setAllSigned(!!j.allSigned)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Signing failed')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <Shell><div style={{ color: '#666' }}>Loading document…</div></Shell>

  if (error) {
    return (
      <Shell>
        <div style={{ textAlign: 'center', padding: '30px 0' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔒</div>
          <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 22, color: '#1a1a2e', margin: '0 0 8px' }}>Link unavailable</h1>
          <p style={{ color: '#666', fontSize: 14 }}>{error}</p>
        </div>
      </Shell>
    )
  }

  if (done) {
    return (
      <Shell>
        <div style={{ textAlign: 'center', padding: '30px 0' }}>
          <div style={{ fontSize: 46, marginBottom: 12 }}>✅</div>
          <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 24, color: '#1a1a2e', margin: '0 0 8px' }}>
            {allSigned ? 'Document fully signed' : 'Signature recorded'}
          </h1>
          <p style={{ color: '#666', fontSize: 14, maxWidth: 460, margin: '0 auto' }}>
            {allSigned
              ? 'All parties have signed. The executed document has been saved to your brokerage records automatically.'
              : 'Thank you. Your signature is recorded and timestamped — the broker will be notified once all parties have signed.'}
          </p>
        </div>
      </Shell>
    )
  }

  return (
    <Shell>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <div style={{ background: '#fff', border: '1px solid #ece8dc', borderRadius: 14, padding: 26 }}>
          <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 24, color: '#1a1a2e', margin: '0 0 4px' }}>{doc?.title || 'Document'}</h1>
          <p style={{ color: '#888', fontSize: 13, margin: '0 0 18px' }}>
            Signing as: <strong>{doc?.partyLabel || 'Signer'}</strong>{doc?.partyName ? ` (${doc.partyName})` : ''} · Electronic signature is legally binding.
          </p>

          <div style={{ background: '#faf9f4', border: '1px solid #ece8dc', borderRadius: 10, padding: '18px 20px', whiteSpace: 'pre-wrap', fontFamily: 'Georgia, serif', fontSize: 13.5, lineHeight: 1.7, color: '#26303f', maxHeight: 420, overflow: 'auto' }}>
            {doc?.body || ''}
          </div>

          <div style={{ marginTop: 22 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#1a1a2e', marginBottom: 8 }}>Your signature</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              {(['draw', 'type'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  style={{
                    padding: '7px 16px', borderRadius: 999, border: '1px solid #d8d2c2', cursor: 'pointer',
                    fontSize: 13, fontWeight: 700,
                    background: mode === m ? '#1a1a2e' : '#fff', color: mode === m ? '#c9a84c' : '#1a1a2e',
                  }}
                >
                  {m === 'draw' ? '🖊️ Draw' : '⌨️ Type'}
                </button>
              ))}
            </div>

            {mode === 'draw' ? (
              <canvas
                ref={canvasRef}
                onPointerDown={onDown}
                onPointerMove={onMove}
                onPointerUp={onUp}
                onPointerLeave={onUp}
                style={{ width: '100%', height: 150, border: '1.5px dashed #c9a84c', borderRadius: 10, background: '#fff', touchAction: 'none', cursor: 'crosshair' }}
              />
            ) : (
              <input
                value={typedName}
                onChange={(e) => setTypedName(e.target.value)}
                placeholder="Type your full legal name"
                style={{ width: '100%', padding: '11px 14px', borderRadius: 10, border: '1px solid #d8d2c2', fontSize: 15, fontFamily: 'cursive', color: '#1a1a2e' }}
              />
            )}

            {error && <div style={{ marginTop: 10, color: '#b91c1c', fontSize: 13 }}>{error}</div>}

            <button
              onClick={sign}
              disabled={busy}
              style={{
                marginTop: 16, width: '100%', background: '#1a1a2e', color: '#c9a84c', border: 'none',
                borderRadius: 10, padding: '14px 20px', fontSize: 15, fontWeight: 800, cursor: busy ? 'wait' : 'pointer',
              }}
            >
              {busy ? 'Signing…' : `✍️ Sign & Submit`}
            </button>
            <p style={{ fontSize: 11.5, color: '#aaa', marginTop: 10, textAlign: 'center' }}>
              By signing you agree to the terms of this document. Your signature, timestamp, and IP are recorded.
            </p>
          </div>
        </div>
      </div>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: '#f4f3ef', padding: '40px 20px' }}>
      <div style={{ textAlign: 'center', marginBottom: 22 }}>
        <div style={{ fontSize: 13, letterSpacing: '0.25em', color: '#c9a84c', fontWeight: 800 }}>CONCORD</div>
        <div style={{ fontSize: 12, color: '#8a8678', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Deal Platform · Secure Signing</div>
      </div>
      {children}
      <div style={{ textAlign: 'center', marginTop: 28, fontSize: 11.5, color: '#aaa' }}>
        © 2026 Rabin Timsina (EZ Business Advisors / Concord Deal Platform) · Electronic signatures are legally binding
      </div>
    </div>
  )
}

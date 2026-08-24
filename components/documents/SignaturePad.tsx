'use client'

import { useEffect, useRef, useState } from 'react'
import { signDocument } from '@/lib/documentBuilder'
import { useToast } from '@/components/ui/Toast'

// Signature pad — draw a signature on canvas (or type it), then record it
// against a signature slot with name + timestamp (audit-logged).
export default function SignaturePad({
  signatureId,
  partyName,
  onDone,
  onCancel,
}: {
  signatureId: string
  partyName: string | null
  onDone: () => void
  onCancel: () => void
}) {
  const toast = useToast()
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const drawing = useRef(false)
  const [mode, setMode] = useState<'draw' | 'type'>('draw')
  const [typedName, setTypedName] = useState(partyName || '')
  const [busy, setBusy] = useState(false)
  const [hasInk, setHasInk] = useState(false)

  useEffect(() => {
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
  }, [])

  const pos = (e: React.PointerEvent) => {
    const c = canvasRef.current!
    const r = c.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  const start = (e: React.PointerEvent) => {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    drawing.current = true
    const p = pos(e)
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
    setHasInk(true)
  }

  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const p = pos(e)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
  }

  const end = () => { drawing.current = false }

  const clear = () => {
    const c = canvasRef.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx) return
    ctx.clearRect(0, 0, c.width, c.height)
    setHasInk(false)
  }

  const submit = async () => {
    const name = (mode === 'type' ? typedName : partyName || '').trim()
    if (!name) { toast('Enter the signer name', 'error'); return }
    if (mode === 'draw' && !hasInk) { toast('Draw a signature first', 'error'); return }

    setBusy(true)
    try {
      let signatureData: Record<string, unknown>
      if (mode === 'draw') {
        signatureData = { type: 'draw', dataUrl: canvasRef.current?.toDataURL('image/png'), ts: new Date().toISOString() }
      } else {
        signatureData = { type: 'typed', name: typedName.trim(), ts: new Date().toISOString() }
      }
      await signDocument(signatureId, name, signatureData)
      toast('Signature recorded ✓', 'success')
      onDone()
    } catch (e) {
      toast('Failed to record signature: ' + (e as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(16,42,67,0.55)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onCancel}>
      <div
        style={{ background: '#fff', borderRadius: 14, maxWidth: 520, width: '100%', padding: 24, boxShadow: '0 24px 60px rgba(0,0,0,0.35)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ margin: '0 0 4px', fontFamily: 'Georgia, serif', fontSize: 20, color: 'var(--navy)' }}>✍️ Sign document</h3>
        <p style={{ margin: '0 0 16px', color: 'var(--muted)', fontSize: 13.5 }}>Signing as <strong>{partyName || 'party'}</strong> — your signature, name, and timestamp are recorded in the audit trail.</p>

        {/* Mode toggle */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          {(['draw', 'type'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              style={{
                padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                border: `1px solid ${mode === m ? 'var(--gold)' : 'var(--line)'}`,
                background: mode === m ? '#fdf6e3' : '#fff', color: 'var(--navy)',
              }}
            >
              {m === 'draw' ? '✍️ Draw' : '⌨️ Type'}
            </button>
          ))}
        </div>

        {mode === 'draw' ? (
          <>
            <div style={{ border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden', background: '#fdfcf9' }}>
              <canvas
                ref={canvasRef}
                style={{ width: '100%', height: 180, touchAction: 'none', cursor: 'crosshair', display: 'block' }}
                onPointerDown={start}
                onPointerMove={move}
                onPointerUp={end}
                onPointerLeave={end}
              />
            </div>
            <button onClick={clear} style={{ marginTop: 8, background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 13, textDecoration: 'underline' }}>
              Clear
            </button>
          </>
        ) : (
          <input
            value={typedName}
            onChange={(e) => setTypedName(e.target.value)}
            placeholder="Type full legal name"
            style={{ width: '100%', padding: '11px 12px', borderRadius: 8, border: '1px solid var(--line)', fontSize: 16, fontFamily: 'Georgia, serif', boxSizing: 'border-box' }}
          />
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button className="btn btn-primary" onClick={submit} disabled={busy} style={{ flex: 1 }}>
            {busy ? 'Recording…' : '✓ Confirm signature'}
          </button>
          <button className="btn" onClick={onCancel} disabled={busy}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

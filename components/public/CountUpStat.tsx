/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useEffect, useRef, useState } from 'react'

// =============================================================================
// CountUpStat — animated stat counter with thousands separators.
// Counts up when scrolled into view (or immediately), always renders commas:
// 1247 → "1,247". Empty/zero renders a styled "0" so it never looks broken.
// =============================================================================

export default function CountUpStat({
  value,
  label,
  prefix = '',
  suffix = '',
  accent,
}: {
  value: number | string | null | undefined
  label: string
  prefix?: string
  suffix?: string
  accent?: string
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [display, setDisplay] = useState(0)
  const started = useRef(false)

  const target = typeof value === 'number' && Number.isFinite(value) ? value : Number(String(value ?? '0').replace(/[$,]/g, '')) || 0

  useEffect(() => {
    const el = ref.current
    if (!el) { setDisplay(target); return }
    const io = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && !started.current) {
        started.current = true
        const dur = 900
        const t0 = performance.now()
        const tick = (t: number) => {
          const p = Math.min(1, (t - t0) / dur)
          setDisplay(Math.round(target * (1 - Math.pow(1 - p, 3))))
          if (p < 1) requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      }
    }, { threshold: 0.4 })
    io.observe(el)
    return () => io.disconnect()
  }, [target])

  const formatted = display.toLocaleString('en-US')

  return (
    <div
      ref={ref}
      style={{
        background: 'linear-gradient(160deg,#ffffff,#f7f4ec)',
        border: '1px solid #ece5d4',
        borderRadius: 16,
        padding: '20px 18px',
        textAlign: 'center',
        boxShadow: '0 10px 30px rgba(26,26,46,0.08), inset 0 1px 0 rgba(255,255,255,0.8)',
      }}
    >
      <div style={{ fontSize: 30, fontWeight: 800, color: accent || '#1a1a2e', fontFamily: 'Georgia, serif', lineHeight: 1.1 }}>
        {prefix}{formatted}{suffix}
      </div>
      <div style={{ fontSize: 11.5, color: '#8a8a9a', textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 700, marginTop: 6 }}>
        {label}
      </div>
    </div>
  )
}

'use client'

// =============================================================================
// HomeCountUp — animated stat counter that counts up when scrolled into view.
// Lightweight (IntersectionObserver + rAF), no deps. Used across the advanced
// homepage for live-feeling market stats.
// =============================================================================

import { useEffect, useRef, useState } from 'react'

export default function HomeCountUp({
  value,
  label,
  prefix = '',
  suffix = '',
  duration = 1200,
}: {
  value: number | string
  label: string
  prefix?: string
  suffix?: string
  duration?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [display, setDisplay] = useState('0')
  const started = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !started.current) {
          started.current = true
          const target = typeof value === 'number' ? value : parseFloat(String(value).replace(/[^0-9.]/g, '')) || 0
          const t0 = performance.now()
          const tick = (now: number) => {
            const p = Math.min(1, (now - t0) / duration)
            const eased = 1 - Math.pow(1 - p, 3)
            const current = Math.round(target * eased)
            setDisplay(current.toLocaleString('en-US'))
            if (p < 1) requestAnimationFrame(tick)
          }
          requestAnimationFrame(tick)
        }
      },
      { threshold: 0.4 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [value, duration])

  return (
    <div ref={ref} style={{ textAlign: 'center' }}>
      <div style={{ fontFamily: 'Georgia, serif', fontSize: 30, fontWeight: 800, color: '#1a1a2e' }}>
        {prefix}{display}{suffix}
      </div>
      <div style={{ fontSize: 11.5, color: '#8a8678', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 4 }}>{label}</div>
    </div>
  )
}

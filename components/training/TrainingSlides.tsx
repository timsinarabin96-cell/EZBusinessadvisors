'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Badge } from '@/components/ui'

/**
 * TrainingSlides — presentation mode for a lesson. Splits the lesson body
 * into slides (by blank lines / headings) and narrates them with the
 * browser's built-in speech synthesis (no hosting, no API key). Teachers can
 * press play and let the slides auto-advance, or click through manually.
 */
export default function TrainingSlides({ content, title }: { content: string; title?: string }) {
  const [slide, setSlide] = useState(0)
  const [speaking, setSpeaking] = useState(false)
  const [autoplay, setAutoplay] = useState(false)
  const [supported, setSupported] = useState(true)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const slides = useMemo(() => {
    const blocks = content
      .split(/\n\s*\n/)
      .map((b) => b.trim())
      .filter(Boolean)
    // If the lesson is one big paragraph, chunk it into readable slides.
    if (blocks.length <= 2 && content.length > 600) {
      const sentences = content.match(/[^.!?]+[.!?]+/g) || [content]
      const chunks: string[] = []
      let current = ''
      for (const s of sentences) {
        if ((current + s).length > 420 && current) {
          chunks.push(current.trim())
          current = s
        } else {
          current += s
        }
      }
      if (current.trim()) chunks.push(current.trim())
      return chunks
    }
    return blocks
  }, [content])

  const stopSpeaking = () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel()
    }
    setSpeaking(false)
    if (timerRef.current) clearTimeout(timerRef.current)
  }

  const speakSlide = (index: number) => {
    if (!supported || typeof window === 'undefined' || !('speechSynthesis' in window)) return
    stopSpeaking()
    const text = `${title ? title + '. ' : ''}${slides[index]}`
    const utterance = new SpeechSynthesisUtterance(text.replace(/[#*_`>]/g, ''))
    utterance.rate = 0.95
    utterance.onend = () => {
      setSpeaking(false)
      if (autoplay && index < slides.length - 1) {
        timerRef.current = setTimeout(() => {
          setSlide(index + 1)
          speakSlide(index + 1)
        }, 600)
      }
    }
    window.speechSynthesis.speak(utterance)
    setSpeaking(true)
  }

  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) setSupported(false)
    return stopSpeaking
  }, [])

  const go = (next: number) => {
    stopSpeaking()
    const clamped = Math.max(0, Math.min(slides.length - 1, next))
    setSlide(clamped)
    if (autoplay && speaking) speakSlide(clamped)
  }

  if (!supported) {
    return (
      <div style={{ margin: '16px 0', border: '1px solid var(--line)', borderRadius: 10, padding: '14px 16px', fontSize: 13, color: 'var(--muted)' }}>
        🎞️ Presentation mode needs a browser with speech synthesis (Chrome/Edge/Safari). Your browser doesn&apos;t support it — the written lesson below works fine.
      </div>
    )
  }

  const pct = slides.length ? Math.round(((slide + 1) / slides.length) * 100) : 0

  return (
    <div style={{ margin: '18px 0', border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--navy)', color: '#fff', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 13.5, fontWeight: 800 }}>
          🎞️ Presentation {title ? `— ${title}` : ''}
          <span style={{ marginLeft: 10, fontWeight: 400, opacity: 0.8, fontSize: 12 }}>Slide {slide + 1}/{slides.length}</span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, cursor: 'pointer' }}>
            <input type="checkbox" checked={autoplay} onChange={(e) => setAutoplay(e.target.checked)} /> Narrate
          </label>
          <button onClick={() => go(slide - 1)} disabled={slide === 0} style={btn}>←</button>
          <button onClick={() => (speaking ? stopSpeaking() : speakSlide(slide))} style={{ ...btn, background: speaking ? '#c0392b' : 'var(--gold)', color: '#fff' }}>
            {speaking ? '⏹ Stop' : '🔊 Narrate'}
          </button>
          <button onClick={() => go(slide + 1)} disabled={slide >= slides.length - 1} style={btn}>→</button>
        </div>
      </div>

      <div style={{ padding: '28px 32px', minHeight: 160, fontSize: 16.5, lineHeight: 1.75, color: 'var(--ink)', fontFamily: 'Georgia, serif' }}>
        {slides[slide] || '(empty slide)'}
      </div>

      <div style={{ height: 4, background: 'var(--line)' }}>
        <div style={{ height: 4, width: `${pct}%`, background: 'linear-gradient(90deg, var(--gold-light), var(--gold))', transition: 'width .3s' }} />
      </div>
    </div>
  )
}

const btn: React.CSSProperties = {
  padding: '6px 14px',
  borderRadius: 8,
  border: 'none',
  background: 'rgba(255,255,255,0.15)',
  color: '#fff',
  fontWeight: 700,
  fontSize: 13,
  cursor: 'pointer',
  opacity: 1,
}

/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useMemo, useState } from 'react'

// =============================================================================
// /book — public calendar booking for captured buyers.
// Pick a business day (next 10) + an ET time slot (9:00–16:00), drop your
// name/email, and the call lands in the broker's CRM calendar. No account.
// =============================================================================

const TZ = 'America/New_York'
const HOURS = [9, 10, 11, 12, 13, 14, 15, 16]
const WEEKDAY: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

function etDateInfo(d: Date): { date: string; label: string; weekday: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
  }).formatToParts(d)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    label: `${get('weekday')}, ${get('month')}/${get('day')}`,
    weekday: WEEKDAY[get('weekday')] ?? 0,
  }
}

export default function BookPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [date, setDate] = useState<string | null>(null)
  const [hour, setHour] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState<string | null>(null)

  const days = useMemo(() => {
    const out: { date: string; label: string }[] = []
    const cursor = new Date()
    while (out.length < 10) {
      const info = etDateInfo(cursor)
      if (info.weekday >= 1 && info.weekday <= 5) out.push(info)
      cursor.setDate(cursor.getDate() + 1)
    }
    return out
  }, [])

  const submit = async () => {
    setError('')
    if (!date || hour == null) {
      setError('Pick a day and a time slot.')
      return
    }
    if (!name.trim() || !email.trim()) {
      setError('Name and email are required.')
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/public/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), date, hour }),
      })
      const json = await res.json().catch(() => ({ ok: false, error: 'Server error' }))
      if (!res.ok || !json.ok) {
        setError(json.error || 'Booking failed. Try another slot.')
        setBusy(false)
        return
      }
      setDone(json.message || 'Booked!')
    } catch {
      setError('Network error — please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f4f3ef', display: 'grid', placeItems: 'center', padding: 24, fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div style={{ background: '#fff', borderRadius: 18, maxWidth: 560, width: '100%', padding: '28px 26px', boxShadow: '0 24px 70px rgba(16,42,67,0.18)', border: '1px solid #e5e2d8' }}>
        <div style={{ fontSize: 11, color: '#8a6d1a', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>EZ Business Advisors</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#1a1a2e', fontFamily: 'Georgia, serif', marginBottom: 6 }}>Book a quick call</div>
        <div style={{ fontSize: 13, color: '#666', marginBottom: 20 }}>30 minutes with a broker — we&apos;ll line up businesses that match what you&apos;re looking for.</div>

        {done ? (
          <div style={{ textAlign: 'center', padding: '18px 0' }}>
            <div style={{ fontSize: 34, marginBottom: 8 }}>📅</div>
            <div style={{ fontSize: 17, fontWeight: 800, color: '#1a1a2e', fontFamily: 'Georgia, serif' }}>You&apos;re booked</div>
            <div style={{ fontSize: 13, color: '#666', marginTop: 6 }}>{done}</div>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 12, color: '#888', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Day</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
              {days.map((d) => {
                const active = date === d.date
                return (
                  <button
                    key={d.date}
                    onClick={() => { setDate(d.date); setHour(null) }}
                    style={{
                      padding: '8px 12px', borderRadius: 99, cursor: 'pointer', fontSize: 12.5, fontWeight: 700,
                      background: active ? '#1a1a2e' : '#fff', color: active ? '#c9a84c' : '#1a1a2e',
                      border: active ? '1px solid #1a1a2e' : '1px solid #d8d2c2',
                    }}
                  >
                    {d.label}
                  </button>
                )
              })}
            </div>

            <div style={{ fontSize: 12, color: '#888', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Time (ET)</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
              {HOURS.map((h) => {
                const active = hour === h
                const label = h > 12 ? `${h - 12}:00 PM` : `${h}:00 AM`
                return (
                  <button
                    key={h}
                    onClick={() => setHour(h)}
                    disabled={!date}
                    style={{
                      padding: '8px 12px', borderRadius: 99, cursor: date ? 'pointer' : 'not-allowed', fontSize: 12.5, fontWeight: 700,
                      background: active ? '#1a1a2e' : '#fff', color: active ? '#c9a84c' : '#1a1a2e',
                      border: active ? '1px solid #1a1a2e' : '1px solid #d8d2c2', opacity: date ? 1 : 0.45,
                    }}
                  >
                    {label}
                  </button>
                )
              })}
            </div>

            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              style={{ width: '100%', boxSizing: 'border-box', padding: '11px 13px', border: '1px solid #d8d2c2', borderRadius: 8, fontSize: 13.5, outline: 'none', fontFamily: 'Inter, system-ui, sans-serif', marginBottom: 10 }}
            />
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email — for your confirmation"
              type="email"
              style={{ width: '100%', boxSizing: 'border-box', padding: '11px 13px', border: '1px solid #d8d2c2', borderRadius: 8, fontSize: 13.5, outline: 'none', fontFamily: 'Inter, system-ui, sans-serif', marginBottom: 12 }}
            />

            {error && <div style={{ fontSize: 12.5, color: '#b3261e', marginBottom: 10 }}>{error}</div>}

            <button
              onClick={submit}
              disabled={busy}
              style={{ width: '100%', padding: '13px 0', borderRadius: 10, background: '#1a1a2e', color: '#fff', border: 'none', fontWeight: 800, cursor: busy ? 'wait' : 'pointer', fontSize: 14, fontFamily: 'Georgia, serif' }}
            >
              {busy ? 'Booking…' : 'Confirm my call →'}
            </button>
            <div style={{ fontSize: 11, color: '#aaa', textAlign: 'center', marginTop: 10 }}>Free, no obligation. We&apos;ll call you at the scheduled time.</div>
          </>
        )}
      </div>
    </div>
  )
}

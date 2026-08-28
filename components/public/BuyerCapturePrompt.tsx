/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useEffect, useState } from 'react'
import { getBuyerProfile, saveBuyerProfile } from '@/lib/publicFavorites'

// =============================================================================
// BuyerCapturePrompt — one-question buyer demand capture.
// Shows once per visitor on listing pages: "What are you looking for?" with
// one-tap industry + budget chips and an optional email. The answer powers the
// AI match scores instantly (localStorage) and, when an email is given, lands
// a qualified buyer lead in the CRM via /api/public/notify.
// =============================================================================

const CAPTURE_KEY = 'concord-buyer-capture-at'
const CAPTURE_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000 // once per 30 days

const COMMON_INDUSTRIES = ['Restaurant', 'Food & Beverage', 'Trades & Construction', 'Automotive', 'Healthcare', 'Retail', 'Business Services', 'E-Commerce']
const BUDGETS = [250000, 500000, 1000000, 2500000]

export default function BuyerCapturePrompt({ hintIndustry }: { hintIndustry?: string | null }) {
  const [visible, setVisible] = useState(false)
  const [industries, setIndustries] = useState<string[]>(hintIndustry ? [hintIndustry] : [])
  const [budget, setBudget] = useState<number | null>(null)
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    // Show once per visitor (30-day cooldown), with a short delay so it never
    // blocks the first paint or the content the buyer came for.
    try {
      const last = Number(localStorage.getItem(CAPTURE_KEY) || 0)
      if (Date.now() - last < CAPTURE_COOLDOWN_MS) return
    } catch { /* ignore */ }
    const t = setTimeout(() => setVisible(true), 3500)
    return () => clearTimeout(t)
  }, [])

  const toggleIndustry = (ind: string) => {
    setIndustries((prev) => (prev.includes(ind) ? prev.filter((i) => i !== ind) : [...prev, ind]))
  }

  const submit = async () => {
    if (industries.length === 0 && budget == null) {
      setDone(true) // visitor said "just browsing" — still counts as a signal
    }
    // Save buyer profile → every card's AI match score updates instantly.
    const profile = getBuyerProfile()
    saveBuyerProfile({
      ...profile,
      industries: [...new Set([...profile.industries, ...industries])],
      max_price: budget ?? profile.max_price,
    })
    window.dispatchEvent(new Event('concord-match-profile-updated'))

    // With an email → a qualified CRM lead + future-match alerts.
    if (email.trim()) {
      setBusy(true)
      try {
        await fetch('/api/public/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: email.trim(),
            phone: phone.trim() || null,
            criteria: {
              industries,
              max_price: budget,
            },
          }),
        })
      } catch { /* lead capture is best-effort — never blocks the visitor */ }
      setBusy(false)
    }

    try { localStorage.setItem(CAPTURE_KEY, String(Date.now())) } catch { /* ignore */ }
    setDone(true)
    setTimeout(() => setVisible(false), 1200)
  }

  if (!visible) return null

  // Non-blocking card (bottom-right) — previously a full-screen fixed overlay
  // (inset:0, zIndex:9995) that covered the whole page and swallowed clicks on
  // the contact form / submit buttons. Buyers could not submit inquiries while
  // it was up. Now it floats in a corner and never intercepts page clicks.
  return (
    <div style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 900, width: 'min(400px, calc(100vw - 32px))', background: '#fff', borderRadius: 16, boxShadow: '0 20px 60px rgba(16,42,67,0.28)', padding: '20px 20px 18px', border: '1px solid #ece8dc' }}>
      <button
        onClick={() => { try { localStorage.setItem(CAPTURE_KEY, String(Date.now())) } catch { /* ignore */ } setVisible(false) }}
        aria-label="Dismiss"
        style={{ position: 'absolute', top: 10, right: 12, background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#999', lineHeight: 1 }}
      >
        ✕
      </button>

        {done ? (
          <div style={{ textAlign: 'center', padding: '14px 0' }}>
            <div style={{ fontSize: 34, marginBottom: 8 }}>✅</div>
            <div style={{ fontSize: 17, fontWeight: 800, color: '#1a1a2e', fontFamily: 'Georgia, serif' }}>Matches are live</div>
            <div style={{ fontSize: 13, color: '#666', marginTop: 6 }}>Every listing now shows your fit score.{email.trim() ? ' Check your inbox for your invite.' : ''}</div>
            <a
              href="/book"
              style={{ display: 'inline-block', marginTop: 16, padding: '12px 22px', borderRadius: 10, background: '#1a1a2e', color: '#fff', textDecoration: 'none', fontWeight: 800, fontSize: 14, fontFamily: 'Georgia, serif' }}
            >
              📅 Book a call with a broker
            </a>
            <div style={{ fontSize: 11, color: '#aaa', marginTop: 10 }}>Free, no obligation — 30 minutes.</div>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 11, color: '#8a6d1a', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>One quick question</div>
            <div style={{ fontSize: 19, fontWeight: 800, color: '#1a1a2e', fontFamily: 'Georgia, serif', marginBottom: 14 }}>
              What are you looking for?
            </div>

            <div style={{ fontSize: 12, color: '#888', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Business type</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
              {COMMON_INDUSTRIES.map((ind) => {
                const active = industries.includes(ind)
                return (
                  <button
                    key={ind}
                    onClick={() => toggleIndustry(ind)}
                    style={{
                      padding: '7px 13px', borderRadius: 99, cursor: 'pointer', fontSize: 12.5, fontWeight: 700,
                      background: active ? '#1a1a2e' : '#fff', color: active ? '#c9a84c' : '#1a1a2e',
                      border: active ? '1px solid #1a1a2e' : '1px solid #d8d2c2',
                    }}
                  >
                    {ind}
                  </button>
                )
              })}
            </div>

            <div style={{ fontSize: 12, color: '#888', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Budget</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
              {BUDGETS.map((b) => {
                const active = budget === b
                return (
                  <button
                    key={b}
                    onClick={() => setBudget(active ? null : b)}
                    style={{
                      padding: '7px 13px', borderRadius: 99, cursor: 'pointer', fontSize: 12.5, fontWeight: 700,
                      background: active ? '#1a1a2e' : '#fff', color: active ? '#c9a84c' : '#1a1a2e',
                      border: active ? '1px solid #1a1a2e' : '1px solid #d8d2c2',
                    }}
                  >
                    {b >= 1000000 ? `$${b / 1000000}M+` : `$${b / 1000}k`}
                  </button>
                )
              })}
            </div>

            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email (optional — get matched listings)"
              type="email"
              style={{ width: '100%', boxSizing: 'border-box', padding: '11px 13px', border: '1px solid #d8d2c2', borderRadius: 8, fontSize: 13.5, outline: 'none', fontFamily: 'Inter, system-ui, sans-serif', marginBottom: 10 }}
            />

            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Phone (optional — brokers can call you)"
              type="tel"
              style={{ width: '100%', boxSizing: 'border-box', padding: '11px 13px', border: '1px solid #d8d2c2', borderRadius: 8, fontSize: 13.5, outline: 'none', fontFamily: 'Inter, system-ui, sans-serif', marginBottom: 14 }}
            />

            <button
              onClick={submit}
              disabled={busy}
              style={{ width: '100%', padding: '13px 0', borderRadius: 10, background: '#1a1a2e', color: '#fff', border: 'none', fontWeight: 800, cursor: busy ? 'wait' : 'pointer', fontSize: 14, fontFamily: 'Georgia, serif' }}
            >
              {busy ? 'Saving…' : 'Show my matches →'}
            </button>
            <div style={{ fontSize: 11, color: '#aaa', textAlign: 'center', marginTop: 10 }}>No spam — we email your invite + matching listings only.</div>
          </>
        )}
    </div>
  )
}

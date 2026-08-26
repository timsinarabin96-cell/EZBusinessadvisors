/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useEffect, useState } from 'react'
import { authenticatedFetch } from '@/lib/authenticatedFetch'
import { Card } from '@/components/ui'

interface GamificationState {
  xp: number
  current_streak: number
  best_streak: number
  modules_certified: number
  program_certified: boolean
}

interface GamificationResponse {
  ok: boolean
  state?: GamificationState
  tier?: string
  tierLabel?: string
  tierIcon?: string
  next?: { tier: string; label: string; needed: number } | null
}

/**
 * Gamification card — XP, streak, CBI title ladder, and progress to the next
 * title. Reads the server-side state (authoritative streak math).
 */
export default function TrainingGamificationCard() {
  const [data, setData] = useState<GamificationResponse | null>(null)

  useEffect(() => {
    authenticatedFetch('/api/training/gamification')
      .then((r) => r.json().catch(() => null))
      .then((j) => setData(j?.ok ? j : null))
      .catch(() => setData(null))
  }, [])

  if (!data?.state) return null // degrade silently when gamification is unavailable

  const { state, tierIcon, tierLabel, next } = data
  const totalXp = state.xp
  const pctToNext = next ? Math.min(100, Math.round((totalXp / (totalXp + next.needed)) * 100)) : 100

  return (
    <Card style={{ marginBottom: 24 }}>
      <div style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 40 }}>{tierIcon || '🥉'}</div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 12, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 800 }}>
            Your CBI Title
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--navy)', fontFamily: 'Georgia, serif', margin: '2px 0' }}>
            {tierLabel || 'Associate CBI'}
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>
            {next ? `${next.needed.toLocaleString()} XP to ${next.label}` : 'Top title achieved — keep the streak alive! 🔥'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 26 }}>
          <Stat icon="⚡" label="XP" value={totalXp.toLocaleString()} />
          <Stat icon="🔥" label="Streak" value={`${state.current_streak} day${state.current_streak === 1 ? '' : 's'}`} sub={`Best: ${state.best_streak}`} />
          <Stat icon="🏆" label="Modules" value={String(state.modules_certified)} />
        </div>
        <div style={{ minWidth: 180, flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--muted)', marginBottom: 5, fontWeight: 700 }}>
            <span>Next title</span>
            <span>{next ? `${totalXp.toLocaleString()} / ${(totalXp + next.needed).toLocaleString()} XP` : 'Maxed out'}</span>
          </div>
          <div style={{ background: 'var(--line)', borderRadius: 999, height: 8, overflow: 'hidden' }}>
            <div style={{ width: `${pctToNext}%`, height: 8, background: 'linear-gradient(90deg, var(--gold-light), var(--gold))', borderRadius: 999, transition: 'width .4s' }} />
          </div>
        </div>
      </div>
    </Card>
  )
}

function Stat({ icon, label, value, sub }: { icon: string; label: string; value: string; sub?: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 18 }}>{icon}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--navy)', marginTop: 2 }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700 }}>{label}{sub ? ` · ${sub}` : ''}</div>
    </div>
  )
}

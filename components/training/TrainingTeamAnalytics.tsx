/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useEffect, useState } from 'react'
import { authenticatedFetch } from '@/lib/authenticatedFetch'
import { Card, CardHeader, Badge } from '@/components/ui'

interface BrokerRow {
  profileId: string
  name: string
  xp: number
  streak: number
  modulesCertified: number
  programCertified: boolean
}

interface AnalyticsData {
  leaderboard: BrokerRow[]
  stuck: BrokerRow[]
  teamStats: { brokers: number; totalXp: number; modulesCertified: number; programCertified: number }
}

/**
 * Team analytics — the agency-owner tool: leaderboard, who's stuck,
 * aggregate program stats. Makes training a management instrument.
 */
export default function TrainingTeamAnalytics() {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    authenticatedFetch('/api/training/analytics')
      .then((r) => r.json().catch(() => null))
      .then((j) => (j?.ok ? setData(j) : setData(null)))
      .catch(() => setData(null))
  }, [])

  if (!data && !error) return null // degrades silently
  if (!data) return null

  const medal = (i: number) => (i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`)

  return (
    <Card style={{ marginBottom: 24 }}>
      <CardHeader title="📊 Team Training Analytics" subtitle="Who's leading, who needs a nudge" />
      <div style={{ padding: '8px 24px 24px' }}>
        {/* Team stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 18 }}>
          <Stat label="Brokers" value={String(data.teamStats.brokers)} />
          <Stat label="Total XP" value={data.teamStats.totalXp.toLocaleString()} />
          <Stat label="Modules certified" value={String(data.teamStats.modulesCertified)} />
          <Stat label="CBI program complete" value={String(data.teamStats.programCertified)} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
          {/* Leaderboard */}
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--navy)', marginBottom: 8 }}>🏆 Leaderboard</div>
            {data.leaderboard.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>No training activity yet.</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {data.leaderboard.slice(0, 8).map((r, i) => (
                <div key={r.profileId} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--paper)', borderRadius: 8, padding: '8px 12px', fontSize: 13 }}>
                  <span style={{ width: 26, fontWeight: 800 }}>{medal(i)}</span>
                  <span style={{ flex: 1, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                  {r.programCertified && <Badge color="#c9a84c">🎓</Badge>}
                  <span style={{ fontWeight: 800 }}>{r.xp.toLocaleString()} XP</span>
                  <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>🔥{r.streak}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Who's stuck */}
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--navy)', marginBottom: 8 }}>🆘 Needs a nudge</div>
            {data.stuck.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>Everyone's moving — nice. 💪</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {data.stuck.slice(0, 8).map((r) => (
                <div key={r.profileId} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fdf6e8', border: '1px solid #f0dfc0', borderRadius: 8, padding: '8px 12px', fontSize: 13 }}>
                  <span style={{ flex: 1, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>{r.modulesCertified} modules · {r.xp} XP</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Card>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: 'var(--paper)', borderRadius: 10, padding: '12px 14px', textAlign: 'center' }}>
      <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--navy)' }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 2 }}>{label}</div>
    </div>
  )
}

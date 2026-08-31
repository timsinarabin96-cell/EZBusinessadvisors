/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import {
  DashboardStats, FunnelPoint, ActivityItem, BuildRunSummary,
  fetchDashboardStats, fetchPipelineFunnel, fetchRecentActivity, fetchUpcomingTasks, fetchBuildHealth,
} from '@/lib/dashboard'
import { Card, CardHeader, StatCard, LoadingState } from '@/components/ui'
import LiveFeed from '@/components/dashboard/LiveFeed'
import { useRealtimeListener } from '@/lib/realtime'

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [funnel, setFunnel] = useState<FunnelPoint[]>([])
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [tasks, setTasks] = useState<ActivityItem[]>([])
  const [buildHealth, setBuildHealth] = useState<{ runs: BuildRunSummary[]; successRate: number | null; avgDurationMs: number | null } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      try {
        const [s, f, a, t, bh] = await Promise.all([
          fetchDashboardStats(), fetchPipelineFunnel(), fetchRecentActivity(), fetchUpcomingTasks(), fetchBuildHealth(),
        ])
        setStats(s); setFunnel(f); setActivity(a); setTasks(t); setBuildHealth(bh)
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  // Realtime refresh — when deals/leads/listings change, re-pull stats.
  const refresh = () => {
    fetchDashboardStats().then(setStats).catch(() => {})
    fetchPipelineFunnel().then(setFunnel).catch(() => {})
  }
  useRealtimeListener('deals', refresh)
  useRealtimeListener('seller_leads', refresh)
  useRealtimeListener('buyer_leads', refresh)
  useRealtimeListener('listings', refresh)

  if (loading) return <LoadingState label="Loading dashboard..." />

  return (
    <div>
      <header style={{ marginBottom: 24, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--gold-dark)', fontWeight: 800 }}>Broker Command Center</div>
          <h1 style={{ margin: '4px 0 0', fontSize: 28, fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' }}>Dashboard</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: 14 }}>
            EZ Business Advisors — deal overview · {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <LiveFeed />
      </header>

      {/* Deal Autopilot — front door */}
      <Link href="/dashboard/ai?tab=autopilot" style={{ textDecoration: 'none' }}>
        <div style={{ marginBottom: 24, padding: '18px 22px', borderRadius: 12, background: 'linear-gradient(120deg, var(--navy) 0%, var(--navy-2) 100%)', border: '1px solid rgba(201,168,76,0.35)', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', transition: 'transform .15s, box-shadow .15s' }}>
          <div style={{ fontSize: 34 }}>✨</div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ color: 'var(--gold)', fontSize: 11, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase' }}>
              Deal Autopilot
            </div>
            <div style={{ color: '#fff', fontSize: 18, fontWeight: 700, fontFamily: 'Georgia, serif', marginTop: 2 }}>
              Your AI brief — risks, follow-ups, next best actions
            </div>
            <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, marginTop: 4 }}>
              Open the command center to see deal health, approval queue, follow-up autopilot, and intelligence.
            </div>
          </div>
          <span style={{ background: 'var(--gold)', color: '#fff', borderRadius: 8, padding: '10px 18px', fontWeight: 700, fontSize: 14 }}>
            Open Autopilot →
          </span>
        </div>
      </Link>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14, marginBottom: 24 }}>
        <StatCard label="Total Listings" value={stats?.totalListings || 0} icon="🏢" />
        <StatCard label="Active Listings" value={stats?.activeListings || 0} icon="✅" accent="#22c55e" />
        <StatCard label="Total Deals" value={stats?.totalDeals || 0} icon="🤝" />
        <StatCard label="Pending Deals" value={stats?.pendingDeals || 0} icon="⏳" accent="#f59e0b" />
        <StatCard label="Total Leads" value={stats?.totalLeads || 0} icon="🎯" accent="#8b5cf6" />
        <StatCard label="New Leads" value={stats?.newLeads || 0} icon="✨" accent="#3b82f6" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Pipeline funnel */}
          <Card>
            <CardHeader title="Deal Pipeline Funnel" subtitle="Deals at each stage" />
            <div style={{ padding: 20, height: 320 }}>
              {funnel.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--muted)' }}>No deals yet — move deals through the pipeline to see the funnel.</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={funnel} layout="vertical" margin={{ left: 20, right: 20, top: 10, bottom: 10 }}>
                    <XAxis type="number" allowDecimals={false} />
                    <YAxis type="category" dataKey="stage" width={130} tick={{ fontFamily: 'Georgia, serif', fontSize: 13 }} />
                    <Tooltip
                      contentStyle={{ fontFamily: 'Georgia, serif', borderRadius: 8, border: '1px solid var(--line)' }}
                    />
                    <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                      {funnel.map((_, i) => (
                        <Cell key={i} fill={['#3b82f6', '#f59e0b', '#8b5cf6', '#06b6d4', '#22c55e'][i]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </Card>

          {/* Upcoming tasks */}
          <Card>
            <CardHeader title="Upcoming Tasks & Deadlines" subtitle="Next due diligence due dates" />
            <div style={{ padding: '12px 20px' }}>
              {tasks.length === 0 ? (
                <div style={{ padding: '20px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                  No upcoming tasks. Add due diligence items to track deadlines.
                </div>
              ) : (
                tasks.map((t) => (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
                    <span style={{ padding: '4px 10px', borderRadius: 99, fontSize: 12, fontWeight: 700, background: 'rgba(201,168,76,0.15)', color: 'var(--gold-dark)' }}>
                      {t.createdAt ? new Date(t.createdAt + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'No date'}
                    </span>
                    <span style={{ flex: 1, fontSize: 14, color: 'var(--text)' }}>{t.title}</span>
                    <span style={{ fontSize: 12, color: 'var(--muted)', textTransform: 'capitalize' }}>{t.detail}</span>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>

        {/* Right column: activity + quick actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <Card>
            <CardHeader title="⚙️ Pipeline Health" subtitle="One-Shot build success rate & recent runs" />
            <div style={{ padding: '14px 20px 20px' }}>
              {!buildHealth || buildHealth.runs.length === 0 ? (
                <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>
                  No builds yet — run the One-Shot builder and the pipeline health trail appears here.
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
                    <div style={{ flex: 1, textAlign: 'center', background: '#f8fafc', borderRadius: 10, padding: '10px 8px' }}>
                      <div style={{ fontSize: 22, fontWeight: 800, color: (buildHealth.successRate ?? 0) >= 90 ? '#15803d' : (buildHealth.successRate ?? 0) >= 70 ? '#b45309' : '#b91c1c' }}>
                        {buildHealth.successRate}%
                      </div>
                      <div style={{ fontSize: 10.5, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Success rate</div>
                    </div>
                    <div style={{ flex: 1, textAlign: 'center', background: '#f8fafc', borderRadius: 10, padding: '10px 8px' }}>
                      <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--navy)' }}>
                        {buildHealth.avgDurationMs != null ? `${Math.round(buildHealth.avgDurationMs / 1000)}s` : '—'}
                      </div>
                      <div style={{ fontSize: 10.5, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Avg build time</div>
                    </div>
                    <div style={{ flex: 1, textAlign: 'center', background: '#f8fafc', borderRadius: 10, padding: '10px 8px' }}>
                      <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--navy)' }}>{buildHealth.runs.length}</div>
                      <div style={{ fontSize: 10.5, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Recent runs</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {buildHealth.runs.slice(0, 5).map((r, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                        <span>{r.status === 'done' ? '✅' : '❌'}</span>
                        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text)' }}>
                          {r.businessName || 'Deal'}{r.failed ? ` · ${r.failed} flag(s)` : ''}
                        </span>
                        <span style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                          {Math.round((r.durationMs || 0) / 1000)}s
                        </span>
                        <span style={{ color: '#94a3b8', whiteSpace: 'nowrap' }}>
                          {new Date(r.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Quick Actions" />
            <div style={{ padding: '12px 20px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {[
                { href: '/listings', label: '+ New Listing', icon: '🏢' },
                { href: '/pipeline', label: '+ New Deal', icon: '🤝' },
                { href: '/leads', label: '+ Add Lead', icon: '🎯' },
                { href: '/dashboard/reports', label: 'Generate CIM', icon: '📑' },
                { href: '/dashboard/reports', label: 'Generate BOV', icon: '⚖️' },
                { href: '/dashboard/deal-room', label: 'Deal Room', icon: '📁' },
              ].map((a) => (
                <Link key={a.href + a.label} href={a.href} className="lift" style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '13px 12px',
                  borderRadius: 12, border: '1px solid var(--line)', background: '#fff',
                  textDecoration: 'none', color: 'var(--navy)', fontSize: 13, fontWeight: 700,
                  boxShadow: '0 1px 3px rgba(15,23,42,0.05)', transition: 'all 0.18s ease',
                }}>
                  <span style={{ fontSize: 18, filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.12))' }}>{a.icon}</span> {a.label}
                </Link>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader title="Recent Activity" />
            <div style={{ padding: '12px 20px 20px' }}>
              {activity.length === 0 ? (
                <div style={{ padding: '16px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                  No activity yet.
                </div>
              ) : (
                activity.map((a) => (
                  <div key={a.id} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
                    <span style={{ fontSize: 16 }}>{a.kind === 'deal' ? '🤝' : a.kind === 'lead' ? '🎯' : '📝'}</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, color: 'var(--text)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title}</div>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                        {a.detail} · {a.createdAt ? timeAgo(a.createdAt) : ''}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}

const timeAgo = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return new Date(iso).toLocaleDateString()
}

/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useEffect, useState } from 'react'
import { AiAction, DealTwin, fetchAutopilotOverview } from '@/lib/autopilot'
import FollowUpAutopilot from '@/components/autopilot/FollowUpAutopilot'

type Overview = {
  twins: DealTwin[]
  actions: AiAction[]
  agencyConfigured: boolean
  schemaPending?: boolean
}

export default function AutopilotDashboard() {
  const [overview, setOverview] = useState<Overview>({ twins: [], actions: [], agencyConfigured: true })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchAutopilotOverview()
      .then(setOverview)
      .catch((loadError) => setError((loadError as Error).message))
      .finally(() => setLoading(false))
  }, [])

  const urgent = overview.actions.filter((action) => action.risk_level === 'critical' || action.risk_level === 'high')
  const approvals = overview.actions.filter((action) => action.approval_required && action.status === 'proposed')
  const atRisk = overview.twins.filter((twin) => (twin.health_score ?? 100) < 60)

  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <div>
        <div style={{ display: 'inline-flex', padding: '4px 9px', borderRadius: 999, background: '#fef3c7', color: '#92400e', fontWeight: 700, fontSize: 12, marginBottom: 10 }}>CONCORD AI</div>
        <h1 style={{ fontFamily: 'Georgia, serif', color: 'var(--navy)', margin: '0 0 6px' }}>Deal Autopilot</h1>
        <p style={{ color: 'var(--muted)', margin: 0 }}>The daily operating view for risks, approvals, next-best actions, and living Deal Twins.</p>
      </div>

      {overview.schemaPending && (
        <div style={{ padding: 16, borderRadius: 10, background: '#fff7ed', border: '1px solid #fed7aa', color: '#9a3412' }}>
          Autopilot code is installed. Apply <code>sql/ai_operating_system_schema.sql</code> to activate live deal intelligence.
        </div>
      )}
      {!overview.agencyConfigured && (
        <div style={{ padding: 16, borderRadius: 10, background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e40af' }}>Connect your profile to an agency before activating Deal Autopilot.</div>
      )}
      {error && <div style={{ padding: 14, borderRadius: 10, background: '#fef2f2', color: '#991b1b' }}>{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 14 }}>
        <Metric label="Tracked deals" value={overview.twins.length} color="#1d4ed8" />
        <Metric label="At risk" value={atRisk.length} color="#b91c1c" />
        <Metric label="Needs approval" value={approvals.length} color="#a16207" />
        <Metric label="Urgent actions" value={urgent.length} color="#7e22ce" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.15fr) minmax(0, 0.85fr)', gap: 22, alignItems: 'start' }}>
        <section style={panelStyle}>
          <h2 style={headingStyle}>Today’s action queue</h2>
          {loading ? <p style={{ color: 'var(--muted)' }}>Analyzing workspace…</p> : overview.actions.length === 0 ? (
            <Empty message="No AI actions yet. The first analyzer will populate this queue from listings, deals, calls, and documents." />
          ) : overview.actions.map((action) => (
            <div key={action.id} style={{ borderTop: '1px solid var(--line)', padding: '14px 0', display: 'grid', gap: 5 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <strong style={{ color: 'var(--navy)' }}>{action.title}</strong>
                <span style={{ fontSize: 11, textTransform: 'uppercase', fontWeight: 800, color: riskColor(action.risk_level) }}>{action.risk_level}</span>
              </div>
              {action.description && <span style={{ color: 'var(--muted)', fontSize: 13 }}>{action.description}</span>}
              <span style={{ fontSize: 12, color: action.approval_required ? '#92400e' : '#166534' }}>{action.approval_required ? 'Approval required' : 'Safe to automate'} · {action.status}</span>
            </div>
          ))}
        </section>

        <section style={panelStyle}>
          <h2 style={headingStyle}>Deal health</h2>
          {overview.twins.length === 0 ? <Empty message="Deal Twins will appear after the analyzer creates the first intelligence snapshots." /> : overview.twins.map((twin) => (
            <div key={twin.id} style={{ borderTop: '1px solid var(--line)', padding: '14px 0', display: 'grid', gap: 7 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <strong style={{ color: 'var(--navy)' }}>{twin.stage || 'Active deal'}</strong>
                <strong style={{ color: healthColor(twin.health_score) }}>{Math.round(twin.health_score ?? 0)}%</strong>
              </div>
              <div style={{ height: 7, background: '#e5e7eb', borderRadius: 99, overflow: 'hidden' }}><div style={{ height: '100%', width: `${twin.health_score || 0}%`, background: healthColor(twin.health_score) }} /></div>
              <span style={{ color: 'var(--muted)', fontSize: 13 }}>{twin.summary || 'Awaiting AI analysis.'}</span>
            </div>
          ))}
        </section>
      </div>

      {/* Follow-up autopilot — silent leads get one-tap texts */}
      <FollowUpAutopilot />
    </div>
  )
}

function Metric({ label, value, color }: { label: string; value: number; color: string }) {
  return <div style={{ ...panelStyle, padding: 18 }}><div style={{ fontSize: 28, fontWeight: 800, color }}>{value}</div><div style={{ color: 'var(--muted)', fontSize: 13 }}>{label}</div></div>
}

function Empty({ message }: { message: string }) {
  return <div style={{ padding: 22, background: 'var(--cream)', borderRadius: 10, color: 'var(--muted)', lineHeight: 1.5 }}>{message}</div>
}

function riskColor(risk: AiAction['risk_level']) {
  return ({ low: '#166534', medium: '#a16207', high: '#b91c1c', critical: '#7f1d1d' })[risk]
}

function healthColor(score: number | null) {
  if ((score ?? 0) < 40) return '#b91c1c'
  if ((score ?? 0) < 70) return '#d97706'
  return '#15803d'
}

const panelStyle: React.CSSProperties = { background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 22 }
const headingStyle: React.CSSProperties = { margin: '0 0 16px', color: 'var(--navy)', fontFamily: 'Georgia, serif' }

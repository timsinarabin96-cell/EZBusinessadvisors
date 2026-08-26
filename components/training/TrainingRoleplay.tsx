/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useEffect, useState } from 'react'
import { authenticatedFetch } from '@/lib/authenticatedFetch'
import { Card, CardHeader, LoadingState, Badge } from '@/components/ui'
import { useToast } from '@/components/ui/Toast'

interface RoleplayRole {
  side: 'buyer' | 'seller'
  label: string
  opening: string
}

interface RoleplayScenario {
  id: string
  title: string
  deal: string
  asking_price: number
  sde: number
  fair_range: [number, number]
  roles: { buyer: RoleplayRole; seller: RoleplayRole }
  tips: string[]
}

interface RoleplayGrade {
  score: number
  passed: boolean
  agreedPrice: number
  sdeMultiple: number
  inFairRange: boolean
  insideWalkAway: boolean
  feedback: string[]
}

/**
 * Negotiation Roleplay — argue the deal with an AI counterpart, then lock
 * your final number and get graded against the defensible band.
 */
export default function TrainingRoleplay() {
  const toast = useToast()
  const [scenario, setScenario] = useState<RoleplayScenario | null>(null)
  const [loading, setLoading] = useState(true)
  const [price, setPrice] = useState('')
  const [grading, setGrading] = useState(false)
  const [grade, setGrade] = useState<RoleplayGrade | null>(null)
  const [aiFeedback, setAiFeedback] = useState<string | null>(null)

  useEffect(() => {
    authenticatedFetch('/api/training/roleplay')
      .then((r) => r.json().catch(() => null))
      .then((j) => setScenario(j?.scenario || null))
      .catch(() => setScenario(null))
      .finally(() => setLoading(false))
  }, [])

  const submit = async () => {
    if (!scenario) return
    const p = Number(price)
    if (!Number.isFinite(p) || p <= 0) {
      toast('Enter your final agreed price', 'error')
      return
    }
    setGrading(true)
    setGrade(null)
    setAiFeedback(null)
    try {
      const res = await authenticatedFetch('/api/training/roleplay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: scenario.id, agreedPrice: p }),
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error || 'Grading failed')
      setGrade(json.grade)
      setAiFeedback(json.aiFeedback || null)
    } catch (e: any) {
      toast(e.message || 'Failed to grade', 'error')
    } finally {
      setGrading(false)
    }
  }

  if (loading) return <LoadingState label="Loading negotiation room..." />
  if (!scenario) return null

  const fmt = (n: number) => '$' + Math.round(n).toLocaleString()

  return (
    <Card style={{ marginBottom: 24 }}>
      <CardHeader title="🤝 Negotiation Roleplay" subtitle="Argue the deal with an AI counterpart — then lock your final number and get graded" />
      <div style={{ padding: '8px 24px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
          <Badge color="#c9a84c">Asking {fmt(scenario.asking_price)}</Badge>
          <Badge color="#3b82f6">SDE {fmt(scenario.sde)}</Badge>
          <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>Fair band {fmt(scenario.fair_range[0])}–{fmt(scenario.fair_range[1])}</span>
        </div>
        <h3 style={{ margin: '8px 0 12px', fontSize: 19, fontFamily: 'Georgia, serif' }}>{scenario.title}</h3>
        <p style={{ fontSize: 13.5, lineHeight: 1.65, color: 'var(--ink)', margin: '0 0 16px' }}>{scenario.deal}</p>

        {/* Opening positions */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12, marginBottom: 16 }}>
          <div style={{ border: '1px solid var(--line)', borderRadius: 10, padding: '14px 16px', background: '#f4f2ea' }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#8a6d1a', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>🛒 {scenario.roles.buyer.label}</div>
            <div style={{ fontSize: 13, lineHeight: 1.6 }}>{scenario.roles.buyer.opening}</div>
          </div>
          <div style={{ border: '1px solid var(--line)', borderRadius: 10, padding: '14px 16px', background: '#f0f5f0' }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#1e7e34', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>🏷️ {scenario.roles.seller.label}</div>
            <div style={{ fontSize: 13, lineHeight: 1.6 }}>{scenario.roles.seller.opening}</div>
          </div>
        </div>

        {/* Lock the number */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 14 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 700, color: '#555' }}>
            Your final agreed price ($)
            <input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="e.g. 300000" inputMode="numeric" style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid var(--line)', fontSize: 14, outline: 'none', background: '#fff', color: 'var(--ink)' }} />
          </label>
          <button onClick={submit} disabled={grading} style={{ padding: '11px 22px', borderRadius: 8, background: 'var(--gold)', color: 'var(--navy)', border: 'none', fontWeight: 800, fontSize: 14, cursor: grading ? 'wait' : 'pointer' }}>
            {grading ? 'Grading…' : 'Lock it in'}
          </button>
        </div>

        {/* Grade */}
        {grade && (
          <div style={{ border: `1px solid ${grade.passed ? '#c6e9d3' : '#f0dfc0'}`, background: grade.passed ? '#f0faf3' : '#fdf6e8', borderRadius: 10, padding: '16px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 26, fontWeight: 800, color: grade.passed ? '#15803d' : '#b45309' }}>{grade.score}/100</span>
              <Badge color={grade.passed ? '#22c55e' : '#f59e0b'}>{grade.passed ? 'Deal closed in band 🎉' : 'Left value on the table'}</Badge>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {grade.feedback.map((f, i) => (
                <div key={i} style={{ fontSize: 13.5, lineHeight: 1.55 }}>{f}</div>
              ))}
            </div>
            {aiFeedback && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(0,0,0,0.08)', fontSize: 13.5, lineHeight: 1.6 }}>
                <strong>🧑‍🏫 Coach:</strong> {aiFeedback}
              </div>
            )}
          </div>
        )}

        {/* Tips */}
        <div style={{ marginTop: 16, fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.7 }}>
          <strong style={{ color: 'var(--navy)' }}>Pro tips:</strong> {scenario.tips.join(' ')}
        </div>
      </div>
    </Card>
  )
}

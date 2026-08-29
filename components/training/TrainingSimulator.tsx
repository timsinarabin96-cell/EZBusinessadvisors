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
import { formatMoneyInput, moneyChange } from '@/lib/moneyInput'

interface ScenarioFinancials {
  net_profit: number
  owner_salary: number
  owner_perks: number
  one_time_expenses: number
  non_cash: number
  interest: number
  taxes: number
}

interface Scenario {
  id: string
  title: string
  industry: string
  location: string
  asking_hint: string | null
  financials: ScenarioFinancials
  multiple_band: [number, number]
  notes: string
}

interface Grade {
  score: number
  passed: boolean
  sdeCorrect: boolean
  sdeGiven: number
  sdeExpected: number
  multipleCorrect: boolean
  multipleGiven: number
  priceCorrect: boolean
  priceGiven: number
  priceExpected: number
  feedback: string[]
}

/**
 * Deal Simulator — learn-by-doing. Recast a synthetic business's SDE and pick
 * a defensible multiple; deterministic grading + optional AI coaching.
 */
export default function TrainingSimulator() {
  const toast = useToast()
  const [scenario, setScenario] = useState<Scenario | null>(null)
  const [loading, setLoading] = useState(true)
  const [sde, setSde] = useState('')
  const [multiple, setMultiple] = useState('')
  const [grading, setGrading] = useState(false)
  const [grade, setGrade] = useState<Grade | null>(null)
  const [aiFeedback, setAiFeedback] = useState<string | null>(null)

  useEffect(() => {
    authenticatedFetch('/api/training/simulator')
      .then((r) => r.json().catch(() => null))
      .then((j) => setScenario(j?.scenario || null))
      .catch(() => setScenario(null))
      .finally(() => setLoading(false))
  }, [])

  const submit = async () => {
    if (!scenario) return
    const sdeNum = Number(sde)
    const multNum = Number(multiple)
    if (!Number.isFinite(sdeNum) || sdeNum <= 0 || !Number.isFinite(multNum) || multNum <= 0) {
      toast('Enter a positive SDE and multiple', 'error')
      return
    }
    setGrading(true)
    setGrade(null)
    setAiFeedback(null)
    try {
      const res = await authenticatedFetch('/api/training/simulator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: scenario.id, sde: sdeNum, multiple: multNum }),
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

  if (loading) return <LoadingState label="Loading Deal Simulator..." />
  if (!scenario) return null

  const fmt = (n: number) => '$' + Math.round(n).toLocaleString()

  return (
    <Card style={{ marginBottom: 24 }}>
      <CardHeader title="🎮 Deal Simulator" subtitle="Recast the SDE, pick a multiple, propose a price — then get graded like a real deal" />
      <div style={{ padding: '8px 24px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
          <Badge color="#c9a84c">{scenario.industry}</Badge>
          <Badge color="#3b82f6">{scenario.location}</Badge>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>Typical multiples: {scenario.multiple_band[0]}–{scenario.multiple_band[1]}× SDE</span>
        </div>
        <h3 style={{ margin: '8px 0 14px', fontSize: 19, fontFamily: 'Georgia, serif' }}>{scenario.title}</h3>

        {/* Messy owner-bookkeeping P&L */}
        <div style={{ border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden', marginBottom: 16 }}>
          <div style={{ background: 'var(--navy)', color: '#fff', padding: '10px 16px', fontSize: 13.5, fontWeight: 800 }}>
            📊 Owner&apos;s bookkeeping (before recast)
          </div>
          <div style={{ padding: '10px 16px' }}>
            {([
              ['Net profit (per tax return)', scenario.financials.net_profit],
              ['Owner salary (payroll)', scenario.financials.owner_salary],
              ['Owner perks (vehicle, meals, travel)', scenario.financials.owner_perks],
              ['One-time expenses (repairs, legal)', scenario.financials.one_time_expenses],
              ['Non-cash (depreciation/amortization)', scenario.financials.non_cash],
              ['Interest expense', scenario.financials.interest],
              ['Taxes paid', scenario.financials.taxes],
            ] as [string, number][]).map(([label, value]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px dashed var(--line)', fontSize: 13.5 }}>
                <span style={{ color: 'var(--muted)' }}>{label}</span>
                <span style={{ fontWeight: 700 }}>{fmt(value)}</span>
              </div>
            ))}
          </div>
        </div>

        <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '0 0 16px', lineHeight: 1.6 }}>{scenario.notes}</p>

        {/* Answers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 14 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 700, color: '#555' }}>
            Recast SDE ($)
            <input value={formatMoneyInput(sde)} onChange={moneyChange(setSde)} placeholder="e.g. 154,200" inputMode="numeric" style={field} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 700, color: '#555' }}>
            Multiple (× SDE)
            <input value={multiple} onChange={(e) => setMultiple(e.target.value)} placeholder="e.g. 3.0" inputMode="decimal" style={field} />
          </label>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button onClick={submit} disabled={grading} style={{ padding: '11px 22px', borderRadius: 8, background: 'var(--gold)', color: 'var(--navy)', border: 'none', fontWeight: 800, fontSize: 14, cursor: grading ? 'wait' : 'pointer', width: '100%' }}>
              {grading ? 'Grading…' : 'Grade my answer'}
            </button>
          </div>
        </div>

        {/* Grade */}
        {grade && (
          <div style={{ border: `1px solid ${grade.passed ? '#c6e9d3' : '#f0dfc0'}`, background: grade.passed ? '#f0faf3' : '#fdf6e8', borderRadius: 10, padding: '16px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 26, fontWeight: 800, color: grade.passed ? '#15803d' : '#b45309' }}>{grade.score}/100</span>
              <Badge color={grade.passed ? '#22c55e' : '#f59e0b'}>{grade.passed ? 'Passed — great recast! 🎉' : 'Not quite — review the feedback'}</Badge>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {grade.feedback.map((f, i) => (
                <div key={i} style={{ fontSize: 13.5, lineHeight: 1.55 }}>{f}</div>
              ))}
            </div>
            {aiFeedback && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(0,0,0,0.08)', fontSize: 13.5, lineHeight: 1.6, color: 'var(--ink)' }}>
                <strong>🧑‍🏫 Coach:</strong> {aiFeedback}
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  )
}

const field: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid var(--line)',
  fontSize: 14,
  outline: 'none',
  background: '#fff',
  color: 'var(--ink)',
}

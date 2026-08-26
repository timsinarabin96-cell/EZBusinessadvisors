/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { fetchPublicProfessionals, PROFESSIONAL_LABELS, PROFESSIONAL_TYPES, type DealProfessional, type ProfessionalType } from '@/lib/professionals'
import { LoadingState } from '@/components/ui'

const TYPE_EMOJI: Record<ProfessionalType, string> = {
  lawyer: '⚖️',
  accountant: '🧮',
  qoe_agent: '🔍',
  lender: '🏦',
  consultant: '📈',
}

export default function ProfessionalsDirectoryPage() {
  const [pros, setPros] = useState<DealProfessional[]>([])
  const [type, setType] = useState<ProfessionalType | 'all'>('all')
  const [query, setQuery] = useState('')
  const [state, setState] = useState('')
  const [specialty, setSpecialty] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchPublicProfessionals({ type, query: query || undefined, state: state || undefined })
      .then((rows) => {
        setPros(specialty ? rows.filter((p) => (p.specialty || '').toLowerCase().includes(specialty.toLowerCase())) : rows)
      })
      .finally(() => setLoading(false))
  }, [type, query, state, specialty])

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: pros.length }
    for (const t of PROFESSIONAL_TYPES) c[t] = pros.filter((p) => p.professional_type === t).length
    return c
  }, [pros])

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: '60px 24px' }}>
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <div style={{ color: '#0e7490', fontSize: 13, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 800 }}>Professional Services Network</div>
        <h1 style={{ fontSize: 42, color: '#102a43', margin: '8px 0 12px' }}>The right experts for your deal</h1>
        <p style={{ color: '#666', fontSize: 15, maxWidth: 620, margin: '0 auto', lineHeight: 1.6 }}>
          Attorneys, CPAs, quality-of-earnings agents, SBA lenders, and consultants — vetted professionals who work with business buyers and sellers every day.
        </p>
      </div>

      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <Link href="/join?type=lawyer" style={{ display: 'inline-block', padding: '12px 24px', background: '#0e7490', color: '#fff', borderRadius: 10, fontWeight: 800, fontSize: 14, textDecoration: 'none', boxShadow: '0 8px 24px rgba(14,116,144,0.25)' }}>
          Are you an attorney, CPA, broker, or lender? Join the network →
        </Link>
        <div style={{ fontSize: 12, color: '#999', marginTop: 8 }}>Add your own profile with photo — free, and you control your listing</div>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 22 }}>
        <TypeTab active={type === 'all'} onClick={() => setType('all')} label={`All (${counts.all})`} />
        {PROFESSIONAL_TYPES.map((t) => (
          <TypeTab key={t} active={type === t} onClick={() => setType(t)} label={`${TYPE_EMOJI[t]} ${PROFESSIONAL_LABELS[t]} (${counts[t]})`} />
        ))}
      </div>

      <div style={{ display: 'flex', gap: 12, maxWidth: 640, margin: '0 auto 36px' }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, firm, specialty…"
          style={{ flex: 1, padding: '11px 14px', borderRadius: 8, border: '1px solid #dce6ef', fontSize: 14, fontFamily: 'Georgia, serif', outline: 'none' }}
        />
        <select
          value={specialty}
          onChange={(e) => setSpecialty(e.target.value)}
          style={{ padding: '11px 14px', borderRadius: 8, border: '1px solid #dce6ef', fontSize: 14, fontFamily: 'Georgia, serif', outline: 'none', background: '#fff' }}
        >
          <option value="">All specialties</option>
          {['M&A', 'Tax', 'Franchise', 'SBA lending', 'Commercial real estate', 'Estate planning', 'Underwriting', 'Due diligence', 'Business valuation', 'Financing'].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select
          value={state}
          onChange={(e) => setState(e.target.value)}
          style={{ padding: '11px 14px', borderRadius: 8, border: '1px solid #dce6ef', fontSize: 14, fontFamily: 'Georgia, serif', outline: 'none', background: '#fff' }}
        >
          <option value="">All states</option>
          {['CA','NY','TX','FL','IL','PA','OH','GA','NC','MI','NJ','VA','WA','AZ','MA','TN','CO','MD','MN'].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {loading ? <LoadingState /> : (
        pros.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#888', padding: 60, background: '#fff', border: '1px solid #ece8dc', borderRadius: 12 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🧭</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#1a1a2e' }}>No professionals match yet</div>
            <div style={{ fontSize: 14, marginTop: 8 }}>New professionals are added as brokers vouch for them. Check back soon.</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 24 }}>
            {pros.map((p) => (
              <Link key={p.id} href={`/marketplace/professionals/${p.id}`} style={{ textDecoration: 'none', display: 'block', background: '#fff', border: '1px solid #dce6ef', borderRadius: 16, padding: 26, boxShadow: '0 10px 35px rgba(16,42,67,0.07)', transition: 'transform .15s ease' }}>
                <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                  <div style={{ width: 64, height: 64, flex: '0 0 64px', borderRadius: 14, background: '#102a43', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>
                    {p.avatar_url ? <img src={p.avatar_url} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 14 }} /> : <span>{TYPE_EMOJI[p.professional_type]}</span>}
                  </div>
                  <div>
                    <div style={{ fontSize: 19, fontWeight: 800, color: '#102a43' }}>
                      {p.name}
                      {p.is_platform_verified && <span title="Platform verified" style={{ marginLeft: 6, fontSize: 14 }}>✅</span>}
                    </div>
                    <div style={{ fontSize: 13, color: '#0e7490', fontWeight: 700, marginTop: 3 }}>{PROFESSIONAL_LABELS[p.professional_type]}{p.firm ? ` · ${p.firm}` : ''}</div>
                    <div style={{ fontSize: 12, color: '#7b8794', marginTop: 3 }}>{p.specialty || 'General practice'}</div>
                  </div>
                </div>
                {p.bio && <p style={{ fontSize: 13.5, color: '#666', lineHeight: 1.6, marginTop: 14, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.bio}</p>}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
                  {p.industries.slice(0, 4).map((i) => <span key={i} style={{ padding: '5px 8px', background: '#edf6fa', color: '#155e75', borderRadius: 999, fontSize: 11.5, fontWeight: 700 }}>{i}</span>)}
                  {p.states_served.length > 0 && <span style={{ padding: '5px 8px', background: '#f5f3ec', color: '#7a6a3a', borderRadius: 999, fontSize: 11.5, fontWeight: 700 }}>{p.states_served.join(', ')}</span>}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 16 }}>
                  <MiniMetric label="Experience" value={p.years_experience ? `${p.years_experience}+ years` : 'N/A'} />
                  <MiniMetric label="Deals closed" value={p.deals_closed ? `${p.deals_closed}+` : 'Confidential'} />
                </div>
                {(p.rates || p.license_verified) && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                    {p.license_verified && <span style={{ padding: '4px 9px', background: '#e8f7ee', color: '#15803d', borderRadius: 999, fontSize: 11, fontWeight: 800 }}>✔ License verified</span>}
                    {p.rates && <span style={{ padding: '4px 9px', background: '#f5f3ec', color: '#7a6a3a', borderRadius: 999, fontSize: 11, fontWeight: 700 }}>{p.rates}</span>}
                  </div>
                )}
                <div style={{ marginTop: 14, color: '#0e7490', fontSize: 13, fontWeight: 800 }}>View profile →</div>
              </Link>
            ))}
          </div>
        )
      )}
    </div>
  )
}

function TypeTab({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} style={{
      padding: '9px 16px', borderRadius: 999, cursor: 'pointer', fontFamily: 'Georgia, serif', fontSize: 13.5, fontWeight: 700,
      border: active ? '1px solid #102a43' : '1px solid #dce6ef', background: active ? '#102a43' : '#fff',
      color: active ? '#fff' : '#102a43',
    }}>
      {label}
    </button>
  )
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return <div style={{ padding: 10, borderRadius: 9, background: '#f5f8fb' }}><div style={{ fontSize: 10.5, color: '#7b8794', textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</div><div style={{ fontSize: 12.5, color: '#102a43', fontWeight: 800, marginTop: 3 }}>{value}</div></div>
}

'use client'

import { useState } from 'react'
import { LeadKind, LeadStatus, UnifiedLead, LEAD_STATUSES } from '@/lib/leads2'

interface LeadFormModalProps {
  lead: UnifiedLead | null
  mode: LeadKind
  onClose: () => void
  onSubmit: (input: { kind: LeadKind; business_name?: string; email?: string; phone?: string; status?: LeadStatus }) => Promise<void>
}

export default function LeadFormModal({ lead, mode: initialMode, onClose, onSubmit }: LeadFormModalProps) {
  const [kind, setKind] = useState<LeadKind>(lead?.kind || initialMode)
  const [businessName, setBusinessName] = useState(lead?.business_name || '')
  const [email, setEmail] = useState(lead?.email || '')
  const [phone, setPhone] = useState(lead?.phone || '')
  const [status, setStatus] = useState<LeadStatus>((lead?.status as LeadStatus) || 'new')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (kind === 'seller' && !businessName.trim()) { setError('Business name is required for seller leads'); return }
    setSubmitting(true)
    setError('')
    try {
      await onSubmit({
        kind,
        business_name: kind === 'seller' ? businessName : undefined,
        email,
        phone,
        status,
      })
    } catch (err: any) {
      setError(err.message || 'Failed to save lead')
      setSubmitting(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(26,26,46,0.55)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 20px', overflowY: 'auto' }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 12, maxWidth: 500, width: '100%', boxShadow: '0 20px 60px rgba(26,26,46,0.35)', padding: 26 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 20, color: 'var(--navy)' }}>{lead ? 'Edit Lead' : 'Add Lead'}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--muted)' }}>✕</button>
        </div>

        {error && <div style={{ background: '#fee2e2', color: '#b91c1c', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 14 }}>{error}</div>}

        <form onSubmit={handleSubmit}>
          {/* Kind */}
          <div style={{ marginBottom: 16 }}>
            <label className="label">Lead Type</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {(['seller', 'buyer'] as LeadKind[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  style={{
                    flex: 1, padding: '11px', borderRadius: 8, cursor: 'pointer', fontFamily: 'Georgia, serif', fontSize: 14, fontWeight: 700,
                    border: kind === k ? '2px solid var(--gold-dark)' : '1px solid var(--line)',
                    background: kind === k ? 'rgba(201,168,76,0.15)' : '#fff',
                    color: kind === k ? 'var(--gold-dark)' : 'var(--muted)',
                  }}
                >
                  {k === 'seller' ? '🏢 Seller' : '👤 Buyer'}
                </button>
              ))}
            </div>
          </div>

          {kind === 'seller' && (
            <div style={{ marginBottom: 16 }}>
              <label className="label">Business Name *</label>
              <input className="input" value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="e.g. Acme Services" />
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <label className="label">Email</label>
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@example.com" />
            </div>
            <div>
              <label className="label">Phone</label>
              <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 123-4567" />
            </div>
          </div>

          <div style={{ marginBottom: 20 }}>
            <label className="label">Status</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {LEAD_STATUSES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setStatus(s.id)}
                  style={{
                    padding: '6px 12px', borderRadius: 999, cursor: 'pointer', fontFamily: 'Georgia, serif', fontSize: 12.5, fontWeight: 600,
                    border: status === s.id ? `2px solid ${s.color}` : '1px solid var(--line)',
                    background: status === s.id ? s.color + '1a' : '#fff',
                    color: status === s.id ? s.color : 'var(--muted)',
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Saving...' : lead ? 'Save Changes' : 'Add Lead'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

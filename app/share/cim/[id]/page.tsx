/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { CimContent } from '@/lib/cim'
import { LoadingState } from '@/components/ui'

/** Public CIM share view — gated: only NDA-signed buyers (or the broker) can open it. */
export default function ShareCimPage() {
  const params = useParams()
  const cimId = String(params?.id || '')
  const [content, setContent] = useState<CimContent | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [email, setEmail] = useState('')
  const [checking, setChecking] = useState(false)

  const checkAccess = async (em?: string) => {
    const target = (em ?? email).trim().toLowerCase()
    setChecking(true)
    setError('')
    try {
      const res = await fetch('/api/share/cim-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cimId, email: target }),
      })
      const j = await res.json().catch(() => ({ ok: false, error: 'Server error' }))
      if (!res.ok || !j.ok) {
        setError(j.error || 'Access denied')
        setLoading(false)
        return
      }
      setContent(j.cim?.content_json || null)
    } catch (e: any) {
      setError(e.message || 'Could not verify access')
    } finally {
      setChecking(false)
      setLoading(false)
    }
  }

  useEffect(() => {
    // Pre-fill from ?email= (personalized broker link) and auto-verify.
    const q = new URLSearchParams(window.location.search)
    const e = q.get('email')
    if (e) {
      setEmail(e)
      checkAccess(e)
    } else {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cimId])

  if (loading) return <LoadingState label="Loading shared CIM..." />

  if (error || !content) {
    return (
      <div style={{ minHeight: '100vh', background: '#1a1a2e', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', padding: 40 }}>
        <div style={{ textAlign: 'center', maxWidth: 520 }}>
          <div style={{ fontFamily: 'Georgia, serif', fontSize: 40, color: '#c9a84c' }}>CONCORD</div>
          <div style={{ marginTop: 18, fontSize: 16, color: 'rgba(255,255,255,0.9)', lineHeight: 1.6 }}>
            🔒 Confidential — NDA required
          </div>
          <div style={{ marginTop: 8, fontSize: 13.5, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6 }}>
            This CIM is only shared with buyers who have signed the NDA for this deal.
            Enter the email you used when signing.
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 24, justifyContent: 'center' }}>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && checkAccess()}
              placeholder="you@email.com"
              style={{ flex: 1, maxWidth: 300, padding: '12px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: 14, fontFamily: 'inherit' }}
            />
            <button
              onClick={() => checkAccess()}
              disabled={checking || !email.trim()}
              style={{ padding: '12px 24px', borderRadius: 8, background: '#c9a84c', color: '#0f1023', border: 'none', fontWeight: 800, fontSize: 13.5, cursor: checking || !email.trim() ? 'not-allowed' : 'pointer', opacity: checking || !email.trim() ? 0.55 : 1 }}
            >
              {checking ? 'Verifying…' : 'View CIM'}
            </button>
          </div>
          {error && (
            <div style={{ marginTop: 16, fontSize: 13, color: '#fca5a5', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: 8, padding: '10px 14px', lineHeight: 1.5 }}>
              {error}
            </div>
          )}
          <div style={{ marginTop: 22, color: 'rgba(255,255,255,0.45)', fontSize: 12.5, lineHeight: 1.6 }}>
            Haven&apos;t signed yet? Your broker emails the NDA — once you sign, this CIM unlocks automatically.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      <div style={{ background: '#1a1a2e', color: '#fff', padding: '14px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontFamily: 'Georgia, serif', fontWeight: 700, color: '#c9a84c', letterSpacing: 1 }}>CONCORD</div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', letterSpacing: 2 }}>CONFIDENTIAL</div>
      </div>
      <div style={{ maxWidth: 820, margin: '40px auto' }}>
        {/* Cover */}
        <div style={{ background: '#1a1a2e', color: '#fff', padding: '90px 60px', position: 'relative', borderRadius: 6, boxShadow: '0 12px 40px rgba(26,26,46,0.2)' }}>
          <div style={{ height: 2.5, background: 'var(--gold)', position: 'absolute', top: '46%', left: 0, right: 0 }} />
          <h1 style={{ color: '#c9a84c', fontSize: 34, margin: 0, fontFamily: 'Georgia, serif' }}>{content.title}</h1>
          <div style={{ color: '#fff', fontSize: 18, marginTop: 14 }}>{content.subtitle}</div>
          <div style={{ color: '#c9a84c', fontSize: 11, letterSpacing: 3, marginTop: 26 }}>CONFIDENTIAL INFORMATION MEMORANDUM</div>
          <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 18 }}>Prepared: {content.generatedAt}</div>
        </div>

        {/* TOC */}
        <div style={{ background: '#fff', padding: '40px 60px', border: '1px solid var(--line)' }}>
          <div style={{ textTransform: 'uppercase', fontSize: 12, letterSpacing: 2, color: '#c9a84c', fontWeight: 700 }}>Table of Contents</div>
          <hr style={{ border: 'none', borderTop: '2px solid #c9a84c', margin: '12px 0 18px' }} />
          {content.sections.map((s) => (
            <div key={s.id} style={{ padding: '9px 0', borderBottom: '1px solid #f0ecdf', color: '#1a1a2e', fontWeight: 600, fontSize: 14 }}>
              {s.title}
            </div>
          ))}
        </div>

        {/* Sections */}
        {content.sections.map((section) => (
          <div key={section.id} style={{ background: '#fff', padding: '40px 60px', border: '1px solid var(--line)', borderTop: 'none' }}>
            <div style={{ background: '#1a1a2e', color: '#c9a84c', padding: '14px 20px', borderRadius: 4, fontSize: 16, fontWeight: 700, marginBottom: 20 }}>
              {section.title}
            </div>
            {section.subsections.map((sub, i) => (
              <div key={i} style={{ marginBottom: 18 }}>
                <h3 style={{ fontSize: 14, color: '#1a1a2e', margin: '0 0 6px', fontFamily: 'Georgia, serif' }}>{sub.heading}</h3>
                {sub.body.map((line, j) => (
                  <p key={j} style={{ margin: '6px 0', fontSize: 13.5, lineHeight: 1.55, color: '#444' }}>{line}</p>
                ))}
              </div>
            ))}
          </div>
        ))}

        {/* Footer */}
        <div style={{ background: '#faf9f4', padding: '40px 60px', border: '1px solid var(--line)', borderTop: 'none', borderRadius: '0 0 6px 6px' }}>
          <div style={{ textTransform: 'uppercase', fontSize: 12, letterSpacing: 2, color: '#c9a84c', fontWeight: 700 }}>Confidentiality</div>
          <hr style={{ border: 'none', borderTop: '2px solid #c9a84c', margin: '12px 0' }} />
          <p style={{ fontSize: 12, color: '#777', lineHeight: 1.6 }}>
            This document is confidential and proprietary to the seller and its advisor. It is provided solely for evaluating a
            potential transaction and may not be reproduced or distributed without prior written consent. This memorandum does not
            constitute an offer to sell.
          </p>
        </div>
      </div>
    </div>
  )
}

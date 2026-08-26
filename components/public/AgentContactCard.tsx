/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import type { PublicAgentInfo } from '@/lib/publicListingMeta'

// =============================================================================
// AgentContactCard — "who to call / talk to / email" for a listing.
// Rendered on the public listing detail + flyer. Photo, name, title, phone,
// email with one-tap actions. Falls back gracefully when no agent is assigned.
// =============================================================================

export default function AgentContactCard({ agent }: { agent: PublicAgentInfo | null }) {
  if (!agent) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px',
        background: '#faf9f4', border: '1px solid #ece8dc', borderRadius: 12,
      }}>
        <div style={{
          width: 52, height: 52, flex: '0 0 52px', borderRadius: '50%', background: '#1a1a2e',
          color: '#c9a84c', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 20, fontWeight: 800,
        }}>🤝</div>
        <div>
          <div style={{ fontSize: 13, color: '#8a6d1a', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Talk with an agent</div>
          <div style={{ fontSize: 14, color: '#555', marginTop: 2 }}>A licensed broker will walk you through this opportunity.</div>
          <a href="/contact" style={{ color: '#1a1a2e', fontWeight: 700, fontSize: 13, display: 'inline-block', marginTop: 6 }}>Contact us →</a>
        </div>
      </div>
    )
  }

  const initials = agent.name.split(' ').map((p) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px',
      background: '#faf9f4', border: '1px solid #ece8dc', borderRadius: 12, flexWrap: 'wrap',
    }}>
      {agent.photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={agent.photo}
          alt={agent.name}
          style={{ width: 52, height: 52, flex: '0 0 52px', borderRadius: '50%', objectFit: 'cover', border: '2px solid #c9a84c' }}
        />
      ) : (
        <div style={{
          width: 52, height: 52, flex: '0 0 52px', borderRadius: '50%', background: '#1a1a2e',
          color: '#c9a84c', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 18, fontWeight: 800,
        }}>{initials || '🤝'}</div>
      )}
      <div style={{ flex: 1, minWidth: 160 }}>
        <div style={{ fontSize: 11, color: '#8a6d1a', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Your Broker</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#1a1a2e', fontFamily: 'Georgia, serif' }}>{agent.name}</div>
        {agent.bio && <div style={{ fontSize: 12.5, color: '#888', marginTop: 2, lineHeight: 1.5 }}>{agent.bio.slice(0, 120)}</div>}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {agent.phone && (
          <a
            href={`tel:${agent.phone.replace(/[^+\d]/g, '')}`}
            style={{ padding: '9px 14px', borderRadius: 8, background: '#1a1a2e', color: '#fff', textDecoration: 'none', fontWeight: 700, fontSize: 12.5 }}
          >
            📞 Call
          </a>
        )}
        {agent.email && (
          <a
            href={`mailto:${agent.email}?subject=${encodeURIComponent('Inquiry about a business listing')}`}
            style={{ padding: '9px 14px', borderRadius: 8, background: '#c9a84c', color: '#1a1a2e', textDecoration: 'none', fontWeight: 800, fontSize: 12.5 }}
          >
            ✉️ Email
          </a>
        )}
      </div>
    </div>
  )
}

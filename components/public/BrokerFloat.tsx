/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useState } from 'react'
import type { PublicAgentInfo } from '@/lib/publicListingMeta'
import AgentContactCard from '@/components/public/AgentContactCard'

// =============================================================================
// BrokerFloat — floating broker popup (bottom of page, like the AI assistant).
// A circular button with the broker's picture; click → full contact popup with
// photo, phone, email, website and scan-to-save QR. Works for every agent
// because it renders whatever the server passed for the listing's broker.
// =============================================================================

export default function BrokerFloat({ agent }: { agent: PublicAgentInfo | null }) {
  const [open, setOpen] = useState(false)
  if (!agent) return null

  const initials = agent.name.split(' ').map((p) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()

  return (
    <>
      {/* Floating button — stacked above the AI guide bubble */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={`Contact your broker ${agent.name}`}
        title="Talk to your broker"
        style={{
          position: 'fixed', bottom: 92, right: 22, zIndex: 9997,
          width: 58, height: 58, borderRadius: '50%', border: '2px solid #c9a84c', cursor: 'pointer',
          background: '#1a1a2e', color: '#fff', padding: 0, overflow: 'hidden',
          boxShadow: '0 10px 30px rgba(16,42,67,0.45)', display: 'grid', placeItems: 'center',
          transition: 'transform .15s ease',
        }}
      >
        {agent.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={agent.photo} alt={agent.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <span style={{ fontSize: 17, fontWeight: 800, color: '#c9a84c', fontFamily: 'Georgia, serif' }}>
            {initials || '🤝'}
          </span>
        )}
        {!open && (
          <span style={{ position: 'absolute', bottom: -2, right: -2, width: 14, height: 14, borderRadius: '50%', background: '#1e7e34', border: '2px solid #fff' }} />
        )}
      </button>

      {/* Popup */}
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 9996, background: 'transparent' }} onClick={() => setOpen(false)} />
          <div style={{
            position: 'fixed', bottom: 162, right: 22, zIndex: 9998,
            width: 'min(360px, calc(100vw - 44px))',
            maxHeight: 'calc(100vh - 190px)', overflowY: 'auto',
            background: '#fff', borderRadius: 16, boxShadow: '0 24px 70px rgba(16,42,67,0.3)',
            border: '1px solid #ece8dc', padding: 14,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: '#8a6d1a', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Your broker</div>
              <button onClick={() => setOpen(false)} aria-label="Close" style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#888', lineHeight: 1 }}>✕</button>
            </div>
            <AgentContactCard agent={agent} />
          </div>
        </>
      )}
    </>
  )
}

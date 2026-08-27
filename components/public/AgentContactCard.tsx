/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import type { PublicAgentInfo } from '@/lib/publicListingMeta'
import AgentQrCode from '@/components/public/AgentQrCode'

// =============================================================================
// AgentContactCard — "who to call / talk to / email" for a listing.
// Rendered on the public listing detail + flyer. Photo, name, title, phone,
// email with one-tap actions, plus a scan-to-save vCard QR code carrying the
// broker's full contact + website. Falls back to agency contact info when the
// broker hasn't filled in their own profile, so every agent card is complete.
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
  // Broker-level contact, falling back to agency so the card is never empty.
  const phone = agent.phone || agent.agencyPhone || null
  const email = agent.email || agent.agencyEmail || null
  const website = agent.agencyWebsite || null
  const agencyName = agent.agencyName || null
  const telHref = phone ? `tel:${String(phone).replace(/[^\d+]/g, '')}` : null
  const displayPhone = phone ? String(phone).replace(/(\d{3})(\d{3})(\d{4})$/, '($1) $2-$3') : null

  return (
    <div style={{
      padding: '18px 20px',
      background: '#faf9f4', border: '1px solid #ece8dc', borderRadius: 12,
    }}>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
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
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontSize: 11, color: '#8a6d1a', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            {agencyName ? `${agencyName} · Your Broker` : 'Your Broker'}
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#1a1a2e', fontFamily: 'Georgia, serif' }}>{agent.name}</div>
          {agent.bio && <div style={{ fontSize: 12.5, color: '#888', marginTop: 2, lineHeight: 1.5 }}>{agent.bio.slice(0, 120)}</div>}
          {/* Full contact info — phone + email always visible, never just buttons. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 8, fontSize: 13 }}>
            {displayPhone && (
              <a href={telHref || undefined} style={{ color: '#1a1a2e', textDecoration: 'none', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: '#8a6d1a' }}>📞</span> {displayPhone}
              </a>
            )}
            {email && (
              <a href={`mailto:${email}?subject=${encodeURIComponent('Inquiry about a business listing')}`} style={{ color: '#1a1a2e', textDecoration: 'none', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6, wordBreak: 'break-all' }}>
                <span style={{ color: '#8a6d1a' }}>✉️</span> {email}
              </a>
            )}
            {website && (
              <a href={website} target="_blank" rel="noopener noreferrer" style={{ color: '#0e7490', textDecoration: 'none', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6, wordBreak: 'break-all' }}>
                <span style={{ color: '#8a6d1a' }}>🌐</span> {website.replace(/^https?:\/\//, '')}
              </a>
            )}
          </div>
        </div>
        {/* One-tap action buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {telHref && (
            <a
              href={telHref}
              style={{ padding: '9px 16px', borderRadius: 8, background: '#1a1a2e', color: '#fff', textDecoration: 'none', fontWeight: 800, fontSize: 12.5, textAlign: 'center' }}
            >
              📞 Call
            </a>
          )}
          {email && (
            <a
              href={`mailto:${email}?subject=${encodeURIComponent('Inquiry about a business listing')}`}
              style={{ padding: '9px 16px', borderRadius: 8, background: '#c9a84c', color: '#1a1a2e', textDecoration: 'none', fontWeight: 800, fontSize: 12.5, textAlign: 'center' }}
            >
              ✉️ Email
            </a>
          )}
        </div>
      </div>
      {/* Scan-to-save QR — vCard with phone, email, website; works for every agent. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 16, paddingTop: 14, borderTop: '1px dashed #d8d2c2', flexWrap: 'wrap' }}>
        <AgentQrCode name={agent.name} phone={phone} email={email} website={website} agency={agencyName} />
        <div style={{ flex: 1, minWidth: 180, fontSize: 12.5, color: '#555', lineHeight: 1.6 }}>
          <div style={{ fontWeight: 800, color: '#1a1a2e', marginBottom: 3 }}>Save our contact — scan the code</div>
          Point your camera at the QR code to instantly save our phone number, email, and website. Reach us anytime for questions about this opportunity — or future ones.
        </div>
      </div>
    </div>
  )
}

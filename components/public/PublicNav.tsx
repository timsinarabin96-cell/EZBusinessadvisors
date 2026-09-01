/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import Link from 'next/link'
import { useState } from 'react'

interface BrandProps {
  name: string
  logo?: string | null
  primary?: string
  accent?: string
}

/** Public-facing header for the marketplace (no auth shell).
 *  White-label aware: when an agency custom domain is detected, the brand
 *  block (logo/name/colors) renders the agency's identity instead of CONCORD. */
export default function PublicNav({ brand }: { brand?: BrandProps }) {
  const [open, setOpen] = useState(false)
  const primary = brand?.primary || '#1a1a2e'
  const accent = brand?.accent || '#c9a84c'
  const name = brand?.name || 'CONCORD'
  return (
    <header className="nav-glass" style={{ position: 'sticky', top: 0, zIndex: 50, background: 'rgba(255,255,255,0.82)' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 72 }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
          {/* Boss rule: agency logos render ONLY in the CRM's documents — the
              public website never shows logo images, just the agency name. */}
          {brand ? (
            <>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, color: primary, letterSpacing: '-0.01em' }}>{name}</span>
              <span style={{ fontSize: 10, letterSpacing: '0.25em', color: accent, textTransform: 'uppercase', fontWeight: 700 }}>Markets</span>
            </>
          ) : (
            // Default platform brand: the CONCORD crest lockup (gold on light).
            <img
              src="/brand/concord-header-lockup.png"
              alt="Concord Deal Platform"
              style={{ height: 52, width: 'auto', display: 'block' }}
            />
          )}
        </Link>

        {/* Desktop nav — full advanced link set in a two-tier layout. The
            utility row (second tier) keeps every marketplace link visible on
            desktop; the hamburger only appears on phones/tablets. */}
        <nav className="publicnav-links" style={{ flexDirection: 'column', alignItems: 'flex-end', gap: 0 }}>
          <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
            <NavLink href="/marketplace/listings">Buy a Business</NavLink>
            <NavLink href="/marketplace/sell">Sell a Business</NavLink>
            <NavLink href="/brokerai">BrokerAI</NavLink>
            <NavLink href="/marketplace/brokers">Our Brokers</NavLink>
            <NavLink href="/marketplace/financing">Financing</NavLink>
            <NavLink href="/marketplace/professionals">Professionals</NavLink>
            <NavLink href="/marketplace/qualify">Pre-Qualify</NavLink>
            <Link
              href="/auth"
              style={{ background: 'linear-gradient(135deg,#f0d98c,#c9a84c 55%,#b08d35)', color: '#141a2e', padding: '10px 22px', borderRadius: 12, textDecoration: 'none', fontWeight: 800, fontSize: 14, fontFamily: 'var(--font-sans)', whiteSpace: 'nowrap', boxShadow: '0 4px 16px rgba(201,168,76,0.35)' }}
            >
              Broker Login
            </Link>
          </div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginTop: 8, paddingTop: 7, borderTop: '1px solid #f0ede4' }}>
            {[
              ['/marketplace/comps', 'Sale Comps'],
              ['/marketplace/sold', 'Recently Sold'],
              ['/marketplace/pulse', 'Market Pulse'],
              ['/marketplace/compare', '⚖ Compare'],
              ['/marketplace/favorites', '♥ Saved'],
              ['/marketplace/trust', 'Trust Center'],
              ['/marketplace/insights', 'Insights'],
              ['/contact', 'Contact'],
            ].map(([href, label]) => (
              <NavLink key={href} href={href} small>{label}</NavLink>
            ))}
          </div>
        </nav>

        <button
          onClick={() => setOpen(!open)}
          className="publicnav-toggle"
          aria-label={open ? 'Close menu' : 'Open menu'}
          style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: '#1a1a2e' }}
        >
          {open ? '✕' : '☰'}
        </button>
      </div>
      {open && (
        <nav style={{ padding: '12px 24px', display: 'flex', flexDirection: 'column', gap: 12, borderTop: '1px solid #ece8dc', background: '#fff' }}>
          <NavLink href="/marketplace/listings" onClick={() => setOpen(false)}>Buy a Business</NavLink>
          <NavLink href="/marketplace/sell" onClick={() => setOpen(false)}>Sell a Business</NavLink>
          <NavLink href="/brokerai" onClick={() => setOpen(false)}>BrokerAI</NavLink>
          <NavLink href="/marketplace/brokers" onClick={() => setOpen(false)}>Our Brokers</NavLink>
          <NavLink href="/marketplace/financing" onClick={() => setOpen(false)}>Financing</NavLink>
          <NavLink href="/marketplace/qualify" onClick={() => setOpen(false)}>Pre-Qualify</NavLink>
          <NavLink href="/marketplace/professionals" onClick={() => setOpen(false)}>Professionals</NavLink>
          <NavLink href="/marketplace/comps" onClick={() => setOpen(false)}>Sale Comps</NavLink>
          <NavLink href="/marketplace/sold" onClick={() => setOpen(false)}>Recently Sold</NavLink>
          <NavLink href="/marketplace/favorites" onClick={() => setOpen(false)}>♥ Saved</NavLink>
          <NavLink href="/marketplace/compare" onClick={() => setOpen(false)}>⚖ Compare</NavLink>
          <NavLink href="/about" onClick={() => setOpen(false)}>About</NavLink>
          <NavLink href="/contact" onClick={() => setOpen(false)}>Contact</NavLink>
          <Link
            href="/auth"
            onClick={() => setOpen(false)}
            style={{ background: '#1a1a2e', color: '#fff', padding: '10px 16px', borderRadius: 6, textDecoration: 'none', fontWeight: 700, fontSize: 14, fontFamily: 'Georgia, serif', textAlign: 'center' }}
          >
            Broker Login
          </Link>
        </nav>
      )}
    </header>
  )
}

function NavLink({ href, children, arrow, onClick, small }: { href: string; children: React.ReactNode; arrow?: boolean; onClick?: () => void; small?: boolean }) {
  return (
    <Link href={href} onClick={onClick} style={{ color: '#1a1a2e', textDecoration: 'none', fontSize: small ? 12 : 14.5, fontWeight: small ? 500 : 600, fontFamily: 'var(--font-sans)', display: 'inline-flex', alignItems: 'center', gap: 6, opacity: small ? 0.72 : 1 }}>
      {children} {arrow && <span style={{ color: '#c9a84c' }}>→</span>}
    </Link>
  )
}

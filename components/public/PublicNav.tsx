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
    <header style={{ position: 'sticky', top: 0, zIndex: 50, background: '#ffffff', borderBottom: '1px solid #ece8dc', boxShadow: '0 1px 8px rgba(26,26,46,0.06)' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 72 }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
          {/* Boss rule: agency logos render ONLY in the CRM's documents — the
              public website never shows logo images, just the agency name. */}
          <span style={{ fontFamily: 'Georgia, serif', fontSize: 22, fontWeight: 800, color: primary, letterSpacing: 0.5 }}>{name}</span>
          {/* Boss rule: agency domains render their own brand; the default
              platform brand reads "DEAL PLATFORM" — one name everywhere. */}
          <span style={{ fontSize: 10, letterSpacing: '0.25em', color: accent, textTransform: 'uppercase' }}>{brand ? 'Markets' : 'Deal Platform'}</span>
        </Link>

        {/* Desktop nav — hidden under 860px via .publicnav-links (an inline
            display:none can't be overridden by a media query, so visibility
            for both this and the toggle button below is CSS-class driven).
            Kept to the core links so the row never overflows at common
            widths; the full link set lives in the hamburger menu. */}
        <nav className="publicnav-links" style={{ gap: 20, alignItems: 'center' }}>
          <NavLink href="/marketplace/listings">Buy a Business</NavLink>
          <NavLink href="/marketplace/sell">Sell a Business</NavLink>
          <NavLink href="/brokerai">BrokerAI</NavLink>
          <NavLink href="/marketplace/brokers">Our Brokers</NavLink>
          <NavLink href="/marketplace/financing">Financing</NavLink>
          <NavLink href="/about">About</NavLink>
          <Link
            href="/auth"
            style={{ background: '#1a1a2e', color: '#fff', padding: '10px 20px', borderRadius: 6, textDecoration: 'none', fontWeight: 700, fontSize: 14, fontFamily: 'Georgia, serif', whiteSpace: 'nowrap' }}
          >
            Broker Login
          </Link>
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

function NavLink({ href, children, arrow, onClick }: { href: string; children: React.ReactNode; arrow?: boolean; onClick?: () => void }) {
  return (
    <Link href={href} onClick={onClick} style={{ color: '#1a1a2e', textDecoration: 'none', fontSize: 14.5, fontWeight: 600, fontFamily: 'Georgia, serif', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {children} {arrow && <span style={{ color: '#c9a84c' }}>→</span>}
    </Link>
  )
}

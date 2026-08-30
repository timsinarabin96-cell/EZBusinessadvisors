/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import Link from 'next/link'
import NewsletterSignup from './NewsletterSignup'

/** Public footer — dark glass with trust badges (billion-dollar pass). */
export default function PublicFooter() {
  return (
    <footer style={{ background: 'linear-gradient(180deg,#0b1020 0%,#0e1530 55%,#0a0d1a 100%)', color: '#fff', marginTop: 80, borderTop: '1px solid rgba(201,168,76,0.25)', position: 'relative' }}>
      {/* Top glow line */}
      <div style={{ height: 1, background: 'linear-gradient(90deg,transparent,rgba(201,168,76,0.6),transparent)' }} />

      {/* Trust badges strip */}
      <div style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '22px 24px', display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
          {[
            ['🔒', 'NDA-Protected'],
            ['🏅', 'Vetted Listings'],
            ['✅', 'Licensed Brokers'],
            ['🔍', 'Verified Buyers'],
            ['📊', 'Recast Financials'],
            ['🤝', 'Qualified Leads'],
          ].map(([e, t]) => (
            <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 999, padding: '7px 14px', fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(10px)' }}>
              <span style={{ fontSize: 14 }}>{e}</span> {t}
            </span>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '48px 24px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(180px, 100%), 1fr))', gap: 32 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 20 }}>🌒</span>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, letterSpacing: '-0.01em' }}>CONCORD</span>
          </div>
          <div style={{ fontSize: 10, letterSpacing: '0.25em', color: '#c9a84c', textTransform: 'uppercase', marginTop: 2, fontWeight: 700 }}>Deal Platform</div>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6, marginTop: 12, maxWidth: 260 }}>
            Confidential business brokerage for buyers and sellers of established companies.
          </p>
          <div style={{ marginTop: 16 }}>
            <NewsletterSignup />
          </div>
          {/* Social / contact emoji row */}
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            {[['📧', '/contact'], ['💼', '/marketplace/brokers'], ['⚖️', '/marketplace/trust'], ['📰', '/marketplace/insights']].map(([e, href]) => (
              <Link key={href} href={href} title={href} style={{ width: 38, height: 38, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 12, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', fontSize: 17, textDecoration: 'none', transition: 'transform .15s ease, background .15s ease' }}
                onMouseEnter={(ev) => { ev.currentTarget.style.transform = 'translateY(-3px)'; ev.currentTarget.style.background = 'rgba(201,168,76,0.18)' }}
                onMouseLeave={(ev) => { ev.currentTarget.style.transform = 'translateY(0)'; ev.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}>
                {e}
              </Link>
            ))}
          </div>
        </div>

        <FooterCol title="For Buyers" links={[['Browse Listings', '/marketplace/listings'], ['How It Works', '/marketplace/buy'], ['Buyer Questionnaire', '/marketplace/qualify'], ['Acquisition Financing', '/marketplace/financing'], ['Sale Comps', '/marketplace/comps'], ['Recently Sold', '/marketplace/sold'], ['Market Pulse', '/marketplace/pulse']]} />
        <FooterCol title="For Sellers" links={[['Sell a Business', '/marketplace/sell'], ['Business Valuation', '/marketplace/sell'], ['Reasons to Sell', '/marketplace/sell'], ['Listing Your Business', '/marketplace/sell'], ['Seller Guides', '/marketplace/guides/sellers']]} />
        <FooterCol title="Company" links={[['Our Brokers', '/marketplace/brokers'], ['Certified Intermediaries', '/marketplace/certified'], ['White-Label Platform', '/platform'], ['About Concord', '/about'], ['Trust Center', '/marketplace/trust'], ['Insights & Guides', '/marketplace/insights'], ['Reviews', '/marketplace/reviews'], ['Careers', '/marketplace/careers'], ['Pricing', '/pricing'], ['Contact', '/contact']]} />
      </div>
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '18px 24px', fontSize: 12, color: 'rgba(255,255,255,0.4)', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <span>© {new Date().getFullYear()} Concord Deal Platform. All rights reserved.</span>
          <span>🔒 Confidential. Business brokerage services provided by licensed professionals.</span>
        </div>
      </div>
    </footer>
  )
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <div style={{ fontSize: 13, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#c9a84c', fontWeight: 700, marginBottom: 14 }}>{title}</div>
      {links.map(([label, href]) => (
        <Link key={label} href={href} style={{ display: 'block', color: 'rgba(255,255,255,0.7)', textDecoration: 'none', fontSize: 14, marginBottom: 10, fontFamily: 'var(--font-sans)' }}>
          {label}
        </Link>
      ))}
    </div>
  )
}

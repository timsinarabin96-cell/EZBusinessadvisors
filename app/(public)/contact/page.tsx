/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import type { Metadata } from 'next'
import ContactForm from '@/components/public/ContactForm'

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://ezbusinessadvisors.vercel.app'

export const metadata: Metadata = {
  title: 'Contact Us',
  description: 'Get in touch with Concord about buying or selling a business.',
  alternates: { canonical: `${BASE}/contact` },
}

export default function ContactPage() {
  return (
    <div>
      {/* Premium hero */}
      <section style={{ background: 'linear-gradient(160deg,#0b1020 0%,#101a38 42%,#0f2a52 100%)', color: '#fff', padding: '72px 24px 56px', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
        <div className="hero-aurora" />
        <div style={{ position: 'relative' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, background: 'rgba(201,168,76,0.12)', border: '1px solid rgba(201,168,76,0.35)', borderRadius: 999, padding: '7px 16px', fontSize: 12.5, fontWeight: 700, letterSpacing: '0.04em', color: '#f0d98c', marginBottom: 16 }}>
            💬 Contact
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(34px, 5vw, 48px)', margin: '0 0 12px', color: '#fff', letterSpacing: '-0.03em' }}>
            Get in <span className="grad-gold">Touch</span>
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.75)', maxWidth: 600, margin: '0 auto', fontSize: 15.5, lineHeight: 1.65 }}>
            Whether you're exploring a sale, evaluating an acquisition, or just have a question — reach out and a broker will respond promptly. All inquiries are treated confidentially.
          </p>
        </div>
      </section>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '48px 24px' }}>
        <ContactForm />
      </div>
    </div>
  )
}

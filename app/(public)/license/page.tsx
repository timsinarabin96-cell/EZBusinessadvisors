import type { Metadata } from 'next'
import Link from 'next/link'
import { CRM_LICENSE } from '@/lib/billing'

// /license — public license purchase page. Funnels brokerage owners into
// agency signup → billing, where the real Stripe license checkout lives.

export const metadata: Metadata = {
  title: 'Own the CRM Platform — One-Time License | Concord',
  description: `Run the full Concord brokerage operating system on your own domain for a one-time $${CRM_LICENSE.setupFee.toLocaleString()} setup fee + $${CRM_LICENSE.monthly}/month. White-label branding, isolated marketplace, your own AI keys.`,
  alternates: { canonical: '/license' },
  openGraph: {
    title: 'Own the CRM Platform — Concord',
    description: 'Your brand, your domain, your keys. One-time license + monthly platform fee.',
    url: '/license',
    type: 'website',
  },
}

const features = [
  ['🖥️', 'Full CRM system', 'Deal pipeline, leads, CIM/BOV generation, financial recasting — the complete brokerage operating system.'],
  ['🤖', 'AI agents', 'DeepSeek/Claude via your own API keys. Listing copilot, call summaries, data-room Q&A, follow-up autopilot.'],
  ['🌐', 'White-label branding', 'Your logo, colors, fonts, and subdomain. Each licensed CRM runs on its own domain with an isolated marketplace.'],
  ['🔐', 'Buyer portal & NDAs', 'Buyer accounts, NDA workflow, documents, e-sign, and AI match alerts — all under your brand.'],
  ['🗄️', 'Own infrastructure', 'Your Supabase + storage. You pay only your own API usage — no shared infrastructure, no cross-tenant data.'],
  ['🎓', 'Certified training', 'The full CBI program with verifiable certificates for every broker on your roster.'],
]

export default function LicensePage() {
  return (
    <main style={{ background: '#f4f7fb', minHeight: '100vh' }}>
      {/* Hero */}
      <section style={{ background: 'linear-gradient(135deg,#1a1a2e 0%,#16213e 60%,#0f3460 100%)', color: '#fff', padding: '80px 24px' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto', textAlign: 'center' }}>
          <div style={{ color: '#c9a84c', textTransform: 'uppercase', letterSpacing: '.18em', fontSize: 12, fontWeight: 900 }}>For Brokerages</div>
          <h1 style={{ color: '#fff', fontSize: 44, maxWidth: 800, margin: '14px auto' }}>
            Own the CRM Platform. Run it under your brand.
          </h1>
          <p style={{ color: '#cbdbe7', fontSize: 17, lineHeight: 1.65, maxWidth: 700, margin: '0 auto' }}>
            The full system behind this marketplace — deals, leads, AI agents, buyer portals, e-sign, white-label branding —
            on <strong>your own domain</strong>, with <strong>your own API keys</strong>.
          </p>

          {/* Price card */}
          <div style={{ maxWidth: 480, margin: '36px auto 0', background: '#fff', borderRadius: 18, padding: '34px 32px', boxShadow: '0 24px 80px rgba(0,0,0,0.45)' }}>
            <div style={{ fontSize: 12, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#8a6d1a', fontWeight: 800 }}>One-Time License</div>
            <div style={{ fontFamily: 'Georgia, serif', fontSize: 52, fontWeight: 800, color: '#1a1a2e', margin: '8px 0 2px' }}>${CRM_LICENSE.setupFee.toLocaleString()}</div>
            <div style={{ fontSize: 14, color: '#888', marginBottom: 8 }}>+ ${CRM_LICENSE.monthly}/month platform fee</div>
            <div style={{ borderTop: '1px solid #ece8dc', margin: '14px 0', paddingTop: 14 }}>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, textAlign: 'left' }}>
                {CRM_LICENSE.includes.map((f) => (
                  <li key={f} style={{ padding: '6px 0', fontSize: 13.5, color: '#555', display: 'flex', gap: 8 }}>
                    <span style={{ color: '#c9a84c' }}>✓</span> {f}
                  </li>
                ))}
              </ul>
            </div>
            <Link href="/signup/agency" style={{ display: 'block', textAlign: 'center', background: '#1a1a2e', color: '#c9a84c', padding: '14px 0', borderRadius: 10, textDecoration: 'none', fontWeight: 800, fontFamily: 'Georgia, serif', fontSize: 15 }}>
              Buy the License — ${CRM_LICENSE.setupFee.toLocaleString()} →
            </Link>
            <div style={{ textAlign: 'center', marginTop: 12, fontSize: 12.5, color: '#999' }}>
              Starts with a free agency trial — no charge until you activate the license.
            </div>
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #ece8dc', fontSize: 11.5, color: '#aaa', lineHeight: 1.6 }}>
              This is a <strong>software license</strong> for the Concord platform — it is not a real-estate or brokerage license. Real-estate licenses are issued by state governments; our compliance tools only help brokers track and verify credentials they already hold.
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section style={{ maxWidth: 1080, margin: '0 auto', padding: '56px 24px 8px' }}>
        <h2 style={{ fontSize: 30, textAlign: 'center', margin: '0 0 8px' }}>Everything you need to run your market</h2>
        <p style={{ color: '#52606d', textAlign: 'center', fontSize: 15, margin: '0 0 32px' }}>
          One-time setup, then your CRM runs on your infrastructure with your credentials.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 18 }}>
          {features.map(([icon, title, body]) => (
            <div key={title} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 26, boxShadow: '0 4px 18px rgba(16,42,67,0.05)' }}>
              <div style={{ fontSize: 28 }}>{icon}</div>
              <h3 style={{ fontSize: 17.5, margin: '12px 0 6px' }}>{title}</h3>
              <p style={{ color: '#52606d', fontSize: 14, lineHeight: 1.65, margin: 0 }}>{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How licensing works */}
      <section style={{ maxWidth: 1080, margin: '0 auto', padding: '48px 24px' }}>
        <h2 style={{ fontSize: 30, textAlign: 'center', margin: '0 0 32px' }}>How licensing works</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
          {[
            ['1', 'Create your agency', 'Sign up free — your branded workspace is ready in minutes.'],
            ['2', 'Activate the license', 'One-time $4,999 setup + $500/mo platform fee via secure checkout.'],
            ['3', 'Connect your keys', 'Add your own DeepSeek/Claude, Supabase, and Stripe credentials.'],
            ['4', 'Launch your domain', 'Your subdomain goes live with your branding and isolated marketplace.'],
          ].map(([num, title, body]) => (
            <div key={num} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 22 }}>
              <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#1a1a2e', color: '#c9a84c', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontFamily: 'Georgia, serif' }}>{num}</div>
              <h3 style={{ fontSize: 15.5, margin: '12px 0 6px' }}>{title}</h3>
              <p style={{ color: '#52606d', fontSize: 13, lineHeight: 1.6, margin: 0 }}>{body}</p>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 26, background: '#faf9f4', border: '1px solid #ece8dc', borderRadius: 14, padding: '22px 26px', fontSize: 13.5, color: '#555', lineHeight: 1.7 }}>
          <strong style={{ color: '#1a1a2e' }}>No license required in most states.</strong> Business-asset brokerage is unlicensed in the majority of US states — a real-estate license is only needed when the sale transfers real property (and for business opportunities in California). The platform's compliance engine reflects this per-state.
        </div>
      </section>

      {/* CTA */}
      <section style={{ maxWidth: 1080, margin: '0 auto', padding: '8px 24px 80px' }}>
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: '36px 40px', textAlign: 'center', boxShadow: '0 10px 35px rgba(16,42,67,0.07)' }}>
          <h2 style={{ fontSize: 26, margin: '0 0 8px' }}>Own your market. Keep your brand.</h2>
          <p style={{ color: '#52606d', fontSize: 15, maxWidth: 560, margin: '0 auto 22px' }}>
            Start free, activate the license when you're ready, and launch your own marketplace within the hour.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/signup/agency" style={{ background: '#1a1a2e', color: '#c9a84c', padding: '13px 26px', borderRadius: 8, textDecoration: 'none', fontWeight: 800, fontSize: 15 }}>
              Start your free workspace →
            </Link>
            <Link href="/contact" style={{ border: '1px solid #1a1a2e', color: '#1a1a2e', padding: '13px 26px', borderRadius: 8, textDecoration: 'none', fontWeight: 700, fontSize: 15 }}>
              Talk to the platform team
            </Link>
          </div>
        </div>
      </section>
    </main>
  )
}

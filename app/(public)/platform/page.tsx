import Link from 'next/link'

// White-Label Platform — B2B2C play: brokerages launch their own branded
// business-for-sale marketplace on the Concord engine (their domain, logo,
// colors, fonts, listings, buyers). This page sells the platform and funnels
// to agency signup.

const features = [
  ['🌐', 'Your own branded domain', 'Run the marketplace on your domain — your logo, colors, fonts, and hero. Visitors never see "Concord"; they see your firm.'],
  ['🏢', 'Your listings, your buyers', 'Your agency\'s listings and buyer pipeline stay yours. Syndication, NDAs, data rooms, and AI intelligence all under your brand.'],
  ['🎓', 'Certified team', 'Every broker on your roster completes the 12-module CBI program with verifiable certificates — a hiring and trust advantage.'],
  ['🤖', 'AI deal autopilot', 'Follow-up autopilot, deal twins, call summaries, data-room Q&A, and visitor intent — the full intelligence stack, white-labeled.'],
  ['💰', 'Commission engine', 'Tiered splits, waterfall tracking, and closing metrics built in. You control fees and payouts.'],
  ['🔒', 'Enterprise-grade controls', 'Role-based permissions, compliance reviews, listing approvals, auditability, and SSO-ready security.'],
]

const steps = [
  ['1', 'Create your agency', 'Sign up, name your firm, and invite your brokers. Your workspace is ready in minutes.'],
  ['2', 'Brand it your way', 'Upload your logo, pick your colors and fonts, connect your domain. The public site adopts your identity instantly.'],
  ['3', 'List & syndicate', 'Publish listings to your branded marketplace and syndicate to major platforms. Buyers apply through your funnel.'],
  ['4', 'Train & certify', 'Brokers complete the CBI program and earn certificates with their name, your agency, and your logo.'],
  ['5', 'Close & grow', 'Deal autopilot keeps every follow-up moving. Track commissions, performance, and closed volume from one dashboard.'],
]

export default function PlatformPage() {
  return (
    <main style={{ background: '#f4f7fb', minHeight: '100vh' }}>
      {/* Hero */}
      <section style={{ background: 'linear-gradient(135deg,#071827,#0f3460)', color: '#fff', padding: '80px 24px' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto', textAlign: 'center' }}>
          <div style={{ color: '#76d7ea', textTransform: 'uppercase', letterSpacing: '.18em', fontSize: 12, fontWeight: 900 }}>White-Label Platform</div>
          <h1 style={{ color: '#fff', fontSize: 48, maxWidth: 780, margin: '14px auto' }}>
            Launch your own business-for-sale marketplace
          </h1>
          <p style={{ color: '#cbdbe7', fontSize: 17, lineHeight: 1.65, maxWidth: 700, margin: '0 auto' }}>
            Concord powers confidential marketplaces for brokerages and franchises — your domain, your brand, your deals.
            We supply the engine; you own the market.
          </p>
          <div style={{ marginTop: 26, display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/auth" style={{ background: '#0e7490', color: '#fff', padding: '13px 26px', borderRadius: 8, textDecoration: 'none', fontWeight: 700, fontSize: 15 }}>
              Start your brokerage →
            </Link>
            <Link href="/marketplace/certified" style={{ border: '1px solid rgba(255,255,255,0.5)', color: '#fff', padding: '13px 26px', borderRadius: 8, textDecoration: 'none', fontWeight: 700, fontSize: 15 }}>
              See certified intermediaries
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section style={{ maxWidth: 1080, margin: '0 auto', padding: '56px 24px 8px' }}>
        <h2 style={{ fontSize: 30, textAlign: 'center', margin: '0 0 8px' }}>Everything your brokerage needs, under your brand</h2>
        <p style={{ color: '#52606d', textAlign: 'center', fontSize: 15, margin: '0 0 32px' }}>
          The same engine behind Concord — customized to your identity and your market.
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

      {/* How it works */}
      <section style={{ maxWidth: 1080, margin: '0 auto', padding: '48px 24px' }}>
        <h2 style={{ fontSize: 30, textAlign: 'center', margin: '0 0 32px' }}>From signup to first close</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
          {steps.map(([num, title, body]) => (
            <div key={num} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 22 }}>
              <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#0f2038', color: '#c9a84c', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontFamily: 'Georgia, serif' }}>{num}</div>
              <h3 style={{ fontSize: 15.5, margin: '12px 0 6px' }}>{title}</h3>
              <p style={{ color: '#52606d', fontSize: 13, lineHeight: 1.6, margin: 0 }}>{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ maxWidth: 1080, margin: '0 auto', padding: '8px 24px 80px' }}>
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: '36px 40px', textAlign: 'center', boxShadow: '0 10px 35px rgba(16,42,67,0.07)' }}>
          <h2 style={{ fontSize: 26, margin: '0 0 8px' }}>Own your marketplace. Keep your brand.</h2>
          <p style={{ color: '#52606d', fontSize: 15, maxWidth: 560, margin: '0 auto 22px' }}>
            Create your agency workspace free — brand it, invite brokers, and start listing within the hour.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/auth" style={{ background: '#0e7490', color: '#fff', padding: '13px 26px', borderRadius: 8, textDecoration: 'none', fontWeight: 700, fontSize: 15 }}>
              Create your free workspace →
            </Link>
            <Link href="/contact" style={{ border: '1px solid #0e7490', color: '#0e7490', padding: '13px 26px', borderRadius: 8, textDecoration: 'none', fontWeight: 700, fontSize: 15 }}>
              Talk to the platform team
            </Link>
          </div>
        </div>
      </section>
    </main>
  )
}

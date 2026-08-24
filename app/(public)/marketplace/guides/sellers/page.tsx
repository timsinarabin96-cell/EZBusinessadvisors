import Link from 'next/link'

// Seller Guides — lead magnet + SEO page: how to sell a business, checklist,
// timeline, and FAQs. Server component, no auth needed.

const steps = [
  ['01', 'Get a professional valuation', 'Understand what your business is worth before you talk to anyone. A proper valuation uses SDE/EBITDA, market multiples, and comparable sales — not a gut feeling.'],
  ['02', 'Clean up your financials', 'Buyers and lenders underwrite off your recast earnings. Reconcile your books, document add-backs, and prepare 3 years of tax returns and P&Ls.'],
  ['03', 'Protect confidentiality', 'Your employees, customers, and competitors should not learn about the sale until closing. Every serious buyer signs an NDA before seeing any details.'],
  ['04', 'Prepare the business for sale', 'Reduce owner dependence, document standard operating procedures, diversify any concentrated customers, and fix obvious operational gaps.'],
  ['05', 'Market to qualified buyers', 'A confidential teaser generates interest; only NDA-signed, financially qualified buyers see the full CIM. Strategic buyers often pay the highest multiples.'],
  ['06', 'Manage diligence & close', 'Set a diligence timeline, keep both sides moving, coordinate the lender, and drive to a clean closing. Post-close, transition smoothly and collect referrals.'],
]

const faqs = [
  ['How long does selling a business take?', 'Most Main Street sales close in 6–12 months from listing. Financing-driven deals typically run 60–90 days from LOI to close. Realistic expectations prevent disappointment.'],
  ['What does a business broker cost?', 'Main Street commissions typically run 8–12% on a tiered scale, paid at closing. Most brokers also charge a small upfront marketing fee. A good broker pays for themselves many times over.'],
  ['Should I tell my employees?', 'No — confidentiality is critical. Employees learning about a sale can trigger departures, customer concerns, and deal-killing disruption. Disclosure happens at closing or just before.'],
  ['Do I need my CPA involved?', 'Yes. Your CPA should validate the recast, understand the tax consequences of the sale structure (asset vs. stock), and coordinate with the buyer\'s accountant.'],
  ['Can the buyer get an SBA loan?', 'Most Main Street buyers use SBA 7(a) financing. To qualify, the business needs sustainable earnings (typically 1.25x debt coverage), clean tax history, and a credible recast.'],
]

export default function SellerGuidesPage() {
  return (
    <main style={{ background: '#f4f7fb', minHeight: '100vh' }}>
      {/* Hero */}
      <section style={{ background: 'linear-gradient(135deg,#071827,#0f3460)', color: '#fff', padding: '72px 24px' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <div style={{ color: '#76d7ea', textTransform: 'uppercase', letterSpacing: '.18em', fontSize: 12, fontWeight: 900 }}>Seller Guides</div>
          <h1 style={{ color: '#fff', fontSize: 46, maxWidth: 720, margin: '14px 0' }}>How to sell your business for maximum value</h1>
          <p style={{ color: '#cbdbe7', fontSize: 17, lineHeight: 1.65, maxWidth: 700 }}>
            A step-by-step playbook from valuation to closing — built by certified business intermediaries who close deals every month.
          </p>
          <div style={{ marginTop: 22, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Link href="/marketplace/sell" style={{ background: '#0e7490', color: '#fff', padding: '12px 22px', borderRadius: 8, textDecoration: 'none', fontWeight: 700, fontSize: 14 }}>
              Get a free valuation
            </Link>
            <Link href="/marketplace/certified" style={{ border: '1px solid rgba(255,255,255,0.5)', color: '#fff', padding: '12px 22px', borderRadius: 8, textDecoration: 'none', fontWeight: 700, fontSize: 14 }}>
              Meet certified intermediaries
            </Link>
          </div>
        </div>
      </section>

      {/* Steps */}
      <section style={{ maxWidth: 1000, margin: '0 auto', padding: '56px 24px' }}>
        <h2 style={{ fontSize: 28, margin: '0 0 8px' }}>The 6-step selling process</h2>
        <p style={{ color: '#52606d', margin: '0 0 28px', fontSize: 15 }}>
          Every sale follows the same disciplined arc. Skip a step and you leave money — or the deal itself — on the table.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {steps.map(([num, title, body]) => (
            <div key={num} style={{ display: 'flex', gap: 20, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 24 }}>
              <div style={{ fontSize: 26, fontWeight: 900, color: '#0e7490', fontFamily: 'Georgia, serif', minWidth: 48 }}>{num}</div>
              <div>
                <h3 style={{ fontSize: 19, margin: '0 0 6px' }}>{title}</h3>
                <p style={{ color: '#52606d', fontSize: 14.5, lineHeight: 1.65, margin: 0 }}>{body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* FAQs */}
      <section style={{ maxWidth: 1000, margin: '0 auto', padding: '16px 24px 72px' }}>
        <h2 style={{ fontSize: 28, margin: '0 0 24px' }}>Seller FAQ</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {faqs.map(([q, a]) => (
            <details key={q} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '16px 20px' }}>
              <summary style={{ fontWeight: 700, fontSize: 15.5, cursor: 'pointer', color: '#102a43' }}>{q}</summary>
              <p style={{ color: '#52606d', fontSize: 14.5, lineHeight: 1.65, margin: '12px 0 0' }}>{a}</p>
            </details>
          ))}
        </div>

        {/* CTA */}
        <div style={{ marginTop: 40, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '28px 30px', display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ margin: '0 0 6px', fontSize: 19 }}>Ready to see what your business is worth?</h3>
            <p style={{ margin: 0, color: '#52606d', fontSize: 14 }}>Free, confidential, no obligation. Takes about 2 minutes.</p>
          </div>
          <Link href="/marketplace/sell" style={{ background: '#0e7490', color: '#fff', padding: '12px 22px', borderRadius: 8, textDecoration: 'none', fontWeight: 700, fontSize: 14 }}>
            Get your free valuation →
          </Link>
        </div>
      </section>
    </main>
  )
}

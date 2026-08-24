import Link from 'next/link'

// Insights — SEO content hub: guides, market notes, and how-tos for buyers and
// sellers. Server component; articles are static content for now.

const posts = [
  {
    slug: 'business-valuation-guide',
    category: 'Valuation',
    read: '8 min',
    title: 'How to Value a Business: The Broker\'s Complete Guide',
    excerpt: 'SDE vs EBITDA, market multiples, and the three methods every serious valuation triangulates. What your business is really worth — and why.',
    date: '2026-08-18',
  },
  {
    slug: 'sba-loan-guide',
    category: 'Financing',
    read: '10 min',
    title: 'SBA 7(a) in 2026: The Buyer\'s Playbook',
    excerpt: 'Down payments, credit requirements, DSCR, and how to structure a deal the bank will actually fund. The definitive Main Street financing guide.',
    date: '2026-08-12',
  },
  {
    slug: 'recast-explained',
    category: 'Financials',
    read: '6 min',
    title: 'Recast Financials Explained: Add-Backs Without the Spin',
    excerpt: 'Why owners understate profit, which add-backs are legitimate, and how a defensible recast closes deals (and an inflated one kills them).',
    date: '2026-08-05',
  },
  {
    slug: 'buyer-qualification',
    category: 'Process',
    read: '7 min',
    title: 'The Three-Axis Buyer Qualification Test',
    excerpt: 'Capacity, capability, commitment. How professional brokers separate serious buyers from tire-kickers — before anyone sees a CIM.',
    date: '2026-07-28',
  },
  {
    slug: 'seller-timeline',
    category: 'Selling',
    read: '5 min',
    title: 'How Long Does Selling a Business Really Take?',
    excerpt: 'The honest timeline: valuation to listing, LOI to diligence, diligence to close. And the three places deals get stuck (plus fixes).',
    date: '2026-07-20',
  },
  {
    slug: 'confidentiality-nda',
    category: 'Process',
    read: '5 min',
    title: 'Why the NDA Comes First — Every Time',
    excerpt: 'One leaked name can kill a sale, spook employees, and cost a seller their business. The confidentiality discipline that protects everyone.',
    date: '2026-07-14',
  },
]

export const metadata = {
  title: 'Insights & Guides — Business Brokerage Knowledge',
  description: 'Valuation guides, SBA financing playbooks, recast tutorials, and selling advice from certified business intermediaries.',
}

export default function InsightsPage() {
  return (
    <main style={{ background: '#f4f7fb', minHeight: '100vh' }}>
      {/* Hero */}
      <section style={{ background: 'linear-gradient(135deg,#071827,#0f3460)', color: '#fff', padding: '64px 24px' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <div style={{ color: '#76d7ea', textTransform: 'uppercase', letterSpacing: '.18em', fontSize: 12, fontWeight: 900 }}>Insights & Guides</div>
          <h1 style={{ color: '#fff', fontSize: 44, maxWidth: 680, margin: '14px 0' }}>Knowledge from the deal table</h1>
          <p style={{ color: '#cbdbe7', fontSize: 16.5, lineHeight: 1.65, maxWidth: 640 }}>
            Practical, no-spin education for buyers and sellers — written by certified business intermediaries who close Main Street deals.
          </p>
        </div>
      </section>

      {/* Post grid */}
      <section style={{ maxWidth: 1080, margin: '0 auto', padding: '52px 24px 80px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 22 }}>
          {posts.map((p) => (
            <Link key={p.slug} href={`/marketplace/insights/${p.slug}`} style={{ textDecoration: 'none' }}>
              <article style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 26, height: '100%', display: 'flex', flexDirection: 'column', transition: 'box-shadow .15s, transform .15s', boxShadow: '0 4px 18px rgba(16,42,67,0.05)' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
                  <span style={{ padding: '4px 10px', background: '#edf6fa', color: '#155e75', borderRadius: 999, fontSize: 11.5, fontWeight: 700 }}>{p.category}</span>
                  <span style={{ fontSize: 12, color: '#7b8794' }}>{p.read} read</span>
                </div>
                <h2 style={{ fontSize: 19, color: '#102a43', margin: '0 0 8px', lineHeight: 1.35, fontFamily: 'Georgia, serif' }}>{p.title}</h2>
                <p style={{ color: '#52606d', fontSize: 14, lineHeight: 1.6, margin: 0, flex: 1 }}>{p.excerpt}</p>
                <div style={{ marginTop: 16, fontSize: 12.5, color: '#0e7490', fontWeight: 700 }}>
                  Read article →
                </div>
              </article>
            </Link>
          ))}
        </div>

        {/* CTA */}
        <div style={{ marginTop: 44, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '28px 30px', textAlign: 'center' }}>
          <h3 style={{ margin: '0 0 8px', fontSize: 20 }}>Want answers specific to your business?</h3>
          <p style={{ margin: '0 auto 18px', color: '#52606d', fontSize: 14.5, maxWidth: 480 }}>
            Get a free, confidential valuation — or talk to a certified intermediary about buying or selling.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/marketplace/sell" style={{ background: '#0e7490', color: '#fff', padding: '12px 22px', borderRadius: 8, textDecoration: 'none', fontWeight: 700, fontSize: 14 }}>
              Get a free valuation
            </Link>
            <Link href="/marketplace/certified" style={{ border: '1px solid #0e7490', color: '#0e7490', padding: '12px 22px', borderRadius: 8, textDecoration: 'none', fontWeight: 700, fontSize: 14 }}>
              Meet certified intermediaries
            </Link>
          </div>
        </div>
      </section>
    </main>
  )
}

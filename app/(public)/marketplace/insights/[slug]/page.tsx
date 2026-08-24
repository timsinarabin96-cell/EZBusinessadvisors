import Link from 'next/link'
import { notFound } from 'next/navigation'

// Insights article detail — full content for each published guide.

const articles: Record<string, { category: string; title: string; read: string; date: string; sections: [string, string][] }> = {
  'business-valuation-guide': {
    category: 'Valuation',
    read: '8 min',
    date: '2026-08-18',
    title: 'How to Value a Business: The Broker\'s Complete Guide',
    sections: [
      ['Start with the earnings story', 'Every credible valuation starts with one question: what does this business actually earn? For Main Street businesses, that number is SDE — Seller Discretionary Earnings. SDE = net profit plus owner compensation, interest, taxes, depreciation, amortization, and legitimate discretionary add-backs. It answers the buyer\'s real question: "what would this business put in my pocket if I ran it?"'],
      ['SDE vs EBITDA: know your lane', 'SDE is the Main Street benchmark because the owner IS the business — the buyer will replace them and keep the earnings. EBITDA (earnings before interest, taxes, depreciation, and amortization) is the lower-middle-market benchmark, used when a management team runs the business and the buyer is an investor, not an operator. Mixing them up is the fastest way to overvalue a business by 2x.'],
      ['Multiples: the market\'s judgment', 'Value = earnings × multiple. Main Street businesses typically trade at 2–3.5x SDE. Mid-market firms trade at 4–6x EBITDA. The multiple reflects quality of earnings: recurring revenue, customer diversification, growth trajectory, and how replaceable the owner is. One huge customer? Discount. Recurring contracts and a trained team? Premium.'],
      ['Triangulate three methods', 'Serious brokers never rely on a single method. They triangulate: (1) multiple of earnings, (2) asset-based value (tangible assets + defensible goodwill), and (3) comparable sales — what similar businesses actually sold for. Where all three overlap is your defensible value range. Then the asking price sits at the top of that range, leaving room for negotiation without scaring off qualified buyers.'],
      ['The lender is the final judge', 'If the buyer needs an SBA loan, the lender re-underwrites everything — including your recast. A valuation that can\'t survive a lender\'s scrutiny isn\'t a valuation, it\'s a wish. Structure your numbers conservatively, document every add-back, and your price will hold up in diligence.'],
    ],
  },
  'sba-loan-guide': {
    category: 'Financing',
    read: '10 min',
    date: '2026-08-12',
    title: 'SBA 7(a) in 2026: The Buyer\'s Playbook',
    sections: [
      ['What SBA 7(a) actually is', 'The SBA 7(a) program guarantees a portion of a bank loan, which lets lenders finance small-business acquisitions they would otherwise decline. For buyers, that means: 10% down payment (sometimes less with seller financing), terms up to 10 years, and coverage up to $5M including working capital and sometimes real estate.'],
      ['The buyer requirements', 'You will need a credit score around 680 or better, a manageable debt-to-income ratio, and a credible story for why you can run this business. The SBA wants to see experience — industry experience is best, but a well-researched rationale plus a transition plan can work.'],
      ['The business must qualify too', 'Lenders underwrite the business, not just you. They look for sustainable cash flow — a debt service coverage ratio (DSCR) of at least 1.25x after the new loan payments — plus clean tax history, no pending litigation, and a recast that holds up. A business that depends entirely on its owner is hard to finance; so is one with an inflated, indefensible recast.'],
      ['Timeline: plan for 60–90 days', 'From LOI to closing, an SBA-financed deal typically takes 60–90 days. The lender needs time: application, underwriting, appraisal, SBA approval, and clear-to-close. Sellers who understand this timeline up front are less frustrated; buyers who get pre-approved before shopping close faster.'],
      ['How brokers help', 'A good broker front-loads lender involvement, prepares a clean seller package (recast, tax returns, P&Ls, CIM), and shops the deal to lenders who actually do SBA. A "sold" deal that can\'t get financed isn\'t sold — the broker\'s job is to make sure it can be.'],
    ],
  },
  'recast-explained': {
    category: 'Financials',
    read: '6 min',
    date: '2026-08-05',
    title: 'Recast Financials Explained: Add-Backs Without the Spin',
    sections: [
      ['Why owners understate profit', 'Most small-business owners run their books to minimize taxable income — personal expenses through the company, aggressive deductions, family members on payroll. The raw P&L understates true earnings. The recast exists to show what a buyer could realistically earn.'],
      ['What counts as an add-back', 'Legitimate add-backs: owner salary above fair-market replacement cost, owner health insurance and retirement contributions, personal vehicles and travel, discretionary meals, family payroll for no real work, and one-time expenses. Each must be documented with a source.'],
      ['What does NOT count', 'Recurring expenses a new owner must absorb, wages needed to replace actual owner labor, and anything undocumented. The test: "would a reasonable buyer have to spend this money to run the business?" If yes, it stays.'],
      ['Why conservative wins', 'Lenders and sophisticated buyers will redo your recast themselves. An inflated number destroys credibility, kills financing, and can sink the deal in diligence. A conservative, documented recast closes deals.'],
    ],
  },
  'buyer-qualification': {
    category: 'Process',
    read: '7 min',
    date: '2026-07-28',
    title: 'The Three-Axis Buyer Qualification Test',
    sections: [
      ['Capacity: can they pay?', 'The first question is money. Does the buyer have the cash, financing, or equity to actually complete this purchase? Professional brokers require proof of funds or a lender pre-approval before showing a CIM. Tire-kickers never survive this filter.'],
      ['Capability: can they run it?', 'A business is only worth what its next owner can extract. Does the buyer have industry experience, management skills, or a credible plan? A buyer who can\'t operate the business will fail — and that failure reflects on the broker who introduced them.'],
      ['Commitment: are they serious?', 'Motivation and timeline matter as much as money. Is the buyer actively looking, with clear criteria and a real time horizon? A buyer who "loves everything" but moves on nothing is a buyer who buys nothing.'],
      ['Score every buyer', 'Qualify on all three axes, score 1–10, and only buyers scoring 7+ get full information. This single discipline protects sellers, saves weeks of wasted showings, and makes you look professional to both sides.'],
    ],
  },
  'seller-timeline': {
    category: 'Selling',
    read: '5 min',
    date: '2026-07-20',
    title: 'How Long Does Selling a Business Really Take?',
    sections: [
      ['The honest numbers', 'Most Main Street sales take 6–12 months from listing to closing. Preparation (valuation, recast, marketing materials) takes 2–4 weeks. Marketing and buyer qualification take 2–4 months. LOI to close — the diligence and financing window — takes another 60–90 days.'],
      ['Where deals get stuck', 'Three classic stalls: (1) inflated recasts that fall apart under lender scrutiny, (2) unqualified buyers who can\'t produce funds, and (3) owner dependence that spooks buyers and lenders. Each adds months or kills the deal outright.'],
      ['How to move faster', 'Prepare before you market: clean recast, organized diligence documents, and a lender introduced early. Qualify buyers hard. Set a diligence deadline and hold both sides to it. Momentum is oxygen — silence is the deal killer.'],
    ],
  },
  'confidentiality-nda': {
    category: 'Process',
    read: '5 min',
    date: '2026-07-14',
    title: 'Why the NDA Comes First — Every Time',
    sections: [
      ['What\'s at stake', 'A leaked sale can spook employees, alarm customers, alert competitors, and destroy the value of the business — sometimes before the seller even knew the leak happened. Confidentiality isn\'t a formality; it\'s the foundation of the entire transaction.'],
      ['The NDA-first rule', 'Never share the identity of the business, its financials, or its customer names without a signed NDA. The teaser (public) shows only what\'s safe: industry, location, revenue range, and a compelling story. Everything else — the CIM, the financials, the identity — waits for the NDA.'],
      ['What a proper NDA covers', 'It names the business generically, restricts use of information to evaluating the purchase, prohibits contacting employees, customers, or suppliers, and survives the end of discussions. Have it reviewed by counsel in your state.'],
      ['The broker\'s discipline', 'Collect the NDA before sending anything, log it in the CRM, and track its status. The brokers who enforce this every time are the ones sellers trust — and trust is the business.'],
    ],
  },
}

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const article = articles[slug]
  if (!article) notFound()

  return (
    <main style={{ background: '#f4f7fb', minHeight: '100vh' }}>
      <article style={{ maxWidth: 760, margin: '0 auto', padding: '56px 24px 80px' }}>
        <Link href="/marketplace/insights" style={{ color: '#0e7490', textDecoration: 'none', fontSize: 14, fontWeight: 700 }}>
          ← All insights
        </Link>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 20 }}>
          <span style={{ padding: '4px 10px', background: '#edf6fa', color: '#155e75', borderRadius: 999, fontSize: 12, fontWeight: 700 }}>{article.category}</span>
          <span style={{ fontSize: 13, color: '#7b8794' }}>{new Date(article.date).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })} · {article.read} read</span>
        </div>
        <h1 style={{ fontSize: 36, color: '#102a43', lineHeight: 1.25, margin: '16px 0 8px', fontFamily: 'Georgia, serif' }}>{article.title}</h1>
        <div style={{ height: 3, width: 64, background: '#c9a84c', margin: '20px 0 28px' }} />
        {article.sections.map(([heading, body]) => (
          <section key={heading} style={{ marginBottom: 28 }}>
            <h2 style={{ fontSize: 21, color: '#102a43', margin: '0 0 10px', fontFamily: 'Georgia, serif' }}>{heading}</h2>
            <p style={{ color: '#3d4a5c', fontSize: 16, lineHeight: 1.75, margin: 0 }}>{body}</p>
          </section>
        ))}
        <div style={{ marginTop: 36, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '24px 26px', textAlign: 'center' }}>
          <p style={{ margin: '0 0 14px', color: '#52606d', fontSize: 14.5 }}>Put this into practice — get a free, confidential valuation.</p>
          <Link href="/marketplace/sell" style={{ background: '#0e7490', color: '#fff', padding: '11px 20px', borderRadius: 8, textDecoration: 'none', fontWeight: 700, fontSize: 14 }}>
            Get your free valuation →
          </Link>
        </div>
      </article>
    </main>
  )
}

export async function generateStaticParams() {
  return Object.keys(articles).map((slug) => ({ slug }))
}

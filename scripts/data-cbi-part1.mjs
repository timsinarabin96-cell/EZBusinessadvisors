/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// CBI Program curriculum — Part 1 (Modules 1–6)
// Certified Business Intermediary — 3 phases, 12 modules, 36 lessons, 72 quiz Qs
// Fixed UUIDs for idempotent reseeding.
// =============================================================================

export const CBI_PHASES = [
  { id: 'phase-foundations', title: 'Phase 1 — Foundations', blurb: 'The profession, valuation science, and the numbers behind every deal.' },
  { id: 'phase-dealcraft', title: 'Phase 2 — Deal Craft', blurb: 'Sourcing, confidentiality, marketing, and documents that sell.' },
  { id: 'phase-execution', title: 'Phase 3 — Execution', blurb: 'Due diligence, financing, negotiation, and closing like a pro.' },
]

// module ids: cbi-0001..0012  lesson ids: cbiL-0101..1212  quiz ids: cbiQ-0101..1212
export const MODULES_1 = [
  {
    id: 'c0dec0de-0001-4000-8000-000000000001',
    order: 1,
    icon: '🎓',
    title: 'The Business Intermediary Profession',
    description: 'Who we are, what we do, and the ethics that make a broker trusted.',
    lessons: [
      {
        id: 'c0dec0de-0101-4000-8000-000000000001',
        title: 'What a Business Intermediary Actually Does',
        content: 'A business intermediary (broker) is the professional who sells privately held businesses. Unlike a real estate agent, you are not selling a building — you are selling an operating enterprise: its revenue, customers, employees, goodwill, and future cash flow.\n\nYour role spans the entire transaction arc: valuing the business, marketing it confidentially, qualifying buyers, managing due diligence, negotiating price and terms, and driving to a successful closing. You are the project manager of the sale, the confidentiality gatekeeper, and the neutral adult in the room when emotions run high.\n\nGreat intermediaries are part analyst, part salesperson, part therapist, and part detective. You must read financials like an accountant, sell like a closer, and manage expectations like a diplomat — often all in the same afternoon.',
        duration_minutes: 14,
      },
      {
        id: 'c0dec0de-0102-4000-8000-000000000001',
        title: 'How the Industry Works: Main Street to Lower Middle Market',
        content: 'The business-brokerage world splits into two broad lanes. Main Street covers small owner-operated businesses — restaurants, retail, service trades, small manufacturing — typically selling for $50k to $2M. Lower middle market covers larger companies, often $2M to $50M in value, sold by investment bankers or sophisticated brokers.\n\nMain Street deals are usually priced off Seller Discretionary Earnings (SDE) at 2–3.5x multiples. Lower middle market deals price off EBITDA at 4–6x or more. Commissions in Main Street typically run 8–12% (often on a tiered scale), while lower middle market fees are often structured as a Lehman-style percentage of deal value.\n\nMost independent brokerages — including the ones that win — start in Main Street, build a brand, and move upmarket as their buyer networks and deal experience grow.',
        duration_minutes: 12,
      },
      {
        id: 'c0dec0de-0103-4000-8000-000000000001',
        title: 'Ethics, Fiduciary Duty & Licensing',
        content: 'You hold confidential financials and act as an agent for the seller (or, in some states and structures, a transaction broker). That carries real duties: disclose your role, never misrepresent a business, protect seller identity and financials behind NDAs, and never act for both sides without clear informed consent.\n\nLicensing matters. Many states require a real estate broker or business-broker license to sell businesses, and requirements vary by state — know yours cold before you take a single listing.\n\nPractical ethics rules that protect you: always use a signed listing agreement, always route sensitive information through qualified buyers only, document every disclosure, and refuse deals that require you to hide material facts. A reputation for integrity is the single most valuable asset a broker owns.',
        duration_minutes: 13,
      },
    ],
  },
  {
    id: 'c0dec0de-0002-4000-8000-000000000001',
    order: 2,
    icon: '💰',
    title: 'Business Valuation Science',
    description: 'SDE, EBITDA, multiples, and triangulating a defensible asking price.',
    lessons: [
      {
        id: 'c0dec0de-0201-4000-8000-000000000001',
        title: 'SDE & EBITDA: The Two Earnings Languages',
        content: 'SDE (Seller Discretionary Earnings) is the earnings benchmark for Main Street: net profit plus owner compensation, non-cash expenses, interest, taxes, and discretionary add-backs. It answers the buyer\'s real question: "what does this business put in the pocket of an owner-operator?"\n\nEBITDA (Earnings Before Interest, Taxes, Depreciation, and Amortization) strips out everything except operating performance — used for larger businesses where the buyer will hire a manager rather than run the business themselves.\n\nSDE = Net Profit + Owner Comp + Interest + Taxes + Depreciation + Amortization + Discretionary Add-backs. EBITDA = SDE minus owner comp above fair market (and adjusted for other owner benefits). Getting these definitions precise is the difference between a credible valuation and a fantasy number.',
        duration_minutes: 15,
      },
      {
        id: 'c0dec0de-0202-4000-8000-000000000001',
        title: 'Multiples, Markets & the Rule of Thumb',
        content: 'Value = Earnings × Multiple. The multiple is where judgment enters. Main Street businesses typically trade at 2–3.5x SDE; lower middle market at 4–6x EBITDA; high-growth or recurring-revenue businesses can command 6–10x.\n\nMultiples are driven by quality of earnings (recurring vs. one-off revenue), growth trajectory, customer concentration, owner dependence, transferability, and market conditions. A business with one huge customer and an irreplaceable owner sells at a discount; a business with diversified recurring revenue and a trained management team sells at a premium.\n\nRule-of-thumb multiples by industry exist (e.g., staffing firms at 3–4x EBITDA, insurance agencies at 5–8x) — useful sanity checks, never gospel. Triangulate against real sold comps whenever you can.',
        duration_minutes: 14,
      },
      {
        id: 'c0dec0de-0203-4000-8000-000000000001',
        title: 'Valuation Methods & Triangulation',
        content: 'Serious brokers triangulate at least three methods: (1) Multiple of earnings (SDE or EBITDA) — the workhorse; (2) Asset-based — tangible assets plus intangible goodwill, essential for asset-heavy businesses; (3) Market comps — actual sold prices of comparable businesses.\n\nDiscounted cash flow (DCF) appears more in theory than in Main Street practice, but a simple 3–5 year DCF can validate whether the multiple-based price is sane.\n\nThe final asking price should be defensible to a seller, a buyer, and a lender: pick the range where all three methods overlap, then set the list price at the top of that range to leave negotiating room — but never so high that qualified buyers scroll past it.',
        duration_minutes: 16,
      },
    ],
  },
  {
    id: 'c0dec0de-0003-4000-8000-000000000001',
    order: 3,
    icon: '📊',
    title: 'Financial Recasting & Normalization',
    description: 'Turning owner bookkeeping into lender-ready, buyer-credible financials.',
    lessons: [
      {
        id: 'c0dec0de-0301-4000-8000-000000000001',
        title: 'Why Owners Understate Profit (and What to Do About It)',
        content: 'Small-business owners routinely run their books to minimize taxable income — paying personal expenses through the company, taking aggressive deductions, and paying family members. The raw P&L therefore understates the true economic earnings of the business.\n\nThe broker\'s job is to recast: normalize the financials to show what a buyer could realistically earn. This is not fraud — it is the accepted, documented practice of separating the owner\'s personal benefit from the business\'s true earning power.\n\nEvery recast line item must be defensible and traceable. If you cannot document an add-back with a source, do not make it. Lenders and sophisticated buyers will redo your recast themselves — an inflated number destroys credibility and kills financing.',
        duration_minutes: 16,
      },
      {
        id: 'c0dec0de-0302-4000-8000-000000000001',
        title: 'The Add-Back Ledger: What Counts and What Doesn\'t',
        content: 'Standard add-backs: owner salary above fair-market replacement cost, owner health insurance and retirement contributions, personal vehicles and travel, discretionary meals and entertainment, family members on payroll who do no real work, one-time legal/accounting/consulting fees, and non-recurring expenses.\n\nWhat does NOT count: recurring expenses a new owner must absorb, wages needed to replace actual owner labor, and any expense without documentation. The test is always: "would a reasonable buyer have to spend this money to run the business?"\n\nKeep an add-back ledger per year with a one-line justification for each item. This single discipline separates professional brokers from amateurs and survives lender scrutiny.',
        duration_minutes: 13,
      },
      {
        id: 'c0dec0de-0303-4000-8000-000000000001',
        title: 'Building Sustainable SDE & a Defensible Recast',
        content: 'Sustainable SDE = reported net profit + justified add-backs, minus what a replacement owner must genuinely spend. If the owner works 60 hours a week and the buyer must hire a manager, that manager\'s salary is an expense — not an add-back.\n\nThe deliverable is a clean 3-year recast: Year 1–3 P&L, add-back schedule, and a normalized earnings summary, ideally with the owner\'s CPA signing off. Lenders underwrite off this document, so conservatism is a feature.\n\nA conservative, documented recast closes deals. An aggressive one attracts lawsuits and falls apart in diligence. Always show the recast to the seller before marketing — the seller must be able to defend every number on it.',
        duration_minutes: 14,
      },
    ],
  },
  {
    id: 'c0dec0de-0004-4000-8000-000000000001',
    order: 4,
    icon: '🔄',
    title: 'The Deal Lifecycle',
    description: 'The ten gates every transaction passes through — and where deals actually die.',
    lessons: [
      {
        id: 'c0dec0de-0401-4000-8000-000000000001',
        title: 'The Ten Gates of a Transaction',
        content: 'Every deal follows the same arc: (1) listing engagement, (2) valuation & recast, (3) CIM/BOV preparation, (4) confidential marketing, (5) buyer sourcing, (6) NDA & qualification, (7) showings & LOI, (8) due diligence, (9) purchase agreement & financing, (10) closing.\n\nTreat each gate as a checkpoint with a yes/no decision. If a gate fails — the recast doesn\'t hold, the buyer can\'t prove funds, the lender says no — you stop and fix it before advancing. Deals die when brokers skip gates or let unqualified parties drag them forward.\n\nA clean pipeline is a competitive weapon: sellers can see exactly where their deal stands, buyers feel managed, and your own time is spent on deals that can actually close.',
        duration_minutes: 15,
      },
      {
        id: 'c0dec0de-0402-4000-8000-000000000001',
        title: 'Pipeline Management & the KPIs That Matter',
        content: 'Brokers manage a pipeline, not a pile. The core KPIs: listings signed per month, days on market, NDAs issued, qualified buyers per listing, offers per listing, offer-to-close conversion, and average days from LOI to close.\n\nConversion math is brutal and honest: if you need 10 NDAs to get 3 qualified buyers, 2 showings, and 1 offer — and 50% of offers close — then you need roughly 20 NDAs per closed deal. Pipeline math tells you exactly how much sourcing activity your income requires.\n\nUse the CRM to track every touchpoint: calls, emails, NDAs, showings, offers. A deal with no logged activity in 5 days is a deal you are losing — the follow-up autopilot exists to catch exactly that.',
        duration_minutes: 12,
      },
      {
        id: 'c0dec0de-0403-4000-8000-000000000001',
        title: 'Where Deals Actually Die (and How to Prevent It)',
        content: 'The three classic deal-killers: (1) inflated recasts — the numbers don\'t survive diligence or underwriting; (2) unqualified buyers — no real funds, no realistic timeline, just tire-kicking; (3) owner dependence — the business is the owner, and buyers (and lenders) know it.\n\nRunner-up killers: poor communication during diligence (silence creates fear), seller cold feet, buyer financing failure, and scope creep where the deal changes shape mid-flight.\n\nPrevention is process: conservative recasts, aggressive buyer qualification with proof of funds, a structured diligence checklist, weekly status calls with both parties, and a lender involved from week one. Deals that die usually die quietly — your job is to make failure loud and early, so you can fix it or cut it.',
        duration_minutes: 13,
      },
    ],
  },
  {
    id: 'c0dec0de-0005-4000-8000-000000000001',
    order: 5,
    icon: '🔍',
    title: 'Listing Acquisition & Seller Qualification',
    description: 'Finding sellable businesses and winning the listing — the lifeblood of the practice.',
    lessons: [
      {
        id: 'c0dec0de-0501-4000-8000-000000000001',
        title: 'Where Great Listings Come From',
        content: 'The best listings come from relationships: CPAs, attorneys, commercial lenders, franchise consultants, and past clients. Referral sources send you owners who are already motivated and pre-vetted.\n\nActive sourcing: expired listings from other brokers, owners approaching retirement, second-generation owners who don\'t want the business, and businesses where the owner has had a life event (health, divorce, succession).\n\nBuild a referral engine: meet your local CPAs and lenders quarterly, send them a one-page "who I help" card, and make referring easy. One strong CPA referral is worth fifty cold calls — and track every source so you know which relationships pay.',
        duration_minutes: 13,
      },
      {
        id: 'c0dec0de-0502-4000-8000-000000000001',
        title: 'The Seller Qualification Screen',
        content: 'Not every business is sellable, and not every seller is ready. Screen on five questions: (1) Is the seller genuinely leaving? (2) Are the financials credible and complete? (3) Is the business dependent on the owner? (4) Is the value transferable (customers, contracts, employees)? (5) Does the owner\'s price expectation match market reality?\n\nRed flags that should make you walk: the owner "wants out but will stay involved forever," books that are fabricated or missing, a business that is 90% one customer, or an owner anchored to a fantasy price.\n\nA weak listing costs you months of marketing, your reputation with buyers, and your time. The most profitable decision a broker makes is often the listing they decline.',
        duration_minutes: 12,
      },
      {
        id: 'c0dec0de-0503-4000-8000-000000000001',
        title: 'The Listing Appointment Playbook',
        content: 'The listing appointment is a sales call where the product is you. Structure it: (1) build rapport and learn their story, (2) understand why they are selling and their timeline, (3) gather preliminary financials, (4) tour the operation, (5) present a preliminary valuation range and process, (6) set expectations on time-to-sale, confidentiality, and fees, (7) ask for the listing.\n\nBring value to the first meeting: a preliminary valuation, a marketing plan, and examples of your past closings. The owner is interviewing you as much as you are qualifying them.\n\nAlways leave with a next step — a signed listing agreement, a date to receive full financials, or a referral. Never leave a listing appointment with "we\'ll think about it."',
        duration_minutes: 15,
      },
    ],
  },
  {
    id: 'c0dec0de-0006-4000-8000-000000000001',
    order: 6,
    icon: '🤝',
    title: 'Confidentiality & Buyer Qualification',
    description: 'Protecting the seller\'s business while building a pipeline of buyers who can actually close.',
    lessons: [
      {
        id: 'c0dec0de-0601-4000-8000-000000000001',
        title: 'The NDA-First Rule',
        content: 'Never share the identity of the business, its financials, or its customer names without a signed NDA. Period. The NDA is the gate between the teaser (public) and the CIM (confidential).\n\nA proper NDA: names the business generically, restricts use of information to evaluating the purchase, prohibits contacting employees/customers/suppliers, and survives termination of discussions. Have it reviewed by counsel in your state.\n\nProcess discipline: collect the NDA BEFORE sending the CIM, log the NDA in your CRM, and track its status. An unsigned-NDA leak can destroy a seller\'s business — customers, employees, and competitors finding out can kill the deal and your reputation.',
        duration_minutes: 13,
      },
      {
        id: 'c0dec0de-0602-4000-8000-000000000001',
        title: 'The Three-Axis Buyer Qualification',
        content: 'Qualify buyers on three axes: capacity (can they pay — do they have the cash, financing, or equity?), capability (can they run this business — industry experience, management skills?), and commitment (are they serious — timeline, motivation, willingness to engage?).\n\nRequire proof of funds or a pre-approval letter before showing a CIM. Ask about their acquisition criteria: size, industry, location, financing approach. A buyer who "loves everything" is often a buyer who buys nothing.\n\nScore every buyer 1–10 on each axis. Only buyers scoring 7+ get full information. This single discipline protects sellers, saves you weeks of wasted showings, and makes you look professional to both sides.',
        duration_minutes: 12,
      },
      {
        id: 'c0dec0de-0603-4000-8000-000000000001',
        title: 'Building a Repeatable Buyer Pipeline',
        content: 'Your buyer list is a compounding asset. Every deal should add qualified buyers who didn\'t win — they are pre-screened for the next listing.\n\nSources: your own marketing (website, listings platforms, email), past clients, industry contacts, search funds, franchisees, and corporate/strategic buyers. Strategic buyers (competitors, suppliers, adjacent businesses) often pay the highest multiples.\n\nKeep every buyer in the CRM with their criteria, capacity, and NDA status. When a new listing matches, you can have qualified interest in days, not months. Brokers who win consistently are the ones whose buyer list is always warm.',
        duration_minutes: 14,
      },
    ],
  },
]

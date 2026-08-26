/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Insights / Blog engine — audit Part C #1: "Blog/Insights → SEO engine".
// -----------------------------------------------------------------------------
// DDL-free: posts live in platform_settings JSONB under key 'blog_posts'
// ({ [slug]: post }) — same pattern as broker videos / push subscriptions, so
// no SQL run is required. The public /marketplace/insights hub + article pages
// render from here; a broker dashboard manages posts. Ships with a curated
// seed set so the hub is never empty. Server-only.
// =============================================================================

import { createClient } from '@supabase/supabase-js'

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const svc =
  SUPABASE_URL && SERVICE_KEY
    ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
    : null

const SETTINGS_KEY = 'blog_posts'

export interface BlogPost {
  slug: string
  title: string
  excerpt: string
  category: string
  read: string
  date: string
  published: boolean
  sections: [string, string][]
  updated_at: string
}

export interface BlogPostInput {
  slug?: string
  title: string
  excerpt: string
  category: string
  read?: string
  date?: string
  published?: boolean
  sections: [string, string][]
}

/** Curated starter content — keeps the hub populated out of the box. */
export const SEED_POSTS: BlogPost[] = [
  {
    slug: 'business-valuation-guide',
    category: 'Valuation',
    read: '8 min',
    date: '2026-08-18',
    published: true,
    updated_at: '2026-08-18T00:00:00Z',
    title: "How to Value a Business: The Broker's Complete Guide",
    excerpt: 'SDE vs EBITDA, market multiples, and the three methods every serious valuation triangulates. What your business is really worth — and why.',
    sections: [
      ['Start with the earnings story', 'Every credible valuation starts with one question: what does this business actually earn? For Main Street businesses, that number is SDE — Seller Discretionary Earnings. SDE = net profit plus owner compensation, interest, taxes, depreciation, amortization, and legitimate discretionary add-backs. It answers the buyer\'s real question: "what would this business put in my pocket if I ran it?"'],
      ['SDE vs EBITDA: know your lane', 'SDE is the Main Street benchmark because the owner IS the business — the buyer will replace them and keep the earnings. EBITDA is the lower-middle-market benchmark, used when a management team runs the business and the buyer is an investor, not an operator. Mixing them up is the fastest way to overvalue a business by 2x.'],
      ['Multiples: the market\'s judgment', 'Value = earnings × multiple. Main Street businesses typically trade at 2–3.5x SDE. Mid-market firms trade at 4–6x EBITDA. The multiple reflects quality of earnings: recurring revenue, customer diversification, growth trajectory, and how replaceable the owner is.'],
      ['Triangulate three methods', 'Serious brokers never rely on a single method. They triangulate: (1) multiple of earnings, (2) asset-based value, and (3) comparable sales. Where all three overlap is your defensible value range.'],
      ['The lender is the final judge', 'If the buyer needs an SBA loan, the lender re-underwrites everything — including your recast. A valuation that can\'t survive a lender\'s scrutiny isn\'t a valuation, it\'s a wish.'],
    ],
  },
  {
    slug: 'sba-loan-guide',
    category: 'Financing',
    read: '10 min',
    date: '2026-08-12',
    published: true,
    updated_at: '2026-08-12T00:00:00Z',
    title: "SBA 7(a) in 2026: The Buyer's Playbook",
    excerpt: 'Down payments, credit requirements, DSCR, and how to structure a deal the bank will actually fund. The definitive Main Street financing guide.',
    sections: [
      ['What SBA 7(a) actually is', 'The SBA 7(a) program guarantees a portion of a bank loan, which lets lenders finance small-business acquisitions they would otherwise decline. For buyers, that means: 10% down payment, terms up to 10 years, and coverage up to $5M.'],
      ['The buyer requirements', 'You will need a credit score around 680 or better, a manageable debt-to-income ratio, and a credible story for why you can run this business.'],
      ['The business must qualify too', 'Lenders underwrite the business, not just you. They look for sustainable cash flow — a DSCR of at least 1.25x after the new loan payments — plus clean tax history and a recast that holds up.'],
      ['Timeline: plan for 60–90 days', 'From LOI to closing, an SBA-financed deal typically takes 60–90 days. Buyers who get pre-approved before shopping close faster.'],
      ['How brokers help', 'A good broker front-loads lender involvement, prepares a clean seller package, and shops the deal to lenders who actually do SBA. A "sold" deal that can\'t get financed isn\'t sold.'],
    ],
  },
  {
    slug: 'recast-explained',
    category: 'Financials',
    read: '6 min',
    date: '2026-08-05',
    published: true,
    updated_at: '2026-08-05T00:00:00Z',
    title: 'Recast Financials Explained: Add-Backs Without the Spin',
    excerpt: 'Why owners understate profit, which add-backs are legitimate, and how a defensible recast closes deals (and an inflated one kills them).',
    sections: [
      ['Why owners understate profit', 'Most small-business owners run their books to minimize taxable income — personal expenses through the company, aggressive deductions, family members on payroll. The raw P&L understates true earnings.'],
      ['What counts as an add-back', 'Legitimate add-backs: owner salary above fair-market replacement cost, owner health insurance and retirement contributions, personal vehicles and travel, discretionary meals, family payroll for no real work, and one-time expenses.'],
      ['What does NOT count', 'Recurring expenses a new owner must absorb, wages needed to replace actual owner labor, and anything undocumented. The test: "would a reasonable buyer have to spend this money to run the business?"'],
      ['Why conservative wins', 'Lenders and sophisticated buyers will redo your recast themselves. An inflated number destroys credibility, kills financing, and can sink the deal in diligence.'],
    ],
  },
  {
    slug: 'buyer-qualification',
    category: 'Process',
    read: '7 min',
    date: '2026-07-28',
    published: true,
    updated_at: '2026-07-28T00:00:00Z',
    title: 'The Three-Axis Buyer Qualification Test',
    excerpt: 'Capacity, capability, commitment. How professional brokers separate serious buyers from tire-kickers — before anyone sees a CIM.',
    sections: [
      ['Capacity: can they pay?', 'The first question is money. Does the buyer have the cash, financing, or equity to actually complete this purchase? Professional brokers require proof of funds or a lender pre-approval before showing a CIM.'],
      ['Capability: can they run it?', 'A business is only worth what its next owner can extract. Does the buyer have industry experience, management skills, or a credible plan?'],
      ['Commitment: are they serious?', 'Motivation and timeline matter as much as money. Is the buyer actively looking, with clear criteria and a real time horizon?'],
      ['Score every buyer', 'Qualify on all three axes, score 1–10, and only buyers scoring 7+ get full information. This single discipline protects sellers and saves weeks of wasted showings.'],
    ],
  },
  {
    slug: 'seller-timeline',
    category: 'Selling',
    read: '5 min',
    date: '2026-07-20',
    published: true,
    updated_at: '2026-07-20T00:00:00Z',
    title: 'How Long Does Selling a Business Really Take?',
    excerpt: 'The honest timeline: valuation to listing, LOI to diligence, diligence to close. And the three places deals get stuck (plus fixes).',
    sections: [
      ['The honest numbers', 'Most Main Street sales take 6–12 months from listing to closing. Preparation takes 2–4 weeks. Marketing and buyer qualification take 2–4 months. LOI to close takes another 60–90 days.'],
      ['Where deals get stuck', 'Three classic stalls: (1) inflated recasts that fall apart under lender scrutiny, (2) unqualified buyers who can\'t produce funds, and (3) owner dependence that spooks buyers and lenders.'],
      ['How to move faster', 'Prepare before you market: clean recast, organized diligence documents, and a lender introduced early. Qualify buyers hard. Momentum is oxygen — silence is the deal killer.'],
    ],
  },
  {
    slug: 'confidentiality-nda',
    category: 'Process',
    read: '5 min',
    date: '2026-07-14',
    published: true,
    updated_at: '2026-07-14T00:00:00Z',
    title: 'Why the NDA Comes First — Every Time',
    excerpt: 'One leaked name can kill a sale, spook employees, and cost a seller their business. The confidentiality discipline that protects everyone.',
    sections: [
      ['What\'s at stake', 'A leaked sale can spook employees, alarm customers, alert competitors, and destroy the value of the business. Confidentiality isn\'t a formality; it\'s the foundation of the entire transaction.'],
      ['The NDA-first rule', 'Never share the identity of the business, its financials, or its customer names without a signed NDA. The teaser shows only what\'s safe: industry, location, revenue range, and a compelling story.'],
      ['What a proper NDA covers', 'It names the business generically, restricts use of information to evaluating the purchase, prohibits contacting employees, customers, or suppliers, and survives the end of discussions.'],
      ['The broker\'s discipline', 'Collect the NDA before sending anything, log it in the CRM, and track its status. The brokers who enforce this every time are the ones sellers trust — and trust is the business.'],
    ],
  },
]

async function readAll(): Promise<Record<string, BlogPost>> {
  if (!svc) return {}
  const { data } = await svc.from('platform_settings').select('value').eq('key', SETTINGS_KEY).maybeSingle()
  const value = data?.value
  return value && typeof value === 'object' ? (value as Record<string, BlogPost>) : {}
}

async function writeAll(map: Record<string, BlogPost>): Promise<boolean> {
  if (!svc) return false
  const { error } = await svc.from('platform_settings').upsert({ key: SETTINGS_KEY, value: map }, { onConflict: 'key' })
  return !error
}

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)

/** Published posts, newest first — for the public hub. Seeds if empty. */
export async function listPublishedPosts(): Promise<BlogPost[]> {
  const all = await readAll()
  const posts = Object.values(all).filter((p) => p.published)
  if (posts.length > 0) {
    return posts.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  }
  // Never show an empty hub — fall back to the curated seed set.
  return [...SEED_POSTS].filter((p) => p.published).sort((a, b) => (b.date || '').localeCompare(a.date || ''))
}

/** All posts (including drafts) — for the broker dashboard. */
export async function listAllPosts(): Promise<BlogPost[]> {
  const all = await readAll()
  const posts = Object.values(all)
  return posts.length > 0 ? posts.sort((a, b) => (b.date || '').localeCompare(a.date || '')) : SEED_POSTS
}

/** One post by slug — for article pages. */
export async function getPostBySlug(slug: string): Promise<BlogPost | null> {
  const all = await readAll()
  if (all[slug]) return all[slug]
  return SEED_POSTS.find((p) => p.slug === slug) || null
}

/** Create or update a post. Returns { ok, slug?, error? }. */
export async function savePost(input: BlogPostInput): Promise<{ ok: boolean; slug?: string; error?: string }> {
  if (!svc) return { ok: false, error: 'Database is not configured' }
  const title = (input.title || '').trim()
  if (!title) return { ok: false, error: 'Title is required' }
  if (!Array.isArray(input.sections) || input.sections.length === 0) {
    return { ok: false, error: 'At least one section is required' }
  }
  for (const s of input.sections) {
    if (!Array.isArray(s) || s.length !== 2 || !String(s[0] || '').trim() || !String(s[1] || '').trim()) {
      return { ok: false, error: 'Each section needs a heading and body text' }
    }
  }
  const slug = slugify(input.slug || title)
  if (!slug) return { ok: false, error: 'Could not derive a slug' }

  const all = await readAll()
  const now = new Date().toISOString()
  all[slug] = {
    slug,
    title,
    excerpt: (input.excerpt || '').trim() || title,
    category: (input.category || '').trim() || 'Insights',
    read: (input.read || '').trim() || `${Math.max(2, Math.round(input.sections.join(' ').length / 1200))} min`,
    date: (input.date || '').trim() || now.slice(0, 10),
    published: input.published !== false,
    sections: input.sections.map(([h, b]) => [String(h).trim(), String(b).trim()]) as [string, string][],
    updated_at: now,
  }
  const ok = await writeAll(all)
  return ok ? { ok: true, slug } : { ok: false, error: 'Failed to save post' }
}

/** Delete a post by slug. Seeded posts are always re-derivable, so this is safe. */
export async function deletePost(slug: string): Promise<{ ok: boolean; error?: string }> {
  if (!svc) return { ok: false, error: 'Database is not configured' }
  if (!slug) return { ok: false, error: 'slug is required' }
  const all = await readAll()
  if (!(slug in all)) return { ok: true } // nothing stored — idempotent
  delete all[slug]
  const ok = await writeAll(all)
  return ok ? { ok: true } : { ok: false, error: 'Failed to delete post' }
}

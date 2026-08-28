# 🧪 QA ASSIGNMENT — Concord Deal Platform (Round 2)

**To:** QA Tester
**From:** EZ Business Advisors
**Date:** 2026-08-28
**Scope:** Full platform regression + new homepage features
**Test environment (LIVE):** https://ezbusinessadvisors.vercel.app
**⚠️ Do NOT use ezbusinessadvisors.com — it still points at an old placeholder host. Use the vercel.app URL above.**

---

## 1. How to report bugs

Every bug must include:
- URL (exact path)
- Step-by-step reproduction
- Expected vs actual result
- Screenshot
- Browser + device used

Priority labels: 🔴 Blocker / 🟠 Major / 🟡 Minor / ⚪ Cosmetic

---

## 2. Test accounts (all pre-created, verified live)

| Role | Email | Password |
|---|---|---|
| QA / EZ broker (admin) | `e2e.qa@concordplatform.dev` | `E2e!Test#2026#Concord` |
| Harbor owner | `harbor.owner@tenant.test` | `Tenant!Test#2026#Concord` |
| Harbor broker | `harbor.broker@tenant.test` | `Tenant!Test#2026#Concord` |
| Harbor agent | `harbor.agent@tenant.test` | `Tenant!Test#2026#Concord` |
| Harbor buyer | `harbor.buyer@tenant.test` | `Tenant!Test#2026#Concord` |
| Harbor seller | `harbor.seller@tenant.test` | `Tenant!Test#2026#Concord` |

**Payments:** Stripe TEST mode → card `4242 4242 4242 4242`, any future expiry / any CVC.

---

## 3. What's NEW this round (focus first)

1. **Homepage FAQ section** (`/`) — 6-question accordion, expands/collapses, renders on mobile
2. **FAQPage schema** — view-source should contain `FAQPage` JSON-LD
3. **og:image + Twitter card metadata** — homepage now has social preview meta
4. **White-label provisioning pipeline** (backend, verified) — admin white-label page still renders

---

## 4. FULL TEST MATRIX

### PART A — PUBLIC WEBSITE (no login)

**A1 Homepage — `/`**
- [ ] Hero loads, headline readable (white on navy), no layout shift
- [ ] Search bar works (type → results page)
- [ ] Stats count up: Businesses for Sale / Sold / Industries / Closed Deals
- [ ] Featured listings render
- [ ] NEW: FAQ section renders, all 6 questions expand/collapse
- [ ] All nav links render: Buy, Sell, BrokerAI, Our Brokers, Financing, Pre-Qualify, Professionals, Sale Comps, Recently Sold, Saved, Compare, About, Contact
- [ ] Footer: all links (legal, terms, privacy, DMCA, cookies, regulations, ownership) — no 404s

**A2 Pricing — `/pricing`**
- [ ] 3 tiers: Owner (Free), Professional ($499), Enterprise ($899)
- [ ] Monthly ↔ Annual toggle changes prices + savings line
- [ ] Limit chips (listings · seats) on each card
- [ ] MOST POPULAR badge on Professional
- [ ] Buyer Match Pass section ($49/$99)
- [ ] Own the CRM / License section ($4,999 + $499/mo)

**A3 Marketplace — `/marketplace/listings`**
- [ ] Listing cards render (photo, title, price, badges)
- [ ] Search by keyword
- [ ] Filters: industry, location, price — each works
- [ ] Sort (newest, price)
- [ ] Pagination / load-more
- [ ] Click card → detail page

**A4 Listing detail — `/marketplace/listings/[id]`**
- [ ] Hero image + fallback when missing
- [ ] Price, title, location, description, highlights
- [ ] Badges: 🛡️ Identity Verified · 📊 BOV on file · ✅ Verified Revenue · SBA · Financing
- [ ] "Request Confidential Details" → form → submits
- [ ] "Make an Offer" (active listings) → offer form
- [ ] 📞 Call button only when phone set
- [ ] Similar listings, market context, professionals panel
- [ ] Watchlist / save toggle

**A5 Sell — `/marketplace/sell`**
- [ ] "List Your Business — Free" (listing-first)
- [ ] Full form: name, email, phone, business name, industry, location, timeline, employees, revenue, asking, message
- [ ] Attestation checkbox REQUIRED (can't submit without)
- [ ] Submit → success screen
- [ ] 🎁 Launch Kit $399 upsell card on success → Stripe checkout
- [ ] 💎 $99 Valuation upsell card on form page
- [ ] Owner plan cards (Free / Renewal $50) selectable

**A6 Public tools**
- [ ] `/valuation` — instant valuation widget → email capture
- [ ] `/pnl-builder` — P&L recast builder → lead capture
- [ ] `/brokerai` — AI page renders
- [ ] `/marketplace/brokers` — broker directory
- [ ] `/marketplace/professionals` + `[id]` — directory + profile
- [ ] `/marketplace/comps` — sale comps
- [ ] `/marketplace/sold` — sold listings
- [ ] `/marketplace/qualify` — buyer pre-qualify
- [ ] `/marketplace/financing` — financing page
- [ ] `/marketplace/alerts`, `/compare`, `/favorites`, `/insights`, `/pulse`, `/industry`, `/location`, `/country`, `/guides/*`, `/reviews`, `/trust`, `/certified`, `/careers`, `/pocket`, `/buy`
- [ ] `/about`, `/contact` (form works), `/cbi`, `/license`, `/platform`
- [ ] `/flyer/[id]` — listing flyer (if id exists)

**A7 Legal** — `/terms`, `/legal/privacy`, `/legal/regulations`, `/legal/dmca`, `/legal/cookies`, `/legal/ownership` — all load, no broken links

**A8 Auth pages**
- [ ] `/auth` login — email + password, "Keep me signed in", forgot-password link
- [ ] Browser save-password prompt appears
- [ ] `/auth/signup` — name/email/password, persona choice (owner/buyer)
- [ ] Signup → email verification REQUIRED (check inbox, click link)
- [ ] `/auth/forgot-password` → sends reset email
- [ ] `/auth/reset-password` — new password flow works
- [ ] Password policy enforced (8+ chars, letter + number)

### PART B — OWNER / SELLER (trust flow)
1. Fresh signup → verify email → login
2. `/dashboard/owner` — portal loads
3. "Complete your profile": phone verify (SMS code) → photo upload → 🛡️ Identity verified banner
4. Create listing via `/marketplace/sell` (attestation ✓)
5. Dashboard shows listing + "Upload 3 years of financials"
6. Upload: established year + 3 revenues + PDF → AI verdict (auto-approved / broker review / rejected)
7. "Complete your listing" link → wizard (photos, details) → readiness rises
8. Reactivate → publish gate behavior (blocked messages clear)
9. Status buttons: Mark as Sold / Pause / Withdraw / Reactivate — each updates badge
10. Buyer inquiry appears in dashboard (🔔 counter)
11. Upgrade upsell links → `/pricing`

### PART C — BUYER
1. Login harbor.buyer → buyer dashboard
2. Browse, search, save listings
3. Submit inquiry on a listing → confirmation
4. Seller/broker receives inquiry (email + in-app notification)
5. Match Pass pricing visible

### PART D — AGENT (tenant CRM)
1. Login harbor.agent → CRM shell
2. Dashboard overview renders own agency data only
3. Deal Studio (`/dashboard/studio`) — full wizard: capture → verify → go-live
4. Create listing with photos/financials → submit
5. Publish OWN listing (works)
6. Publish ANOTHER agent's listing → 403
7. `/dashboard/listings/new` + `[id]` edit — work
8. Leads, pipeline, tasks scoped to self
9. **Isolation:** no EZ/QA listings ever visible

### PART E — BROKER / CRM (login e2e.qa or harbor.broker)

**E1 Command Center & Deals**
- [ ] `/dashboard` overview — stats, charts, recent activity
- [ ] `/dashboard/command-center` — team command view
- [ ] `/dashboard/pipeline` — deal pipeline (boards, stages, drag)
- [ ] `/dashboard/deal-doctor` — deal health analysis
- [ ] `/dashboard/deal-twin` — AI deal twin
- [ ] `/dashboard/offer-lab` — offer builder
- [ ] `/dashboard/closing` — closing tracker
- [ ] `/dashboard/loi` — letters of intent
- [ ] `/dashboard/negotiation` — negotiation tracker
- [ ] `/dashboard/due-diligence` (top-level `/due-diligence`) — DD items
- [ ] `/dashboard/escrow` (admin) — escrow tracking

**E2 Listings & Documents**
- [ ] `/dashboard/listings` (via studio) — list, filter, search
- [ ] Review queue `/dashboard/review-queue` — approve / reject / flag / unpublish
- [ ] `/dashboard/documents` — legal doc templates, send-for-signature
- [ ] `/dashboard/esign` — e-sign flow (both parties + witness)
- [ ] `/dashboard/data-room` + `/data-room-qa` — data room, folders, uploads
- [ ] `/dashboard/cim`, `/dashboard/bov`, `/dashboard/recast` — PDFs render
- [ ] `/dashboard/financial-files` — uploads, categories, recast preview
- [ ] `/dashboard/comps` — comps engine

**E3 Leads & CRM**
- [ ] `/dashboard/leads` — buyer leads, filters, pipeline
- [ ] `/dashboard/seller-leads` — seller intakes
- [ ] `/dashboard/lead-marketplace` — lead marketplace
- [ ] `/dashboard/nda-requests` — NDA requests + signing
- [ ] `/dashboard/reminders`, `/notifications`, `/communications`, `/email-templates`
- [ ] `/dashboard/nurture`, `/autopilot` — automation rules
- [ ] `/dashboard/activity` — activity feed
- [ ] `/dashboard/visitor-intent` — visitor signals
- [ ] `/dashboard/watchlist`, `/social`, `/calendar`, `/calls`, `/call-summaries`

**E4 Team & Agency**
- [ ] `/dashboard/agency/settings` — agency settings, branding
- [ ] `/dashboard/agents` — manage agents
- [ ] `/dashboard/team` — roles/permissions (invite agent flow)
- [ ] `/dashboard/security` — security settings
- [ ] `/dashboard/performance` — team performance
- [ ] `/dashboard/commissions`, `/expenses`, `/hiring`, `/certificates`, `/certified-brokers`
- [ ] `/dashboard/professionals` — referral professionals (fee fields)
- [ ] `/dashboard/referrals` — referral tracking

**E5 Intelligence & AI**
- [ ] `/dashboard/intelligence` — AI intelligence hub
- [ ] `/dashboard/listing-advisor` — listing AI advisor
- [ ] `/dashboard/ai` — AI settings/tools
- [ ] `/dashboard/training` — CBI training modules + progress
- [ ] `/dashboard/readiness` — listing readiness scores
- [ ] `/dashboard/red-flags` — red-flag detection
- [ ] `/dashboard/valuation` + `/valuation-reports` — valuations + reports
- [ ] `/dashboard/syndication`, `/marketing`, `/newspaper`, `/expiry`, `/off-market`, `/portal`, `/onboarding`, `/tools`, `/search`, `/passwords`, `/profile`, `/settings`, `/buyer`, `/owner`, `/analytics`, `/blog`, `/agents`

### PART F — ADMIN (e2e.qa — confirm platform-admin access)
- [ ] `/admin` dashboard
- [ ] `/admin/listings` — moderation, flag reasons, approve/reject
- [ ] `/admin/users` — user management
- [ ] `/admin/agencies` — agencies
- [ ] `/admin/money` — revenue
- [ ] `/admin/marketplace-health` — health metrics
- [ ] `/admin/white-label` — tenant branding manager
- [ ] `/admin/api-keys`, `/audit`, `/ads`, `/ai`, `/analytics`, `/commission-tracker`, `/escrow`, `/expenses`, `/legal-vault`, `/search`, `/trial-settings`, `/1099`
- [ ] Admin APIs: `/api/admin/*` require auth + platform-admin (403 for others)

### PART G — PAYMENTS (test card 4242 — every product)
- [ ] Professional $499 subscription → checkout → webhook → status active
- [ ] Enterprise $899
- [ ] License $4,999 + $499/mo
- [ ] $99 Valuation/BOV → 📊 BOV on file badge appears
- [ ] $399 Launch Kit
- [ ] Featured $149 / $349
- [ ] Verified Revenue $199
- [ ] Financial Intelligence $100/mo
- [ ] Match Pass $49/$99
- [ ] Owner renewal $50
- [ ] Cancel/refund paths

### PART H — SECURITY / TRUST (spot checks)
- [ ] Unconfirmed email cannot log in
- [ ] Owner A cannot modify Owner B's listing (403)
- [ ] OTP: 5 wrong codes → locked
- [ ] Inquiry flood → rate limited (429)
- [ ] Upload rejects non-image / oversized
- [ ] Bank statements / CIM / BOV not publicly readable (signed URLs)
- [ ] Force-publish as non-member → 403
- [ ] Stripe webhook forged signature → 400
- [ ] Cross-tenant isolation (Harbor vs EZ) everywhere

### PART I — MOBILE & EDGE CASES
- [ ] All key pages usable at 375px width
- [ ] No horizontal scroll, no invisible text
- [ ] Header brand: "DEAL PLATFORM" default; agency brand on tenant domain
- [ ] Empty states (no listings, no leads) render nicely
- [ ] 404 page (`/nonexistent-page`) — styled, not broken
- [ ] Loading states on slow network
- [ ] Back/forward navigation works
- [ ] Forms: validation errors clear, double-submit prevented
- [ ] All external links open correctly

---

## 5. Known notes for QA

- Phone OTP sends a REAL SMS on live — use a real number.
- Email verification links are real — check inbox (incl. spam).
- Harbor tenant = multi-tenant isolation scenario (the "sold CRM" case).
- `/dashboard/listings` index intentionally absent (use Studio); `/dashboard/agency/settings` → check correct slug.
- `harbor.seller@tenant.test` currently has role `buyer` in DB — flagged to platform owner; if seller flows are required, use a fresh signup.
- All 786 unit tests + persona E2E suites are green — this is the human polish/feel pass.

---

## 6. Deliverables

1. Bug list (format in section 1), sorted by priority
2. A short summary: what's ready to ship, what needs fixing before launch
3. Any UX/design observations (not bugs, just "this felt off")

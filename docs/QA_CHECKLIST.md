# 🧪 Concord Deal Platform — EXHAUSTIVE QA Checklist (Human Tester)

**Test environment (LIVE):** https://ezbusinessadvisors.vercel.app
**Browsers:** Chrome desktop + phone (Safari/Chrome mobile) + incognito
**Record:** every bug with URL, step, expected vs actual, screenshot

---

## 🔑 Test Accounts (all pre-created)
| Role | Email | Password |
|---|---|---|
| QA / EZ broker | `e2e.qa@concordplatform.dev` | `E2e!Test#2026#Concord` |
| Harbor owner | `harbor.owner@tenant.test` | `Tenant!Test#2026#Concord` |
| Harbor broker | `harbor.broker@tenant.test` | `Tenant!Test#2026#Concord` |
| Harbor agent | `harbor.agent@tenant.test` | `Tenant!Test#2026#Concord` |
| Harbor buyer | `harbor.buyer@tenant.test` | `Tenant!Test#2026#Concord` |
| Harbor seller | `harbor.seller@tenant.test` | `Tenant!Test#2026#Concord` |

**Payments:** Stripe TEST mode → card `4242 4242 4242 4242`, any future date/CVC.

---

## PART A — PUBLIC WEBSITE (no login)

### A1 Homepage — `/`
- [ ] Hero loads, headline readable (white on navy)
- [ ] Search bar works (type → results)
- [ ] Stats count up: Businesses for Sale / Sold / Industries / Closed Deals
- [ ] Featured listings carousel scrolls
- [ ] All nav links render: Buy, Sell, BrokerAI, Our Brokers, Financing, Pre-Qualify, Professionals, Sale Comps, Recently Sold, Saved, Compare, About, Contact
- [ ] Footer: all links (legal, terms, privacy, DMCA, cookies, regulations, ownership) — no 404s

### A2 Pricing — `/pricing`
- [ ] 3 tiers: Owner (Free), Professional ($499), Enterprise ($899)
- [ ] Monthly ↔ Annual toggle changes prices + savings line
- [ ] Limit chips (listings · seats) on each card
- [ ] MOST POPULAR badge on Professional
- [ ] Buyer Match Pass section ($49/$99)
- [ ] Own the CRM / License section ($4,999 + $499/mo)
- [ ] Headline visible (contrast fix)

### A3 Marketplace — `/marketplace/listings`
- [ ] Listing cards render (photo, title, price, badges)
- [ ] Search by keyword
- [ ] Filters: industry, location, price — each works
- [ ] Sort (newest, price, etc.)
- [ ] Pagination / load-more
- [ ] Click card → detail page

### A4 Listing detail — `/marketplace/listings/[id]`
- [ ] Hero image + fallback when missing
- [ ] Price, title, location, description, highlights
- [ ] Badges: 🛡️ Identity Verified · 📊 BOV on file · ✅ Verified Revenue · SBA · Financing
- [ ] "Request Confidential Details" → form → submits
- [ ] "Make an Offer" (active listings) → offer form
- [ ] 📞 Call button only when phone set
- [ ] Similar listings, market context, professionals panel
- [ ] Watchlist / save toggle

### A5 Sell — `/marketplace/sell`
- [ ] "List Your Business — Free" (listing-first, not valuation-first)
- [ ] Full form: name, email, phone, business name, industry, location, timeline, employees, revenue, asking, message
- [ ] Attestation checkbox REQUIRED (can't submit without)
- [ ] Submit → success screen
- [ ] 🎁 Launch Kit $399 upsell card on success → Stripe checkout
- [ ] 💎 $99 Valuation upsell card on the form page
- [ ] Owner plan cards (Free / Renewal $50) selectable

### A6 Public tools
- [ ] `/valuation` — instant valuation widget → email capture
- [ ] `/pnl-builder` — P&L recast builder → lead capture
- [ ] `/brokerai` — AI page renders
- [ ] `/marketplace/brokers` — broker directory
- [ ] `/marketplace/professionals` + `/marketplace/professionals/[id]` — directory + profile
- [ ] `/marketplace/comps` — sale comps, `/marketplace/sold` — sold listings
- [ ] `/marketplace/qualify` — buyer pre-qualify
- [ ] `/marketplace/financing` — financing page
- [ ] `/marketplace/alerts`, `/compare`, `/favorites`, `/insights`, `/pulse`, `/industry`, `/location`, `/country`, `/guides/*`, `/reviews`, `/trust`, `/certified`, `/careers`, `/pocket`, `/buy`
- [ ] `/about`, `/contact` (form works), `/cbi`, `/license`, `/platform`
- [ ] `/flyer/[id]` — listing flyer (if id exists)

### A7 Legal — `/terms`, `/legal/privacy`, `/legal/regulations`, `/legal/dmca`, `/legal/cookies`, `/legal/ownership`
- [ ] All load, no broken links, sensible content

### A8 Auth pages
- [ ] `/auth` login — email + password, "Keep me signed in" checkbox, forgot-password link
- [ ] Login auto-fill (browser save-password prompt appears)
- [ ] `/auth/signup` — name/email/password, persona choice (owner/buyer)
- [ ] Signup → email verification REQUIRED (check inbox, click link)
- [ ] `/auth/forgot-password` → sends reset email
- [ ] `/auth/reset-password` — new password flow works
- [ ] Password policy enforced (8+ chars, letter + number)

---

## PART B — OWNER / SELLER (trust flow)

1. Fresh signup → verify email → login
2. `/dashboard/owner` — portal loads
3. "Complete your profile": phone verify (SMS code) → photo upload → 🛡️ Identity verified banner
4. Create listing via `/marketplace/sell` (attestation ✓)
5. Dashboard shows listing + "Upload 3 years of financials"
6. Upload: established year + 3 revenues + PDF → AI verdict shown (auto-approved / broker review / rejected)
7. "Complete your listing" link → wizard (photos, details) → readiness rises
8. Reactivate → publish gate behavior (blocked messages clear)
9. Status buttons: Mark as Sold / Pause / Withdraw / Reactivate — each updates badge
10. Buyer inquiry appears in dashboard (🔔 counter)
11. Upgrade upsell links (Professional $499 / Enterprise $899) → `/pricing`

---

## PART C — BUYER
1. Login harbor.buyer → buyer dashboard
2. Browse, search, save listings
3. Submit inquiry on a listing → confirmation
4. Seller/broker receives inquiry (email + in-app notification)
5. Match Pass pricing visible

---

## PART D — AGENT (tenant CRM)
1. Login harbor.agent → CRM shell
2. Dashboard overview renders own agency data only
3. Deal Studio (`/dashboard/studio`) — full wizard: capture → verify → go-live
4. Create listing with photos/financials → submit
5. Publish OWN listing (works)
6. Publish ANOTHER agent's listing → 403
7. `/dashboard/listings/new` + `[id]` edit — work
8. Leads, pipeline, tasks scoped to self
9. **Isolation:** no EZ/QA listings ever visible

---

## PART E — BROKER / CRM (login e2e.qa or harbor.broker)

### E1 Command Center & Deals
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

### E2 Listings & Documents
- [ ] `/dashboard/listings` (via studio) — list, filter, search
- [ ] Review queue `/dashboard/review-queue` — approve / reject / flag / unpublish
- [ ] `/dashboard/documents` — legal doc templates, send-for-signature
- [ ] `/dashboard/esign` — e-sign flow (both parties + witness)
- [ ] `/dashboard/data-room` + `/data-room-qa` — data room, folders, uploads
- [ ] `/dashboard/cim`, `/dashboard/bov`, `/dashboard/recast` — document generation (PDFs render)
- [ ] `/dashboard/financial-files` — uploads, categories, recast preview
- [ ] `/dashboard/comps` — comps engine

### E3 Leads & CRM
- [ ] `/dashboard/leads` — buyer leads, filters, pipeline
- [ ] `/dashboard/seller-leads` — seller intakes
- [ ] `/dashboard/lead-marketplace` — lead marketplace
- [ ] `/dashboard/nda-requests` — NDA requests + signing
- [ ] `/dashboard/reminders`, `/dashboard/notifications`, `/dashboard/communications`, `/dashboard/email-templates`
- [ ] `/dashboard/nurture`, `/dashboard/autopilot` — automation rules
- [ ] `/dashboard/activity` — activity feed
- [ ] `/dashboard/visitor-intent` — visitor signals
- [ ] `/dashboard/watchlist`, `/dashboard/social`, `/dashboard/calendar`, `/dashboard/calls`, `/dashboard/call-summaries`

### E4 Team & Agency
- [ ] `/dashboard/agency/settings` — agency settings, branding
- [ ] `/dashboard/agents` — manage agents
- [ ] `/dashboard/team` — roles/permissions (invite agent flow)
- [ ] `/dashboard/security` — security settings
- [ ] `/dashboard/performance` — team performance
- [ ] `/dashboard/commissions`, `/dashboard/expenses`, `/dashboard/hiring`, `/dashboard/certificates`, `/dashboard/certified-brokers`
- [ ] `/dashboard/professionals` — referral professionals (fee fields)
- [ ] `/dashboard/referrals` — referral tracking

### E5 Intelligence & AI
- [ ] `/dashboard/intelligence` — AI intelligence hub
- [ ] `/dashboard/listing-advisor` — listing AI advisor
- [ ] `/dashboard/ai` — AI settings/tools
- [ ] `/dashboard/training` — CBI training modules + progress
- [ ] `/dashboard/readiness` — listing readiness scores
- [ ] `/dashboard/red-flags` — red-flag detection
- [ ] `/dashboard/valuation` + `/valuation-reports` — valuations + reports
- [ ] `/dashboard/syndication`, `/dashboard/marketing`, `/dashboard/newspaper`, `/dashboard/expiry`, `/dashboard/off-market`, `/dashboard/portal`, `/dashboard/onboarding`, `/dashboard/tools`, `/dashboard/search`, `/dashboard/passwords`, `/dashboard/profile`, `/dashboard/settings`, `/dashboard/buyer`, `/dashboard/owner`, `/dashboard/analytics`, `/dashboard/blog`, `/dashboard/agents`

---

## PART F — ADMIN (e2e.qa has platform-admin?)
- [ ] `/admin` dashboard
- [ ] `/admin/listings` — moderation, flag reasons, approve/reject
- [ ] `/admin/users` — user management
- [ ] `/admin/agencies` — agencies
- [ ] `/admin/money` — revenue
- [ ] `/admin/marketplace-health` — health metrics
- [ ] `/admin/white-label` — tenant branding manager
- [ ] `/admin/api-keys`, `/admin/audit`, `/admin/ads`, `/admin/ai`, `/admin/analytics`, `/admin/commission-tracker`, `/admin/escrow`, `/admin/expenses`, `/admin/legal-vault`, `/admin/search`, `/admin/trial-settings`, `/admin/1099`
- [ ] Admin APIs: `/api/admin/*` require auth + platform-admin (403 for others)

---

## PART G — PAYMENTS (test card 4242 — every product)
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

---

## PART H — SECURITY / TRUST (spot checks)
- [ ] Unconfirmed email cannot log in
- [ ] Owner A cannot modify Owner B's listing (403)
- [ ] OTP: 5 wrong codes → locked
- [ ] Inquiry flood → rate limited (429)
- [ ] Upload rejects non-image / oversized
- [ ] Bank statements / CIM / BOV not publicly readable (signed URLs)
- [ ] Force-publish as non-member → 403
- [ ] Stripe webhook forged signature → 400
- [ ] Cross-tenant isolation (Harbor vs EZ) everywhere

---

## PART I — MOBILE & EDGE CASES
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

## ✅ KNOWN NOTES
- Phone OTP sends a REAL SMS on live — use a real number.
- Email verification links are real — check inbox (incl. spam).
- Harbor tenant = multi-tenant isolation scenario (the "sold CRM" case).
- `/dashboard/listings` index intentionally absent (use Studio); `/dashboard/agency/settings` → check correct slug.
- Everything automated-tested green (786 unit tests + persona e2e suites); this is the human polish/feel pass.

---

# 🔁 ROUND 2 — 2026-08-28 evening (post-deploy regression pass)

**⚠️ IMPORTANT — USE THIS URL:** https://ezbusinessadvisors.vercel.app
**(`ezbusinessadvisors.com` still points at an old placeholder host — do NOT test there; domain cutover pending.)**

## What changed since Round 1 (focus these)
1. **Homepage rebuilt sections** — `/` now has: FAQ accordion (6 Qs), FAQPage schema, og:image + Twitter card meta.
   - [ ] Homepage loads at vercel.app URL, FAQ section renders + expands, no console errors
   - [ ] View-source contains `FAQPage` JSON-LD
2. **White-label provisioning pipeline** (backend — no UI change):
   - Fresh tenant stacks now build complete CRMs (205 tables, 539 RLS policies) from `sql/base_schema.sql`
   - No QA action needed unless you want to test `/admin/white-label` still renders.

## Round 1 still-applicable quick pass (10 min)
- [ ] Homepage hero + search + stats count-up
- [ ] Marketplace listing card → detail → NDA/offer buttons
- [ ] Login as `e2e.qa@concordplatform.dev` → dashboard loads
- [ ] Login as `harbor.buyer@tenant.test` → tenant isolation (no EZ data)
- [ ] Stripe test checkout (`4242 4242 4242 4242`) on any paid product → status updates

## Known notes for this round
- Phone OTP sends REAL SMS — use a real number.
- `harbor.seller@tenant.test` currently has role `buyer` in DB (flagged — verify intent).
- `e2e.qa@concordplatform.dev` has role `owner` (platform admin check — confirm `/admin` access).
- All 786 unit tests + persona E2E suites green; this is the human polish pass.

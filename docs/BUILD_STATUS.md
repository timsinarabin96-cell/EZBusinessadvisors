# BUILD_STATUS.md — Concord Deal Platform

> **The reference doc.** Every feature/module, its status, and the commit that shipped it.
> Rabin shares this when planning next steps so nothing gets duplicated or re-audited.
>
> **Status legend:** ✅ done · 🟡 partial (works but has a known gap) · ❌ not built / open
>
> **Maintenance rule:** update this file in the same commit as any completed feature work.
> Latest full-suite baseline: **965/965 unit tests green, typecheck clean** (2026-08-31, after migration runner + advisor-routing hook).
> Live DB: Supabase project `ytcvlvisufxmmzeblmwx` · Deployed: Vercel `ezbusinessadvisors.vercel.app`

---

## 1. Financial Engine (Gate 1 + Gate 2)

| Feature | Status | Commit |
|---|---|---|
| One financial engine, validated before generation — SDE = NI + Σ(itemized) only; double-count lock | ✅ | `823d87a` |
| Recast consistency invariant checked INSIDE engine (`assertRecastConsistency`) | ✅ | `823d87a` |
| Missing categories surfaced for broker review (never silently folded) | ✅ | `823d87a` |
| Doc-delivery send-path validation (recast validated before PDF/email/Deal Room) | ✅ | `823d87a` + `7510965` |
| Gate 2: document ingestion on Anthropic SDK, sourced line items (document/page/line) | ✅ | `f6574af` |
| Extraction review/override flow (`financial_extractions` → approved/broker_override) | ✅ | `ca7338d` |
| Reconciliation follow-up loop — targeted questions, never silent estimates | ✅ | `23c8075` |
| Multi-year universal financial doc reader (P&L, tax returns, bank statements, POS, billing) | ✅ | `60291dc` |
| Bank-vs-books verification + accuracy interview | ✅ | `dc20b2e` (FIC Phase 3) |
| FIC add-on gate enforced server-side + dashboard lock/upgrade CTA | ✅ | `5e4e565`, `4de5b99` |
| Recast AI add-back suggestions (DeepSeek pass) | ✅ | `10d5cf2`, `59988b0` |
| Red-flag forensics / recast anomaly detection | ✅ | `9d915f8` |
| Plaid-verified financials (link + exchange APIs) | ✅ | `b1e33cc` |
| Auto-generation pipeline (Recast/BOV/CIM/BLI one-click) | ✅ | `1632bd6` |
| BOV 10+ page, 12-section investment-bank quality | ✅ | `520d04d` |
| BOV liability label gate — status-driven title, agent finalize, reviewer trail | ✅ | `969f8ca` |
| CIM/BOV/recast premium-quality sample outputs verified (PDF text-level) | ✅ | `61e253d` |
| Rendered-output verification harness (`scripts/sample-deliverables.mts`) | ✅ | `61e253d` |
| Recast question generator (Item 1) — FROZEN until Gates 1+2 verified across 2–3 industries | ❌ frozen | — |
| Intake call profile (Item 2) — same freeze | ❌ frozen | — |

## 2. Listing Flow

| Feature | Status | Commit |
|---|---|---|
| One-Shot Deal Builder (single input → streaming pipeline → review → Go Live) | ✅ | `3c9a1c6` |
| Auto-Build Deal pipeline (paste notes/drop docs → full listing) | ✅ | `7a03dee`, `a342c79` |
| Build observability — stage trail, completion pings, dashboard widget | ✅ | `5f37b9d`, `0762946` |
| P0 reliability — AI retry armor, interrupted-build resume, stage persistence | ✅ | `421e848` |
| Save-partial-draft flow + resume (`?listing=` deep link + sessionStorage) | ✅ | `7bc0f55`, `97bd355`, `4152caa` |
| P1 trust — smart red flags, human confirm gate, per-figure sources, inline edit | ✅ | `053ff38` |
| P2 speed — parallelized build stages | ✅ | `053ff38` |
| P3 UX — example notes, draft state badges (⏳/⏸/⚠️/✅ + Resume) | ✅ | `053ff38` |
| Auto-save at interview-transcript level (every answer persisted) | ✅ | `d17149a` + `4866e2b` |
| Multi-listing for agents — no one-at-a-time restriction (free seller tier only caps 1) | ✅ | audit 08-31 |
| Listing status pipeline — `draft/active/pending_sale/under_contract/sold/withdrawn` | ✅ | baseline |
| Crash-proof auto-save (localStorage backup + restore + flush-on-close) | ✅ | `536bc5c`, `cc39281` |
| AI Concierge → AI Deal Studio (13-advance waves 1–3: voice intake, photo AI, comps, buyers, syndication, offer intel) | ✅ | `964d2c5`, `795cad6`, `8769bcc`, `1d94494` |
| AI Advisor Interview (conversational Claude intake, deterministic fallback) | ✅ | `d17149a` |
| Seller tiers — free (manual/self-reported) vs paid (AI, AI-Verified) | ✅ | `4866e2b` |
| Advance-to-Listing (recast+BOV+CIM in one action, reconciliation invariant) | ✅ | `4866e2b` |
| Intake migration — single AI intake surface, old intake route deleted | ✅ | `4866e2b`, `de36d11` |
| Readiness engine + publish gate | ✅ | `b8061b0` |
| Listing Legitimacy Gate (anti-scam / anti-premature) | ✅ | `a63bb5d` |
| Preventative AI risk gate on go-live + risk report in publish response | ✅ | `d986996`, `841bc7b` |
| Force-publish = audited exception: reason REQUIRED, bypassed gates recorded, compliance owner notified | ✅ | `e7670e8` |
| Legal gate — signed-status legal checklist (Marketing Agreement + LLC Resolution) | ✅ | `08fa085`, `46a8751` |
| Stale-listing intelligence (deal doctor for listings) | ✅ | `08f5d30` |
| Stale-draft nudge — parked drafts untouched 7d+ reuse stale-deal pattern + deduped agent notification | ✅ | `ff6dc03` |
| Listing expiry + auto-renewal machine (30-day proposals, one-click renew) — **FIC Item 3 verified** | ✅ | `ce3f72a`, `25cb893` |
| Walkthrough video support (video_url + player) | ✅ | `3d3c2ac`, `50f5307` |
| Human-readable listing IDs + seller call-back reminders | ✅ | `25cb893` |
| Duplicate-listing guard + dedupe | ✅ | `1567e1c`, `aaa9f13` |
| Off-Market Deal Room (per-card clear, retrieval) | ✅ | `97bd355` |
| AI Listing Copilot (chat agent inside listing workflow) | ✅ | `fcdd504` |
| Listing Advisor (docs in → questions out, worth + listability + CIM prep) | ✅ | `7a9bb8f` |
| Post-create redirect bug fix (`/dashboard/listings` 404 → `/listings`) | ✅ | `ff6dc03` |

## 3. Buyer Flow

| Feature | Status | Commit |
|---|---|---|
| Billion-dollar public marketplace (homepage, about, contact, broker profiles, NDA-gated financials) | ✅ | `a903e2e` |
| Advanced filters, listing badges, zero-token AI search | ✅ | `aadb511` |
| Buyer toolkit — favorites, compare, saved alerts, AI match scores | ✅ | `0cdd750` |
| Self-service buyer accounts (signup persona, match profile, matches feed) | ✅ | `0d7e15f` |
| Qualify → NDA → Auto-sign → Archive funnel (5-question gate, scored) | ✅ | `055191c` |
| NDA signers auto-become CRM buyer leads + Match Pass upsell at unlock moment | ✅ | `c3dcb51`, `1311efb` |
| Match Pass portal (promised toolkit) | ✅ | `21e35ad` |
| Listing-to-buyer auto-matching (+ financials/business-type capture) | ✅ | `dc35f48` |
| Deal Radar — auto-match buyers on publish, alert top fits | ✅ | `af67629` |
| Instant buyer underwriting — pre-qualification + badges | ✅ | `88519e1` |
| Buyer DD uploads gated to due-diligence stage only | ✅ | `c08204f` |
| Buyer pipeline CRM — kanban, heat, NQA, auto-log, competitive board | ✅ | `497b653` |
| Offer Lab / offer compare + closing runway + cost estimator (Wave B) | ✅ | `0e2d6a1` |
| LOI lifecycle — preview, 48h no-signature auto-nudge | ✅ | `b8ea220`, `f30fc83` |
| Deal Room 2.0 — two-sided fillable agreements, invite/revoke, ZIP export, change alerts; **FIC Item 4 verified** (closingTracker `STAGE_TEMPLATES`/`loadStageTemplate` + DD folder template seeding) | ✅ | `5a3bc5a`, `2389ef4` |
| Buyer/seller deal progress tracker in portal | ✅ | `4dfb260` |
| Client portal — token-gated, milestones, docs, DD upload, broker chat | ✅ | `287d3af` |
| Proof of Funds (buyer pack) | ✅ | `13e4e6d` |
| Visitor intent tracking (see the anonymous 90%) → lead linkage | ✅ | `a88d948`, `6e5167f` |
| Scam detection backend (visible trust badge for buyers) | ⚠️ **needs Rabin directly** — surfacing requires a live public-feed RPC change (`get_public_listing_feed` + legitimacy_verdict) + a product call on what buyers see; not applied unsupervised | PUNCHLIST |

## 4. Legal / e-Sign

| Feature | Status | Commit |
|---|---|---|
| Send-for-signature — accountless signing links, public sign page, rate-limited | ✅ | `fd24c97` |
| eSign: DocuSign + HelloSign integration with graceful in-app fallback | ✅ | `4e33a74` |
| Legal pack — 25 templates, agency letterhead, broker/agent signature blocks | ✅ | `0d2c8b3`, `6bcf6df`, `e154bac` |
| Original Transworld-style NDA (prospect info box, PA statutory protection, agent-name signing) | ✅ | `5dab328`, `e154bac` |
| Listing Agreement eSign gate + disclosures + NDA uploads (LegalDocsCard) | ✅ | `055191c`, `928296a` |
| Legal checklist (configurable, never zeroable) + unified buyer NDA | ✅ | `46a8751`, `08fa085` |
| AI document import — upload original → AI finds blanks → fillable template | ✅ | `6d2aa91` |
| Agency template library + platform fallback | ✅ | `6d2aa91`, `9e23b78` |
| Signed-pack PDF export (one notarization-ready bundle) | ✅ | `bc846d3` |
| Compliance layer — disclaimers + state regulations + jurisdiction gate in publish | ✅ | `426d916`, `e3ab6ee` |
| License attestation — brokers declare licensed states | ✅ | `4be45dc` |
| Seller Pack — Financial Authorization + auto listing expiration on agreement gen | ✅ | `13e4e6d`, `f091773` |
| Agency signing-identity settings (NDA auto-sign name/title/signature) | ✅ | `88910e2`, `aa787b5` |
| Fillable document builder (templates/documents/signatures/audit) + Legal Vault | ✅ | `6514bd1`, `296a2c1` |

## 5. CRM (agency platform)

| Feature | Status | Commit |
|---|---|---|
| Deal Pipeline — kanban + buyer funnel + expected-close $ + scorecards + next-best-action | ✅ | `497b653`, `eb479e8`, `2425032` |
| Deal Doctor — probability-of-close scoring | ✅ | `d2215a5` |
| Deal Twin — health history, what-changed diff | ✅ | `cf39a78`, `1d3b57b` |
| Leads hub — duplicate detection/merge, source tracking, hot/warm/cold heat, quick actions | ✅ | `aaa9f13`, `05bf5b6`, `739260f` |
| Unified lead timeline + conversation log | ✅ | `5ad66ca`, `db6deb2` |
| Communications log + stale-deal nudges + email template library | ✅ | `3a2e5d9` |
| Universal reminders (any entity) + snooze 1h/1d | ✅ | `6556594`, `e7b5b15` |
| Follow-up engine + one-click turn action items into reminders | ✅ | `c450143`, `4572046` |
| Caller ID Intelligence + Call Log + missed-call callbacks + ownership routing | ✅ | `2e977c8`, `a2040ee` |
| Deal Time calendar — appointments + tasks + auto-deadlines + stage coloring | ✅ | `2c96bed`, `40fc397`, `1fdc1a5` |
| AI Daily Briefing + team round-robin + Captain's Brief | ✅ | `1fdc1a5`, `b531488`, `f4dff84` |
| Commissions — 50/50 split, auto-record on close, waterfall chart, per-deal economics | ✅ | `5bc6f61`, `41116c1`, `9aa59f2` |
| Expenses — AI-automated cost center, CSV import, QuickBooks export, 1099-NEC tracking | ✅ | `df85493`, `dbc1abb`, `76f095d`, `a074c98` |
| Closing & Escrow Tracker (milestones + escrow accounts, agency-scoped RLS) | ✅ | batch 08-22 |
| Success-fee escrow workflow → released fee → 1099 | ✅ | `6a133ac` |
| Co-brokerage syndication network (offers, inbox/outbox, auto-split commissions) | ✅ | `0e933a0` |
| Referrals — ledger, reward tracking, partner portal link, CSV export | ✅ | `ce000c2`, `3517dae`, `e0a4adb` |
| Nurture — drip pipeline, A/B subject variants | ✅ | `7ab7eb6`, `4ca308e` |
| Social — posting service, OAuth, Caption Studio, best-time heuristic | ✅ | `2c49309`, `244bdf8`, `6a9a58b` |
| Weekly Newspaper — auto-generation + cron email distribution | ✅ | `31adf08`, `882bed6` |
| Marketing Materials Store — orders, Stripe, auto-routed supplier work orders, print-ready PDFs | ✅ | `e8a00f6`, `641207a`, `63cbeb8`, `50b39b6` |
| Professionals directory (lawyers, CPAs, QoE agents, lenders) + referral fees | ✅ | `35a3650`, `3d29035` |
| Lead marketplace (cross-agency B2B2C) — tier badges, per-lead pricing | ✅ | `bb4192b`, `fcccc78`, `8473f91` |
| Admin control plane — kill-switch, audit log, moderation queue, money ops, CSV import | ✅ | `4d3d9ac`, `a781f13`, `98f1430` |
| Analytics — pipeline/funnel/revenue/broker charts, MoM/YoY, CSV export | ✅ | `8a47d00` |
| Activity feed + notifications hub + quiet hours + digest controls | ✅ | `88790cb`, `5260e5d`, `940f765` |
| Web push notifications (VAPID, SW handler) | ✅ | `2cc0df9`, `0c306f8` |
| Supabase Realtime live updates (LiveFeed) | ✅ | `5e611e8` |
| Search & Alerts hub — cross-entity FTS, saved searches, watchlist email alerts | ✅ | `9a381e2`, `312671a` |
| Email system — 8+ templates, digest, hourly digest, Microsoft Graph delivery | ✅ | `41d7f7c`, `2088ff9`, `f5c4581` |
| SMS via A2P messaging service | ✅ | `f379a39` |
| Negotiation — timeline, BATNA guidance, auto-log strategies | ✅ | `20de298`, `59dc3c7` |
| Training Center + CBI 2.0 — AI tutor, gamification, deal simulator, certification gate, certificates | ✅ | `79c98d0`, `920065f`, `19619fe`, `f959a50`, `a653aca` |
| Onboarding — AI-controlled login activation, guided week-long setup | ✅ | `38ff4a4`, `79c98d0` |
| Business cards — QR contact save, photos, back text, print flyer | ✅ | `fe5a236`, `9c6167b` |
| AI cockpit — 7 tools as tabs, chat console, marketing copy | ✅ | `62a9b32`, `6930969` |
| AI chat widget — server-side DeepSeek replies | ✅ | `d8a796d`, `84399f8` |
| Nav — Cmd+K palette, core sidebar, collapsible groups, 35→ nav consolidation | ✅ | `125b70e`, `ece10b9` |
| White-label agency branding + custom-domain theming | ✅ | `627ed3e`, `2cb009c` |
| Free-tier advisor-routing UI hook (decline → "work with licensed advisor" lead) | ✅ | advisor-routing commit (`advisorRouting` flag consumed: interview 403/GET carries it, modal shows AdvisorRoutingCard, `/api/advisor/routing` captures seller lead + notifies) |

## 6. Photos

| Feature | Status | Commit |
|---|---|---|
| Photo rebuild — Claude writes prompt from REAL listing detail + interview answers | ✅ | `c3eb7bd` |
| Unified picker — "Upload your own" + "Generate options" side by side, mix both | ✅ | `c3eb7bd` |
| Cover/primary photo marking (⭐ star, reorder, `primary_image_url`) | ✅ | `c3eb7bd` |
| Upload route — validated (JPG/PNG/WebP/HEIC, 10MB), first upload auto-cover | ✅ | `c3eb7bd` |
| Provider ladder — **FAL (confirmed 08-31) → OpenAI → free Pollinations fallback** | ✅ | `c3eb7bd` + ladder reorder |
| Old AI-only AiPhotoStudioCard deleted (replace, don't run both) | ✅ | `c3eb7bd` |
| Photo API key — **needs boss to add `FAL_KEY`** (falls back to Pollinations free until then) | ❌ open | — |

## 7. Public Website

| Feature | Status | Commit |
|---|---|---|
| Billion-dollar redesign — dark aurora heroes, grad-gold headlines, emoji design system | ✅ | `c2de7e7`, `35418fd` |
| Premium listing detail page (conversion page) | ✅ | `5155648` |
| Seller + deal portals premium pass | ✅ | `21ea184` |
| Marketplace 3D redesign + glassmorphism search + live stats | ✅ | `49d8a5d`, `0b43f13` |
| Advanced filter panel — SDE/EBITDA/revenue ranges, verified badges | ✅ | `2c65c96` |
| SEO — sitemap depth, industry/location/city pages, FAQ schema, breadcrumbs, insights blog | ✅ | `9f24e56`, `67d6555`, `e06e3e9`, `0437932`, `6bd3e7c` |
| Market Pulse data page — live multiples, prices, days-to-sell by industry/state | ✅ | `cddb3d4` |
| Public sold-comps market data (Zillow-for-businesses) | ✅ | `4b2b897` |
| Valuation lead magnet — auto-branded PDF on intake + free market-report PDF | ✅ | `6d1aae9`, `0be10bc` |
| SBA 7(a) calculator + quick eligibility quiz | ✅ | `201cd12`, `f802198` |
| Financing marketplace — SBA playbook, loan-readiness, lenders directory | ✅ | `3aeb8ab` |
| Buyer capture popup + daily site health watch | ✅ | `b597fc4` |
| Trust Center + Identity Verified seller badge | ✅ | `2cca907`, `cd119e1` |
| Certified brokers directory, seller/buyer guides, reviews, careers | ✅ | `12a6b8b` |
| Newsletter capture + weekly briefing signup + ad slots | ✅ | `882bed6`, `3bf116f`, `bbdc266` |
| PWA + offline + performance config | ✅ | `6338d62` |
| Mobile responsive sweep — no horizontal overflow anywhere | ✅ | `29f710d`, `41a5440` |
| City autocomplete (33k+ US cities) everywhere | ✅ | `bcaf1c5` |
| og:image/Twitter card + JSON-LD (XSS-hardened) | ✅ | `0a8cc74`, `a5c668a` |

## 8. Security & Compliance

| Feature | Status | Commit |
|---|---|---|
| Master audit 2026-08-26 — 8 fixes, 9 findings, billion-dollar roadmap | ✅ | `a5f37db` |
| Audit rounds 1–7 — rate limits on ALL 10 public endpoints, CSPRNG everywhere, AI auth, open redirect, upload caps | ✅ | `f807b03` → `0926bd9` |
| RLS gap sweep — 17 tables hardened + open-table re-lock (financial_documents, portal tokens, email, docs) | ✅ | `d8a50c2`, `c3f1711` |
| MFA enforcement (super_admin always, agency toggle) + 2FA challenge | ✅ | `3133d95`, `1173bd8`, `5ce94c6` |
| NDA-gated financials — bypass hardening (private bucket, signed URLs) | ✅ | `1173bd8`, `52ceb92` |
| Legal vault access logging (admin_audit_log) | ✅ | `1173bd8` |
| Stripe webhook HMAC verification + payment-trust hole closed | ✅ | `5d49d51`, `3b8033e` |
| Account-change emails (password/email/sign-in alerts) | ✅ | `a9d2c42` |
| Fail-closed demo mode in production | ✅ | `1f3b84d` |
| CRON_SECRET header auth (no query-string secrets) | ✅ | `69c2559` |
| Password vault (CSPRNG, encrypted) | ✅ | `50df762`, `d631944` |
| Sentry error tracking + Vercel Analytics/Speed Insights | ✅ | `7513180` |
| SOC 2 readiness mapping (Trust Services Criteria) + audit export | ✅ | `1f9062f`, `9cdc4a6` |
| 13 regression tests locking audit rounds 1–7 | ✅ | `0926bd9` |
| Point-in-time recovery (PITR) — **decision: deferred** (daily backups running) | 🟡 deferred | PUNCHLIST 08-31 |
| Independent pentest on NDA gate with real buyer account | ❌ **needs Rabin directly** — third-party or structured internal security review, not Yavin self-audit | PUNCHLIST |
| Upstash rate limiting at scale | ❌ deferred (needed only at traffic scale) | PUNCHLIST |

## 9. Billing / Licensing / Tiers

| Feature | Status | Commit |
|---|---|---|
| Real Stripe license purchase + webhook activation ($4,999 software license, not real-estate license) | ✅ | `3b8033e`, `41a7de6` |
| Recurring CRM subscriptions — 3 seats incl + $25/seat, proration, cancel-at-period-end | ✅ | `859f343` |
| ONE pricing source of truth (99/mo CRM) + owner-listing upsells + admin AI verify & unlock | ✅ | `c7d70f3` |
| Paid tier price default $250/listing (boss explicit — was $19) | ✅ | `e433d10` |
| Seller tiers — free vs paid (AI-Verified financials) | ✅ | `4866e2b` |
| Trial system — agency control, limits, grace, reminders | ✅ | `3788571`, `14c2ef4` |
| White-label provisioning — one-command spin-up (`scripts/provision-white-label.mjs`) | 🟡 manual, not self-serve | `5fd87bd` |
| Stripe + webhook setup checklist + seller portal token backfill | ✅ | `d032c9d` |
| API cost tracking + admin API keys registry + provider cost sync | ✅ | `0461226` |

## 10. Infrastructure / CI / DX

| Feature | Status | Commit |
|---|---|---|
| CI — GitHub Actions: typecheck + unit tests + prod build on push; on-demand E2E | ✅ | `e5bd7cf` |
| Unit suite 977/977 + 18 e2e specs (full-role, journey, lifecycle, tenant, security) | ✅ | current |
| Next.js 16.3.3 (clears 2 high-severity DoS advisories), middleware→proxy migration | ✅ | `29d3fbc`, `2c476f8` |
| Typecheck OOM fix — 1.5GB heap baked into npm script + tsconfig cleanup | ✅ | `bf2c9c2` |
| Test runner with `@/` alias support (paths-loader) | ✅ | `823d87a` |
| Copyright header in all 836 source files | ✅ | `296a2c1` |
| Supabase DB migrations — 6 applied to production + live-schema fixes | ✅ | `21faeab` |
| **Migration runner** (`scripts/migrate.mjs`) — check-mode default, `schema_migrations` ledger, full-schema dumps excluded, applies pending sql/*.sql via Management API (built 08-31 after force-audit SQL never reached live DB) | ✅ | migration-runner commit |
| Nightly DB backup cron (14-day retention, off-site email copy) | ✅ | `c3f1711` |
| **Dead-code sweep 08-31** — deleted 8 orphans w/ tests: `lib/stageTemplates` (closing tracker has own), `lib/voiceAgent` (twilio/vapi have own), `/api/booking` (lib used directly), `/api/social/oauth+callback` (no refs), `/api/compliance` (lib used by publish), `/api/syndication` (real: `/api/listings/syndication`), `/api/digest` (cron digest separate), `/api/proof-of-funds` (goes via `/api/public/qualify`). Kept: `/api/deal-files` (agent-facing), `/api/sms/inbound` (Twilio webhook). Also fixed vapi route EZ-brand fallback → 'our brokerage'. Suite 977 → 955 | ✅ | sweep commit |
| Unit economics tracking (CAC/LTV, cost-per-listing, margin per tier, breakeven) | ❌ **needs Rabin directly** — business analysis with real usage data | PUNCHLIST |

## How to update
1. After any feature work: add/update the row, set status, copy the commit hash.
2. Keep the baseline counts at the top current (unit suite, typecheck).
3. Move items to ✅ only when verified (tests green + live check where applicable) — same rule as PUNCHLIST.

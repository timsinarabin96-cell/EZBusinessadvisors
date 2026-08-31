# Licensing Plan — EZ Business Advisors Platform as a Product
_Status: **Phase 0 IN PROGRESS** (approved). Owner: Yavin + Rabin. Last updated: Aug 31, 2026_

## ✅ Decisions locked (Rabin, 08-31)
1. **Connect: Express** — hosted onboarding, platform controls fees/transfers. Standard = brokers run their own full Stripe dashboard (weakens control); Custom = overkill (we'd own their onboarding/compliance UI).
2. **Money flow: closing/commission only through Connect first** — deposits deferred (money-transmitter regulatory sensitivity). Add deposits once Connect is proven live.
3. **Platform cut: STACK both** — flat license fee ($499/$899) = SaaS revenue regardless of deal volume; PLUS transaction % (3/2/1 tiers as default, configurable per broker) on closing. A zero-deal firm still pays the license; a high-volume firm pays more via the cut.
4. **Owner listing fees: platform revenue by default** — every owner-listing fee goes to the platform regardless of which broker's site it appears on. Broker-routed toggle deferred until actual licensed brokers ask for it (Phase 4).
5. **License seats: 3 seats included + $25/seat/mo after.**
6. **Phase 0 (branding): approved, start now** — no dependency on 1–5.


## 0. Where the codebase stands today (grounded, not guessed)

| Area | Current state | Evidence |
|---|---|---|
| Stripe | Standard Checkout only (payment + subscription modes). **Zero Connect code** — no `transfer_data`, `application_fee`, `on_behalf_of`, no Express/Standard connected-account onboarding anywhere. | grep across `lib/` + `app/` returned empty for all Connect primitives |
| License billing | CRM tiers already priced: Professional $499/mo (annual $4,790), Enterprise $899/mo (annual $8,630) in `lib/pricing.ts`; license webhook flip proven live | `lib/pricing.ts`, `sql/license_billing_schema.sql`, webhook proof 08-30/08-31 |
| Success fees / commissions | Tiered success fee exists (3%/2%/1% brackets) in `lib/successFee.ts`; commissions module exists | `lib/successFee.ts`, `lib/commissions.ts` |
| Owner listing plans | Free / Professional / Enterprise listing plans exist for business owners | `lib/pricing.ts` `OWNER_LISTING_PLANS` |
| Agency identity | `agencies.legal_name` exists; signing identity (`signing_name/title/signature`) added in migration 0004; agency theme system exists (`lib/agencyTheme.ts`), business-card branding exists (`lib/branding.ts`) | `sql/base_schema.sql`, migration 0004, `lib/agencyTheme.ts` |
| Legal pack docs | Templates ALREADY parameterized: `{{agency_name}}`, `{{broker_name}}` placeholders in listing agreement, NDA, buyer profile | `lib/legalPackTemplates.ts` |
| CIM / BLI / LOI | Generators found; **no agency-identity injection found** — branding-neutral today, which means no EZ branding leaks, but also no broker branding lands either. Needs the resolver from Phase 0. | `lib/cim.ts`, `lib/bli.ts`, `lib/loi.ts`, `lib/loiRender.ts` |
| Hardcoded "EZ Business Advisors" strings | Present in ~10 lib files as **fallback text** (emails, PDF overlay, client portal, compliance, search, AI briefing). Each is a candidate leak on a licensed broker's surface. | grep `-rln "EZ Business Advisors" lib/` |

**Bottom line: the platform is 70% licensing-ready structurally (multi-tenant + white-label + themes), but money routing (Connect) and dynamic doc branding are net-new.**

---

## 1. Stripe Connect architecture

**Goal:** every licensed broker firm gets their own connected Stripe account; money from their deals deposits to THEIR bank; the platform takes an automatic cut; the admin panel sees all volume.

### Recommended shape
- **Connect account type: Express** (hosted onboarding, no KYC work for us, broker gets their own Stripe Express dashboard, we control fee collection + transfers). Upgrade path to Custom later if a broker wants deep integration.
- **Onboarding flow:** broker firm signs up → we create a `stripe_account_id` per agency (stored on `agencies`) → redirect to Stripe's hosted onboarding (`account_links`) → webhook `account.updated` (charges_enabled) flips the agency to "payout-ready".
- **Money routing (the cut):** on every deal transaction (buyer offer deposit, LOI, closing fee):
  - Platform creates the PaymentIntent/Checkout **on the broker's connected account** (`stripe_account` header) with
  - `application_fee_amount` = platform's cut (configurable per agency, e.g. 3% blended or flat),
  - or `transfer_data` + separate fee transfer for marketplace flows.
  - Broker's balance pays out to their own bank automatically; platform fee lands in the platform account.
- **Admin panel volume view:** new `/admin/stripe-connect` page — every agency's connected account status (onboarding complete?, charges_enabled?, payouts_enabled?), lifetime volume, platform fees earned, per-agency totals, and a raw `application_fees` feed (that's the platform's revenue line).
- **Platform cut config:** `agency_settings.stripe_cut_percent` + optional flat fee, defaulting to the success-fee tiers already in `lib/successFee.ts`.
- **Edge cases to design for:** broker deauthorization (`account.application.deauthorized` → freeze their payouts + flag in admin), refunds/disputes (fee reversal rules), broker without completed onboarding (money held until ready), test-mode vs live keys.

### Decisions needed from you
1. **Express vs Standard** — my rec: Express (no KYC burden on us, hosted onboarding). Standard gives brokers full Stripe dashboard but we do manual KYC.
2. **Which transactions flow through Connect** — all deal money (offers/LOI/closing), or only final commission at closing? My rec: start with **closing/commission only**, add deposits later (simpler legal + refund path).
3. **Platform cut** — % of deal value (tiered like success fee today), flat per deal, or both?

---

## 2. Three distinct billing products

### (a) EZ's own brokerage — commissions / success fees
- **Keep exactly as-is today**: `lib/successFee.ts` tiered schedule + `lib/commissions.ts`, billed from the platform's own Stripe account. No Connect involved — this is EZ's own revenue.
- **Only change:** make the schedule overridable per agency (needed anyway for licensing) via `agency_settings.success_fee_tiers`.

### (b) CRM license fee per broker firm (monthly / annual)
- **Already priced** (Professional $499/mo, Enterprise $899/mo). Needs:
  - Recurring subscription billing via Stripe **Subscriptions** (today the webhook proves a one-shot license flip; convert to proper `subscription` mode with proration + dunning).
  - **Per-firm, not per-user** at the base tier; seat add-ons ($/extra agent/month) as a second line item — recommend including ~3 seats then $25/seat/mo.
  - Self-serve checkout page per plan + annual discount (2 months free already modeled) + trial→convert flow that already exists.
  - `licenses` table becomes the source of truth for what's active (plan, seats, billing anchor, cancel-at).

### (c) Per-listing / monthly fee for business owners posting directly
- **Already exists structurally** (`OWNER_LISTING_PLANS`: free / professional $? / enterprise $?), currently paid via one-shot checkout.
- **Licensing question:** who gets this money?
  - If it's **platform revenue** (SaaS marketplace fee): keep on the platform account — simplest.
  - If it's **broker revenue** (their marketplace, they set the price): route through Connect with platform cut.
  - **My rec: platform collects the platform listing fee; broker optionally adds their own per-listing premium through Connect** — both supported, one toggle.
- Needs: per-agency listing-fee overrides + recurring monthly listing fee option (not just one-shot).

### Interaction matrix (to make explicit in code)
| Money | Payer | Receiver | Platform cut | Channel |
|---|---|---|---|---|
| EZ success fee | EZ sellers | EZ | 100% EZ | Platform account (existing) |
| CRM license | Broker firm | Platform | 100% platform | Platform account (subscription) |
| Owner listing fee | Business owner | Platform (default) or broker (toggle) | Platform or cut | Platform account / Connect |
| Deal commission | Buyer/seller | Broker firm | Platform % via application_fee | **Connect (new)** |

---

## 3. Document branding — dynamic agency identity everywhere

**Goal:** every generated document carries the AGENCY's own legal name + branding. Zero hardcoded EZ Business Advisors on a licensed broker's client-facing documents.

### What already works
- Legal pack templates (listing agreement, NDA, buyer profile) use `{{agency_name}}` / `{{broker_name}}` placeholders — just need the resolver to feed them.

### What's missing (Phase 0 work)
1. **Agency brand resolver** (`lib/agencyBranding.ts`): one function that returns, for any agency: legal name, DBA/display name, logo URL, address, phone, email, colors, signing identity (signing_name/title/signature). Sources: `agencies` + `agency_theme` + signing fields. Single injection point for every generator.
2. **Wire into generators:**
   - CIM (`lib/cim.ts`) — cover/front-matter currently brand-neutral; add broker name + logo block.
   - BLI (`lib/bli.ts`), LOI render (`lib/loiRender.ts`), document builder (`lib/documentBuilder.ts`), PDF overlay (`lib/pdfOverlay.ts`).
   - Email templates (`lib/emailTemplates.ts`) — footer/from-name per agency (today many fallbacks say EZ).
   - Flyer, teaser docs, closing packet — same resolver.
3. **Fallback-string audit:** sweep the ~10 lib files with "EZ Business Advisors" fallback text; replace with resolver output (fallback to agency name, then platform neutral "Concord Deal Platform").
4. **Regression guard:** a unit test that renders each doc type for a FAKE agency (e.g. "Harbor Acquisitions") and asserts **zero** occurrences of "EZ Business Advisors" and presence of the fake agency's legal name.

---

## 4. Phased order + effort estimate

**Critical path:** Phase 0 (branding) is a prerequisite for selling to any broker. Phase 1–2 (Connect) is the money plumbing. Phase 3–4 stack on top. Phase 5 is visibility.

| Phase | Scope | Effort (focused days) | Dependencies |
|---|---|---|---|
| **0 — Agency brand resolver + doc branding** | Resolver, wire CIM/BLI/LOI/legal-pack/emails/flyer/closing, fallback sweep, branding regression test | **3–4 days** | None — start here |
| **1 — Stripe Connect onboarding** | Express account creation per agency, hosted onboarding links, `account.updated` webhook, agency status fields, admin status column | **2–3 days** | Stripe account has Connect enabled (you, 10 min) |
| **2 — Deal money via Connect + platform cut** | PaymentIntent on connected account with `application_fee_amount`, payouts to broker bank, fee ledger, admin volume page v1 | **3–4 days** | Phase 1 |
| **3 — CRM license as recurring subscription** | Convert license flip → Stripe Subscriptions (monthly/annual, proration, cancel), seats add-on, self-serve checkout, licenses table as truth | **2–3 days** | none (parallel with 1–2) |
| **4 — Owner listing fees (product c)** | Per-agency listing-fee overrides, recurring monthly listing option, platform-vs-broker money toggle | **1–2 days** | Phase 2 for broker-routed option |
| **5 — Admin volume + analytics** | All-agency volume rollup, platform fees earned, per-agency MRR, export; refresh existing /admin/charts | **1–2 days** | Phases 1–3 |

**Total: ~12–18 focused days** (roughly 2.5–3.5 weeks at normal pace, or ~2 weeks if we parallelize 3 with 1–2).

**Recommended order:** 0 → 1 → 2 → (3 ∥ 4) → 5. Sell readiness milestone = Phases 0+1+3 (a broker can onboard, pay a license, and get branded docs) — that's **~8 days** to first paying external broker.

---

## Open questions for you before I write any code
1. Express or Standard connected accounts?
2. Which money flows through Connect first (closing/commission only, or deposits too)?
3. Platform cut: % tiers, flat, or both?
4. Owner listing fees: platform revenue by default, or broker-routed with toggle?
5. License: include seats in base price or seat add-ons? (my rec: ~3 seats incl., $25/seat/mo after)
6. Do you want me to start Phase 0 (branding) while you mull 1–5? It's needed regardless.

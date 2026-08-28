# 🧪 Concord Deal Platform — Full QA Test Checklist (Human Tester)

**Test environment (LIVE):** https://ezbusinessadvisors.vercel.app
**Browser:** Chrome (desktop) + phone (mobile view / Safari)

---

## 🔑 Test Accounts (all pre-created)

| Role | Email | Password |
|---|---|---|
| Broker/QA (EZ) | `e2e.qa@concordplatform.dev` | `E2e!Test#2026#Concord` |
| Tenant owner (Harbor) | `harbor.owner@tenant.test` | `Tenant!Test#2026#Concord` |
| Tenant broker | `harbor.broker@tenant.test` | `Tenant!Test#2026#Concord` |
| Tenant agent | `harbor.agent@tenant.test` | `Tenant!Test#2026#Concord` |
| Tenant buyer | `harbor.buyer@tenant.test` | `Tenant!Test#2026#Concord` |
| Tenant seller | `harbor.seller@tenant.test` | `Tenant!Test#2026#Concord` |

**Payments:** Stripe is in TEST MODE — use card `4242 4242 4242 4242`, any future date, any CVC.

---

## PART 1 — PUBLIC WEBSITE (no login)

### 1.1 Homepage — https://ezbusinessadvisors.vercel.app/
- [ ] Hero loads with headline + search
- [ ] Stats count up (businesses for sale, sold, industries)
- [ ] Featured listings carousel
- [ ] Links work: Buy / Sell / BrokerAI / Our Brokers / Pricing / Professionals

### 1.2 Pricing — /pricing
- [ ] 3 tiers visible: Owner (Free), Professional ($499), Enterprise ($899)
- [ ] Monthly ↔ Annual toggle switches prices
- [ ] Limit chips: listings + seats per tier
- [ ] Headline is white-on-blue (not invisible)

### 1.3 Marketplace — /marketplace/listings
- [ ] Listings load with cards (photo, title, price, badges)
- [ ] Search box works; industry filters work
- [ ] Click a listing → detail page opens
- [ ] Detail shows: 🛡️ Identity Verified, 📊 BOV on file, ✅ Verified Revenue badges (if present)
- [ ] "Request Confidential Details" form works
- [ ] "Make an Offer" works (if active)

### 1.4 Sell page — /marketplace/sell
- [ ] "List Your Business — Free" (not valuation-first)
- [ ] Form fields complete; **attestation checkbox is REQUIRED**
- [ ] Submit → success screen with **🎁 Launch Kit $399 upsell**
- [ ] Launch Kit button → opens Stripe checkout (test card)

### 1.5 Legal & Trust — /terms, /legal/privacy, /legal/regulations
- [ ] All pages load, no broken links

---

## PART 2 — OWNER / SELLER (the trust flow)

1. Sign up fresh: /auth/signup → **email verification required** (check inbox, click link)
2. Login → /dashboard/owner → "Complete your profile" card
3. **Phone verify** → Send code → enter SMS code → phone verified
4. **Photo upload** → profile photo on file → "Identity verified" banner
5. Create listing via /marketplace/sell (attestation ✓)
6. Dashboard shows listing + "Upload 3 years of financials"
7. Upload financials (year established + 3 revenues + PDF) → **AI verdict** (auto-approved / broker review / rejected)
8. Try "Reactivate" → publish gate (readiness: complete listing in wizard via "Complete your listing" link)
9. Status buttons: Mark as Sold / Pause / Withdraw / Reactivate

---

## PART 3 — BUYER

1. Login as harbor.buyer → /dashboard/buyer (buyer match dashboard)
2. Browse marketplace → submit inquiry on a listing
3. Seller/broker receives the inquiry (email + in-app)
4. Buyer Match Pass pricing visible (/pricing → Match Pass section)

---

## PART 4 — AGENT (tenant CRM)

1. Login as harbor.agent → broker CRM shell (EZ branding per tenant)
2. Create a listing via wizard (Deal Studio: /dashboard/studio)
3. Publish own listing (can publish own; **cannot publish another agent's** — 403)
4. See own listings only (no cross-tenant data)

---

## PART 5 — BROKER / CRM ADMIN

1. Login as harbor.broker → Command Center / team
2. **Invite agent by email** → /invite link → agent creates login
3. Review queue: /dashboard/review-queue → approve/reject listings
4. Leads: /dashboard/leads, /dashboard/seller-leads
5. Deals pipeline, CIM/BOV generation, documents, e-sign
6. Financial files, data room, recast, training

---

## PART 6 — PAYMENTS (all products, test card 4242)

- [ ] Professional subscription ($499) → checkout → webhook flips status
- [ ] Enterprise ($899)
- [ ] License ($4,999) — purchase flow
- [ ] $99 Valuation / BOV → **📊 BOV on file badge appears**
- [ ] $399 Launch Kit
- [ ] Featured $149 / $349
- [ ] Verified Revenue $199
- [ ] Buyer Match Pass $49/$99

---

## PART 7 — SECURITY / TRUST (spot checks)

- [ ] Unconfirmed email CANNOT log in (email verification enforced)
- [ ] Owner A cannot change Owner B's listing (403)
- [ ] OTP brute force: 5 wrong codes → blocked (429)
- [ ] Buyer-inquiry flood → rate limited
- [ ] File upload rejects non-images
- [ ] Bank statements / CIM / BOV docs NOT publicly readable (private bucket + signed URLs)

---

## PART 8 — MOBILE / POLISH

- [ ] Homepage, pricing, marketplace usable on phone width
- [ ] No invisible text (contrast check on dark sections)
- [ ] Header brand reads "DEAL PLATFORM" (default) / agency brand on tenant domain

---

## ⚠️ Known notes for the tester
- Phone OTP on the LIVE site sends a **real SMS** — use a real phone number you control.
- Email verification links are real — check the inbox (incl. spam) of the test email.
- The Harbor tenant accounts test multi-tenant isolation (the "sold CRM" scenario).
- Everything above was automated-tested green (786 unit tests + persona e2e suites); this list is the human eyeball pass for polish and feel.

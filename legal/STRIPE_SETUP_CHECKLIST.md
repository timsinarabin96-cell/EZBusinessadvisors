# Stripe + Webhook Setup Checklist — Concord Deal Platform

**Prepared:** 2026-08-26 · **Owner:** Rabin · **Time:** ~15 minutes · **Do this before selling anything**

Everything in the platform that charges money (subscriptions, license, featured slots, verified-revenue badge, financial-intelligence add-on, buyer pass) is unlocked by **Stripe webhooks**. Until the webhook is registered, purchases will not auto-activate in production.

---

## 1. Register the webhook in Stripe Dashboard (5 min)

1. Go to **Stripe Dashboard → Developers → Webhooks → Add endpoint**
2. Endpoint URL:
   ```
   https://concord.ezbusinessadvisors.com/api/stripe/webhook
   ```
3. **Events to subscribe** (all four):
   - `checkout.session.completed`
   - `invoice.paid`
   - `invoice.payment_failed`
   - `customer.subscription.deleted`
4. Add endpoint → Stripe shows a **Signing secret** (`whsec_...`)
5. Copy it — you'll need it in step 2.

> The route already handles these events server-side (verified by tests). Nothing else to configure in code.

---

## 2. Environment variables on Vercel (5 min)

Go to **Vercel → Project → Settings → Environment Variables** and confirm/add:

| Variable | Value | Required |
|---|---|---|
| `STRIPE_SECRET_KEY` | `sk_live_...` (or `sk_test_...` to start) | ✅ |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` from step 1 | ✅ |

After adding → **Redeploy** the latest commit (or trigger a fresh deploy) so the env vars take effect.

> ⚠️ **Why this matters:** if these are missing, the app falls into **demo mode** — checkouts "succeed" without charging and features unlock for free. That's a leak. Confirm both are set before real customers pay.

---

## 3. Verify it works (5 min)

1. Open the site → **/pricing** → confirm CRM shows **$499/month** everywhere (not $49/$99/$500).
2. Run a **test checkout** (Stripe test mode):
   - Subscribe to Professional → pay with `4242 4242 4242 4242`
   - After redirect, confirm the agency shows as paid (`/admin/agencies` → paid_plan_active)
3. Check **Stripe Dashboard → Webhooks → Recent deliveries** — you should see `checkout.session.completed` with **200 OK**.
4. Optional: buy a **Featured slot** on a listing → confirm the listing gets the ★ badge after the webhook fires.

---

## 4. Quick reference — what each purchase unlocks

| Product | Checkout kind | Webhook action |
|---|---|---|
| CRM subscription (Professional/Enterprise) | `subscription` | activates plan, unlocks seats |
| White-label license ($4,999 + $499/mo) | `license` | marks agency licensed |
| Featured slot ($149 / $349 / $499) | `featured` | confirms listing placement |
| Verified Revenue badge ($199) | `verified_revenue` | flags record for bank-vs-books → admin AI verify grants badge |
| Financial Intelligence ($100/mo) | `financial_intelligence` | enables the add-on for the agency |
| Buyer Pass ($49/$99) | `buyer_pass` | activates buyer subscription + verified-buyer badge |

---

## 5. Related pending items (not Stripe, but same "before launch" list)

- **Supabase dashboard:** enable PITR (Pro plan), session timebox/inactivity, `mailer_notifications`, set `mailer_autoconfirm` → manual, HIBP.
- **MFA for platform admins** (report #10) + rotate unused `INSTAGRAM_APP_ID`.
- **Legal:** copyright.gov (2 apps), PA DBA "Concord Deal Platform", LLC good-standing check — the 9 AM cron reminds you daily.

---

*If anything above doesn't behave as described, DM me — I'll dig into logs before you spend a minute on it.*

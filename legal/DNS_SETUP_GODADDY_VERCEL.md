# DNS Setup — GoDaddy → Vercel (bring the site back online)

**Detected:** 2026-08-26 · **Issue:** `concord.ezbusinessadvisors.com` returns NXDOMAIN (domain doesn't exist on the internet). The site is reachable at `concord-deal-platform.vercel.app` but NOT at the branded address. This blocks launch AND the Stripe webhook. **~5 minutes.**

---

## Step 1 — Add the CNAME at GoDaddy

1. Log in at **godaddy.com** → **Domain Portfolio** → `ezbusinessadvisors.com` → **DNS** (Manage DNS)
2. Click **Add New Record**:
   - **Type:** `CNAME`
   - **Name/Host:** `concord`
   - **Value/Points to:** `cname.vercel-dns.com`
   - **TTL:** Default (1 hour is fine)
3. Save.

> Alternative (if you prefer A records): add `concord` → `76.76.21.21` (Vercel's anycast IP). CNAME is preferred — Vercel can then manage it.

## Step 2 — Confirm the domain on Vercel

1. Go to **vercel.com** → your project (`concord-deal-platform`) → **Settings → Domains**
2. If `concord.ezbusinessadvisors.com` is listed as a domain:
   - It should show **Valid Configuration** after the CNAME propagates (up to ~1 hour, usually minutes)
   - If it says "Invalid" → click it and follow Vercel's prompt (it may ask to verify the same CNAME)
3. If it's NOT listed → click **Add Domain** → enter `concord.ezbusinessadvisors.com` → follow the prompts.

## Step 3 — Verify DNS propagated

Wait ~5–10 minutes, then check from a normal browser (or your phone, not on Wi-Fi):

- Open `https://concord.ezbusinessadvisors.com` — you should see the marketplace homepage.
- Or check DNS: visit `https://dns.google/resolve?name=concord.ezbusinessadvisors.com&type=CNAME` — you want a `Status: 0` with a CNAME answer pointing at `cname.vercel-dns.com`.

## Step 4 — Update the Stripe webhook URL (after DNS is live)

The webhook endpoint must use the working domain:

```
https://concord.ezbusinessadvisors.com/api/stripe/webhook
```

Register it in **Stripe Dashboard → Developers → Webhooks → Add endpoint** with events:
`checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.deleted`.
Copy the `whsec_...` signing secret → set it as `STRIPE_WEBHOOK_SECRET` on Vercel (with `STRIPE_SECRET_KEY`), then redeploy.

## Step 5 — Sanity checklist after setup

- [ ] `https://concord.ezbusinessadvisors.com` loads in a browser
- [ ] `/pricing` shows **$499/month** for the CRM
- [ ] Vercel → Settings → Domains shows **Valid Configuration**
- [ ] Stripe webhook registered + recent delivery shows `200 OK` after a test checkout
- [ ] `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` set on Vercel, latest commit deployed

---

*If the domain still doesn't resolve ~30 min after the CNAME, check GoDaddy DNS again (record saved? host spelled `concord`, not `concord.ezbusinessadvisors.com`?) — or DM me and I'll re-check propagation live.*

# White-Label CRM — One-Command Provisioning

**The sale model:** you sell the CRM platform to a broker for a one-time setup
fee + monthly platform fee (collected automatically via Stripe). The broker's
data lives in **their own Supabase project** — a completely separate stack from
yours. You never see their data; you only see the payment.

## Per-sale handoff (one command)

```bash
cd /root/projects/concord-deal-platform

SUPABASE_ACCESS_TOKEN=sbp_... VERCEL_TOKEN=... node scripts/provision-white-label.mjs \
  --name "Acme Brokerage" --email owner@acme.com \
  --env STRIPE_SECRET_KEY=sk_... --env STRIPE_WEBHOOK_SECRET=whsec_...
```

What it does:

1. **Creates a brand-new Supabase project** (their database, their data).
2. **Loads the full platform schema** — `sql/RUN_ALL.sql` + every delta file
   newer than it (e.g. `professional_referral_fees.sql`), so a fresh install
   is always current.
3. **Deploys the app to Vercel** as their own project, with their own env vars
   (Supabase keys, VAPID pair, CRON secret, optional broker Stripe keys).
4. **Writes a handover sheet** (`outputs/<slug>-handover.md`) — URLs, keys,
   DB connection, next steps (custom domain, their Stripe, first-login flow).

## Pre-flight check (validates tokens, creates nothing)

```bash
SUPABASE_ACCESS_TOKEN=sbp_... node scripts/provision-white-label.mjs --check
```

## Getting the tokens

- **Supabase access token:** supabase.com → Account → Access Tokens → generate
  (`sbp_...`). Same token needed to apply pending SQL migrations.
- **Vercel token:** vercel.com → Account → Settings → Tokens → create.

## Notes

- First user to sign up at the broker's URL becomes the agency owner (standard
  onboarding wizard → create agency).
- The broker can add their own custom domain in Vercel + Supabase Auth later.
- Their Stripe keys are optional at provision time — until set, the app uses
  the built-in graceful demo fallback for checkout flows.
- Scale: 15 brokers = 15 separate stacks. Zero shared load; one broker's
  traffic can never affect another's (or yours).

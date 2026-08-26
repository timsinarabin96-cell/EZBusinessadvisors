-- Concord Deal Platform
-- Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
-- Proprietary & confidential. No copying, distribution, or modification without
-- prior written permission. See LICENSE for full terms.

-- =============================================================================
-- LEGAL VAULT — admin-only legal & security document store (2026-08-26)
-- Run this in the Supabase SQL Editor AFTER security_hardening_2026_08_26.sql.
--
-- The Legal Vault holds every "save my ass" document in one place:
-- ownership, copyright, broker compliance, security checklist, incident
-- response, insurance, filings tracker. VISIBLE ONLY TO PLATFORM ADMINS
-- (super_admin / admin) — row-level security blocks everyone else,
-- including all brokers and agency members.
-- =============================================================================

-- 1) Table
create table if not exists public.legal_vault (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  category text not null default 'Legal',
  version text not null default '1.0',
  body_md text not null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- 2) RLS: admin-only (super_admin or admin), matching the expenses pattern
alter table public.legal_vault enable row level security;

drop policy if exists "legal_vault_admin_read" on public.legal_vault;
create policy "legal_vault_admin_read" on public.legal_vault
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('super_admin','admin'))
  );

drop policy if exists "legal_vault_admin_write" on public.legal_vault;
create policy "legal_vault_admin_write" on public.legal_vault
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('super_admin','admin'))
  ) with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('super_admin','admin'))
  );

-- 3) Seed — the master documents. Update freely; version bumps are your audit trail.
insert into public.legal_vault (slug, title, category, version, body_md) values
('security-checklist', 'Security Hardening Checklist', 'Security', '1.0', $md$
# Security Hardening Checklist

Status as of 2026-08-26. This is the living record of what protects client financial data.

## Verified in code (2026-08-26 audit)
- Row-level security enabled on ~270 table statements, 630 policies, tenant-isolated by user ID.
- Service-role + AI keys are server-side only (11 API routes, zero client references).
- AI chat route is server-only: Zod validation, payload caps, history clamping.
- Security headers: CSP, X-Frame-Options DENY, nosniff, HSTS, camera/mic/geolocation blocked.
- Payments via Stripe — card numbers never enter our database.

## FIXED 2026-08-26 (two real leaks found + closed)
1. Client portal uploads were stored in the PUBLIC 'documents' bucket with permanent public URLs.
   → Now uploaded to private 'financial_docs' bucket; served via short-lived signed URLs (1h).
   → Run sql/security_hardening_2026_08_26.sql in Supabase to lock the bucket itself.
2. Financial/legal AI agents (document, training, lead) were defaulting to DeepSeek.
   → Now ALWAYS route through Claude (Anthropic) when configured; refuse if not configured.

## Standing checklist (verify monthly)
- [ ] MFA enabled on Supabase, Vercel, GitHub, and email accounts.
- [ ] No public-read storage buckets (only listing_images + training are public by design).
- [ ] No client financials ever pasted into assistant chats (Telegram/model API).
- [ ] Run audit.sh after every major release.
- [ ] Supabase point-in-time recovery enabled + tested restore.
- [ ] E&O + cyber insurance current (see 'insurance' doc).
- [ ] DeepSeek fallback remains OFF for financial agents (code-enforced).
$md$),
('ownership', 'Ownership & Copyright', 'Ownership', '1.0', $md$
# Ownership & Copyright

## Who owns what
- The Concord Deal Platform (code, design, content) is owned by **EZ Business Advisors LLC**.
- Author/creator: Rabin Timsina. Claimant for registration purposes: EZ Business Advisors LLC.
- All 836 source files carry the header: © 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.

## Copyright status
- Copyright exists automatically at creation. Registration at copyright.gov is what enables
  statutory damages (up to $150k/work willful) + attorney fees in federal court.
- PENDING: register 2 works at copyright.gov — (1) source code as Literary Work/Computer Program,
  (2) website under Other Digital Content. Claimant: EZ Business Advisors LLC.

## The 3-month rule
- Registration within 3 months of first publication makes statutory damages retroactive.
- Site first went live ~July 2025 → that window has passed for original content.
- Register NOW anyway: required before suing, protects all future content.

## Filings tracker (update as completed)
- [ ] Copyright.gov — source code application
- [ ] Copyright.gov — website application
- [ ] PA fictitious name / DBA "Concord Deal Platform" (business.pa.gov, ~$70)
- [ ] LLC good-standing check (business.pa.gov)
$md$),
('broker-compliance', 'Broker Licensing & Compliance', 'Compliance', '1.0', $md$
# Broker Licensing & Compliance

## State license status
- Pennsylvania has NO business broker license — operating from PA as an unlicensed
  business broker is legal. This platform's regulations page documents the 35 no-license states.
- Platform requires every broker to attest to their licensed states (license attestation feature).

## The real-estate trap (read this)
- PA real estate licensing law CAN reach business sales that transfer land/buildings.
- If a deal includes real property, either a licensed PA agent must be involved,
  or the deal must be structured as an asset-only sale (equipment, inventory, goodwill).
- This is the #1 way unlicensed business brokers get in trouble. Keep real estate out.

## Independent contractors
- All agents/brokers are 1099 independent contractors per the Broker Services Agreement.
- Keep it real: no control over hours/methods, no exclusivity, contractor supplies own tools.
- If you ever hire W-2 staff: PA workers' comp + unemployment registration required.

## Tax
- Brokerage commissions are services — not subject to PA sales tax.
- SaaS subscriptions also not taxed in PA currently.
- Check Harrisburg business privilege/mercantile tax with the city.
$md$),
('incident-response', 'Incident Response Plan', 'Security', '1.0', $md$
# Incident Response Plan

If client financial data is exposed, follow this. Time matters.

## 1. Contain (hour 0–1)
- Revoke/rotate Supabase service-role key, AI API keys, Vercel tokens.
- Disable the affected tenant/agency or user account.
- If it's a storage bucket: set bucket private immediately (see hardening SQL).
- Do NOT delete evidence/logs.

## 2. Assess (hour 1–4)
- What data, how many records, who was affected, how did it happen?
- Check admin audit log + Supabase auth logs + storage logs.
- Preserve screenshots and logs for insurance + counsel.

## 3. Notify
- Pennsylvania breach law: notify affected individuals AND the PA Attorney General.
- Check current deadlines (PA requires notice without unreasonable delay; verify current law).
- If card data: Stripe handles PCI scope — confirm with Stripe, but we don't store cards.
- If 250+ residents: also notify consumer reporting agencies.

## 4. Document
- Write the full timeline into this vault (new doc: incident-YYYY-MM-DD).
- Keep records for at least 5 years (insurance + legal).

## 5. Insurance
- Notify E&O/cyber insurer per policy terms (usually "as soon as practicable").

## Key contacts
- Counsel: (fill in)
- Insurer: (fill in)
- Supabase support: support@supabase.com
- Vercel: support@vercel.com
$md$),
('insurance', 'Insurance & Risk', 'Risk', '1.0', $md$
# Insurance & Risk

## Required before handling other people's money
- **E&O (Errors & Omissions)** — professional liability for brokerage advice. Non-negotiable.
- **Cyber liability** — breach response, notification costs, regulatory defense.
- Consider: general liability, umbrella.

## Why insurance is part of "full protection"
- No system is unhackable. Insurance + contracts + audit trail is the real safety net.
- Clients trust you with financials — a policy is proof you take that seriously.
- Brokers you onboard may also want to see you're insured.

## Status
- [ ] E&O policy active (provider: ______, policy #: ______)
- [ ] Cyber policy active (provider: ______, policy #: ______)
- [ ] Certificate of insurance saved to /documents
- [ ] Insurance reviewed annually

## Record-keeping
- Keep every signed agreement (Broker Services, Buyer Agreement, Agency Disclosure,
  NDA) — they are your first line of defense in any dispute.
- Keep the audit trail: who saw what CIM, when (data_room_view_logs).
$md$),
('ai-data-policy', 'AI & Data Handling Policy', 'Security', '1.0', $md$
# AI & Data Handling Policy

## What data goes where
- **Client-facing AI agents** (document, training, lead): ALWAYS Anthropic Claude —
  server-side, never DeepSeek. Code-enforced since 2026-08-26.
- **Non-sensitive agents** (support, booking): DeepSeek for cost, fallback Claude.
- Anthropic does not train on API data. DeepSeek's data policies are less transparent —
  which is exactly why financial context is Claude-only.

## Hard rules
1. Never paste client financials (SSNs, bank accounts, full P&Ls) into assistant chats.
2. Client data lives in Supabase — encrypted at rest + TLS in transit.
3. Files are private-bucket + signed URLs, never permanent public URLs.
4. Service-role + AI keys never leave the server.
5. No training on client data by any provider (API terms, not fine-tuning).

## Tenant AI keys
- Sold CRM tenants can bring their OWN AI keys (billed to buyer) via agency_settings.
- Platform key is the fallback. Both are server-side only.
$md$),
('filings-tracker', 'Legal Filings Tracker', 'Compliance', '1.0', $md$
# Legal Filings Tracker

Master list of every filing/registration with status. Update as completed.

| Item | Where | Cost | Status |
|---|---|---|---|
| LLC formation (EZ Business Advisors LLC) | PA Dept of State | — | ✅ Done |
| EIN | IRS | free | ✅ Done |
| Copyright — source code | copyright.gov | ~$45–65 | ⏳ Pending |
| Copyright — website | copyright.gov | ~$45–65 | ⏳ Pending |
| PA DBA "Concord Deal Platform" | business.pa.gov | ~$70 | ⏳ Pending |
| LLC good-standing check | business.pa.gov | — | ⏳ Pending |
| Harrisburg business privilege tax | City of Harrisburg | varies | ⏳ Check |
| E&O insurance | — | varies | ⏳ Pending |
| Cyber insurance | — | varies | ⏳ Pending |

Notes:
- PA LLCs file a DECENNIAL report (every 10 years), not annual. Verify due date.
- Copyright is federal — PA has no role. Register at copyright.gov.
$md$'),
('terms-index', 'Terms & Agreements Index', 'Legal', '1.0', $md$
# Terms & Agreements Index

Where every public legal page lives (all live on the site):
- /legal/terms — Terms of Service
- /legal/privacy — Privacy Policy
- /legal/cookies — Cookie Policy
- /legal/dmca — DMCA policy
- /legal/ownership — Ownership & copyright notice
- /legal/agreement — Broker Services Agreement template
- /legal/buyer-agreement — Buyer Agreement template
- /legal/disclosure — Agency disclosure

Internal tools that protect you:
- License attestation: brokers declare licensed states (compliance layer).
- State regulations page: documents no-license states.
- Audit log (/admin/audit): every admin action recorded.
- Data room view logs: who saw what CIM, when.

Keep this index updated as pages change.
$md$')
on conflict (slug) do update set
  title = excluded.title,
  category = excluded.category,
  version = excluded.version,
  body_md = excluded.body_md,
  updated_at = now();

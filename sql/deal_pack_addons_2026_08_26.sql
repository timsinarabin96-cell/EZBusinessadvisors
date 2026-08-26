-- Concord Deal Platform
-- Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
-- Proprietary & confidential. No copying, distribution, or modification without
-- prior written permission. See LICENSE for full terms.

-- =============================================================================
-- DEAL PACK ADD-ONS — 2026-08-26
-- Two new fillable templates wired into the seller/buyer packs:
--   1. Financial Authorization (seller pack) — seller authorizes the broker
--      to verify financials with their CPA (unlocks the FIC bank-vs-books flow)
--   2. Proof of Funds (buyer pack) — buyer documents liquid assets upfront
--      (filters tire-kickers before the NDA stage)
-- Idempotent: `on conflict do nothing` — safe to run on any environment.
-- =============================================================================

insert into public.document_templates (name, description, category, fields, parties, body_template)
select * from (values
  (
    'Financial Authorization',
    'Seller authorizes the broker to verify business financials directly with their accountant/CPA — P&Ls, tax returns, and bank statements.',
    'Seller Pack',
    '[
      {"key":"seller_name","label":"Seller Name","type":"text","required":true},
      {"key":"business_name","label":"Business Name","type":"text","required":true},
      {"key":"cpa_name","label":"Accountant / CPA Name","type":"text","required":true},
      {"key":"cpa_firm","label":"Accountant Firm","type":"text","required":false},
      {"key":"cpa_email","label":"Accountant Email","type":"text","required":false},
      {"key":"cpa_phone","label":"Accountant Phone","type":"text","required":false},
      {"key":"effective_date","label":"Effective Date","type":"date","required":true}
    ]'::jsonb,
    '[{"key":"agent","label":"Agent","role":"agent"},{"key":"seller","label":"Seller","role":"seller"}]'::jsonb,
    '{{title}}

Effective Date: {{effective_date}}

I, {{seller_name}}, as owner of {{business_name}}, hereby authorize Concord Deal Platform and its designated broker/agent to contact and obtain financial records from my accountant {{cpa_name}} ({{cpa_firm}}) for the purpose of preparing a normalized financial statement and valuation of the business.

Authorized records include, but are not limited to: profit & loss statements, tax returns, bank statements, and supporting schedules for the most recent fiscal years.

Accountant contact: {{cpa_email}} · {{cpa_phone}}

This authorization remains in effect until the engagement concludes or is revoked in writing.'
  ),
  (
    'Proof of Funds',
    'Buyer documents liquid assets available for the acquisition — the qualification gate that separates serious buyers from tire-kickers.',
    'Buyer Pack',
    '[
      {"key":"buyer_name","label":"Buyer Name","type":"text","required":true},
      {"key":"buyer_email","label":"Buyer Email","type":"text","required":true},
      {"key":"bank_name","label":"Financial Institution","type":"text","required":true},
      {"key":"account_type","label":"Account Type","type":"select","required":true,"options":["Checking","Savings","Money Market","Investment / Brokerage","Retirement (non-pledged)","Other"]},
      {"key":"liquid_assets","label":"Liquid Assets Available ($)","type":"number","required":true,"placeholder":"e.g. 250000"},
      {"key":"pof_date","label":"Date","type":"date","required":true}
    ]'::jsonb,
    '[{"key":"agent","label":"Agent","role":"agent"},{"key":"buyer","label":"Buyer","role":"buyer"}]'::jsonb,
    '{{title}}

Date: {{pof_date}}

I, {{buyer_name}} ({{buyer_email}}), confirm that I have liquid assets of approximately ${{liquid_assets}} available for the acquisition of a business, held at {{bank_name}} ({{account_type}}).

I understand that the broker may request a bank statement or letter from the financial institution to verify these funds before full financials are shared.

This statement is made in good faith for the purpose of qualifying my interest.'
  )
) as v(name, description, category, fields, parties, body_template)
on conflict (name) do nothing;

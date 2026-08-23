-- =============================================================================
-- Email Template Library (additive, idempotent)
-- -----------------------------------------------------------------------------
-- One-click professional emails (intro, NDA follow-up, offer presentation,
-- counter-offer, buyer welcome, seller valuation). {{variable}} placeholders
-- rendered per recipient.
-- =============================================================================

begin;

create table if not exists public.email_templates (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  name text not null,
  category text not null default 'general',  -- intro | nda | offer | counter | welcome | valuation | follow_up | general
  subject text not null,
  body text not null,
  variables jsonb not null default '[]'::jsonb,  -- [{name, label}]
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agency_id, name)
);

create index if not exists email_templates_agency_idx
  on public.email_templates (agency_id, category);

alter table public.email_templates enable row level security;

do $$
begin
  execute 'drop policy if exists email_templates_agency_access on public.email_templates';
  execute 'create policy email_templates_agency_access on public.email_templates for all to authenticated using (public.is_agency_member(agency_id)) with check (public.is_agency_member(agency_id))';
end $$;

revoke all on public.email_templates from anon;
revoke truncate, references, trigger on public.email_templates from authenticated;
grant select, insert, update, delete on public.email_templates to authenticated;

-- Seed the standard library for a fresh agency (idempotent per agency+name).
create or replace function public.seed_email_templates(p_agency_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted integer := 0;
begin
  insert into public.email_templates (agency_id, name, category, subject, body, variables, is_system) values
    (p_agency_id, 'Initial introduction', 'intro',
     'Introduction — {{business_name}}',
     'Dear {{recipient_name}},\n\nThank you for reaching out regarding {{business_name}}. I''d love to learn more about your goals and walk you through how we can help.\n\nWould you be available for a quick call this week?\n\nBest regards,\n{{agent_name}}\n{{agent_phone}}',
     '[{"name":"recipient_name","label":"Recipient name"},{"name":"business_name","label":"Business name"},{"name":"agent_name","label":"Your name"},{"name":"agent_phone","label":"Your phone"}]'::jsonb, true),
    (p_agency_id, 'NDA follow-up', 'nda',
     'Following up — NDA for {{business_name}}',
     'Dear {{recipient_name}},\n\nI wanted to follow up on the NDA for {{business_name}}. Once signed, you''ll receive access to the confidential data room with the full financial details.\n\nIf you have any questions, I''m here to help.\n\nBest regards,\n{{agent_name}}',
     '[{"name":"recipient_name","label":"Recipient name"},{"name":"business_name","label":"Business name"},{"name":"agent_name","label":"Your name"}]'::jsonb, true),
    (p_agency_id, 'Offer presentation', 'offer',
     'Offer received for {{business_name}}',
     'Dear {{recipient_name}},\n\nWe have received an offer of {{offer_amount}} for {{business_name}}.\n\nI''ll walk you through the terms and answer any questions before you decide.\n\nBest regards,\n{{agent_name}}',
     '[{"name":"recipient_name","label":"Recipient name"},{"name":"business_name","label":"Business name"},{"name":"offer_amount","label":"Offer amount"},{"name":"agent_name","label":"Your name"}]'::jsonb, true),
    (p_agency_id, 'Counter-offer', 'counter',
     'Counter-offer for {{business_name}}',
     'Dear {{recipient_name}},\n\nThe buyer has responded with a counter-offer of {{counter_amount}}.\n\nLet''s review the terms together to see if it works for you.\n\nBest regards,\n{{agent_name}}',
     '[{"name":"recipient_name","label":"Recipient name"},{"name":"business_name","label":"Business name"},{"name":"counter_amount","label":"Counter amount"},{"name":"agent_name","label":"Your name"}]'::jsonb, true),
    (p_agency_id, 'Buyer welcome', 'welcome',
     'Welcome — let''s find your business',
     'Dear {{recipient_name}},\n\nWelcome! We''re excited to help you find the right business. I''ll keep you updated as matching opportunities become available.\n\nBest regards,\n{{agent_name}}',
     '[{"name":"recipient_name","label":"Recipient name"},{"name":"agent_name","label":"Your name"}]'::jsonb, true),
    (p_agency_id, 'Seller valuation follow-up', 'valuation',
     'Your business valuation — {{business_name}}',
     'Dear {{recipient_name}},\n\nBased on our analysis, {{business_name}} may be worth an estimated {{valuation_range}}.\n\nI''d love to walk you through the details and discuss next steps.\n\nBest regards,\n{{agent_name}}',
     '[{"name":"recipient_name","label":"Recipient name"},{"name":"business_name","label":"Business name"},{"name":"valuation_range","label":"Valuation range"},{"name":"agent_name","label":"Your name"}]'::jsonb, true),
    (p_agency_id, 'Check-in', 'follow_up',
     'Checking in — {{business_name}}',
     'Dear {{recipient_name}},\n\nJust checking in on {{business_name}}. Is there anything you need from us, or any updates on your end?\n\nBest regards,\n{{agent_name}}',
     '[{"name":"recipient_name","label":"Recipient name"},{"name":"business_name","label":"Business name"},{"name":"agent_name","label":"Your name"}]'::jsonb, true)
  on conflict (agency_id, name) do nothing;

  get diagnostics inserted = row_count;
  return inserted;
end;
$$;

commit;

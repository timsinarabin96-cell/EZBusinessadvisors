-- Concord Deal Platform
-- Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
-- Proprietary & confidential. No copying, distribution, or modification without
-- prior written permission. See LICENSE for full terms.

-- =============================================================================
-- Marketing Materials Store v2 — automated print-broker system
-- -----------------------------------------------------------------------------
-- Brokers/agents order marketing materials from inside the CRM. Each product
-- has a cost_price (what the supplier charges the owner) and a sell_price
-- (what the ordering broker pays). Profit = sell - cost, computed automatically
-- at order time. When an order is paid, the system generates a WORK ORDER and
-- sends it to the configured supplier — the owner never touches anything.
--
-- Idempotent — safe to run repeatedly.
-- =============================================================================

-- ---- product catalog --------------------------------------------------------
create table if not exists public.store_products (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  category       text not null,                 -- business_cards | flyers | postcards | brochures | banners | signage | promo | apparel | stationery | envelopes
  description    text,
  cost_price     numeric(10,2) not null default 0,   -- what the supplier charges the owner
  sell_price     numeric(10,2) not null default 0,   -- what the ordering broker pays
  image_url      text,
  is_active      boolean not null default true,
  sort_order     int not null default 0,
  created_at     timestamptz not null default now()
);

-- ---- orders -----------------------------------------------------------------
create table if not exists public.store_orders (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid references public.profiles(id) on delete cascade,
  agency_id           uuid,
  product_id          uuid references public.store_products(id) on delete set null,
  product_name        text not null,
  quantity            int not null default 1,
  unit_cost           numeric(10,2) not null default 0,
  unit_sell           numeric(10,2) not null default 0,
  subtotal            numeric(10,2) not null default 0,   -- sell * qty
  cost_total          numeric(10,2) not null default 0,   -- cost * qty
  profit              numeric(10,2) not null default 0,   -- subtotal - cost_total
  shipping_address    jsonb not null default '{}'::jsonb,
  status              text not null default 'paid',       -- paid | work_order_sent | processing | shipped | delivered | cancelled
  work_order_ref      text,
  tracking_number     text,
  stripe_session_id   text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ---- settings (supplier routing, store name, etc.) --------------------------
create table if not exists public.store_settings (
  key        text primary key,
  value      text,
  updated_at timestamptz not null default now()
);

-- ---- indexes ----------------------------------------------------------------
create index if not exists idx_store_products_category on public.store_products (category);
create index if not exists idx_store_orders_user on public.store_orders (user_id);
create index if not exists idx_store_orders_status on public.store_orders (status);
create index if not exists idx_store_orders_created on public.store_orders (created_at desc);

-- ---- RLS --------------------------------------------------------------------
alter table public.store_products enable row level security;
alter table public.store_orders  enable row level security;
alter table public.store_settings enable row level security;

drop policy if exists store_products_read on public.store_products;
create policy store_products_read on public.store_products for select using (true);

drop policy if exists store_orders_owner on public.store_orders;
create policy store_orders_owner on public.store_orders for select using (user_id = auth.uid());

drop policy if exists store_orders_insert on public.store_orders;
create policy store_orders_insert on public.store_orders for insert with check (user_id = auth.uid());

drop policy if exists store_settings_read on public.store_settings;
create policy store_settings_read on public.store_settings for select using (true);

-- ---- seed catalog (cost = typical cheap-supplier price, sell = broker price) -
insert into public.store_products (name, category, description, cost_price, sell_price, sort_order) values
  ('Business Cards — Standard',       'business_cards', 'Premium 14pt matte, double-sided, full color. 500 pack.', 19.00, 59.00, 1),
  ('Business Cards — Premium',        'business_cards', 'Thick 32pt soft-touch with spot UV logo. 500 pack.', 34.00, 89.00, 2),
  ('Brochure — Tri-Fold',             'brochures', 'Glossy tri-fold, full color, 8.5x11 folded. 250 pack.', 52.00, 149.00, 3),
  ('Brochure — Premium Booklet',      'brochures', '12-page saddle-stitch booklet with brand. 100 pack.', 88.00, 249.00, 4),
  ('Flyer — Full Color',              'flyers', '8.5x11 full-color flyer, 100lb gloss. 500 pack.', 44.00, 129.00, 5),
  ('Postcard — 4x6',                  'postcards', 'Thick 16pt postcard for listings & outreach. 500 pack.', 39.00, 119.00, 6),
  ('Postcard — 6x9 Rack Card',        'postcards', 'Larger rack card for offices and storefronts. 250 pack.', 58.00, 159.00, 7),
  ('Envelope — #10 with Logo',        'envelopes', 'White #10 business envelopes, logo print. 500 pack.', 33.00, 99.00, 8),
  ('Envelope — Premium Lined',        'envelopes', '#10 with colored inside flap and logo. 250 pack.', 47.00, 129.00, 9),
  ('Banner — 3x6 Vinyl',              'banners', 'Heavy-duty vinyl with grommets. Office/storefront.', 29.00, 89.00, 10),
  ('Banner — Retractable Stand',      'banners', 'Retractable banner stand for events/open houses.', 74.00, 199.00, 11),
  ('Yard Sign — 2x4 Coroplast',       'signage', 'Reusable yard sign with stakes. Each.', 8.00, 24.00, 12),
  ('Pen — Branded (100)',             'promo', 'Custom-printed pens with logo. 100 pack.', 28.00, 79.00, 13),
  ('Notebook — Branded (50)',         'promo', 'Spiral notebooks with full-color logo cover. 50 pack.', 66.00, 189.00, 14),
  ('Polo — Embroidered Logo (10)',    'apparel', 'Comfortable polo with embroidered logo. 10 pack.', 91.00, 249.00, 15),
  ('Hoodie — Embroidered Logo (10)',  'apparel', 'Premium hoodie with embroidered logo. 10 pack.', 146.00, 399.00, 16),
  ('Letterhead — Full Color (500)',   'stationery', 'Full-color letterhead with logo. 500 sheets.', 41.00, 119.00, 17),
  ('Thank-You Cards (250)',           'stationery', 'Branded thank-you cards for closings & referrals. 250 pack.', 51.00, 139.00, 18)
on conflict do nothing;

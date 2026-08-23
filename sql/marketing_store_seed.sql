-- =============================================================================
-- Marketing store catalog seed (priced, ready to print/ship)
-- Idempotent: only inserts products that don't already exist.
-- =============================================================================

begin;

-- Ensure re-runs never duplicate the catalog.
create unique index if not exists marketing_products_name_key on public.marketing_products (name);

insert into public.marketing_products (name, category, description, base_price, is_active, sort_order) values
  ('Business Cards — Standard',        'business_cards', 'Premium 14pt matte, double-sided, full color. 500 pack.', 59.00, true, 1),
  ('Business Cards — Premium Soft-Touch', 'business_cards', 'Thick 32pt soft-touch finish with spot UV logo. 500 pack.', 89.00, true, 2),
  ('Brochure — Tri-Fold',              'brochures', 'Glossy tri-fold brochure, full color, 8.5x11 folded. 250 pack.', 149.00, true, 3),
  ('Brochure — Premium Saddle-Stitch', 'brochures', '12-page premium booklet with your brokerage brand. 100 pack.', 249.00, true, 4),
  ('Flyer — Full Color',               'flyers', '8.5x11 full-color flyer, 100lb gloss. 500 pack.', 129.00, true, 5),
  ('Postcard — 4x6',                   'postcards', 'Thick 16pt postcard for listings & buyer outreach. 500 pack.', 119.00, true, 6),
  ('Postcard — 6x9 Rack Card',         'postcards', 'Larger rack card for offices and storefronts. 250 pack.', 159.00, true, 7),
  ('Envelope — #10 Standard',          'envelopes', 'White #10 business envelopes with logo print. 500 pack.', 99.00, true, 8),
  ('Envelope — Premium Lined',         'envelopes', 'Premium #10 with colored inside flap and logo. 250 pack.', 129.00, true, 9),
  ('Banner — 3x6 Vinyl',               'banners', 'Heavy-duty vinyl banner with grommets. Great for office/storefront.', 89.00, true, 10),
  ('Banner — 4x8 Retractable Stand',   'banners', 'Retractable banner stand for events and open houses.', 199.00, true, 11),
  ('Signage — 2x4 Coroplast Yard Sign', 'signage', 'Reusable coroplast yard sign with stakes. Each.', 24.00, true, 12),
  ('Signage — LED Window Sign',        'signage', 'Backlit LED window sign with your logo. Each.', 349.00, true, 13),
  ('Promo — Branded Pen (100)',        'promo', 'Custom-printed pens with your logo. 100 pack.', 79.00, true, 14),
  ('Promo — Branded Notebook (50)',    'promo', 'Spiral notebooks with full-color logo cover. 50 pack.', 189.00, true, 15),
  ('Apparel — Logo Polo (10)',         'apparel', 'Comfortable polo with embroidered logo. 10 pack.', 249.00, true, 16),
  ('Apparel — Logo Hoodie (10)',       'apparel', 'Premium hoodie with embroidered logo. 10 pack.', 399.00, true, 17),
  ('Stationery — Letterhead (500)',    'stationery', 'Full-color letterhead with logo. 500 sheets.', 119.00, true, 18),
  ('Stationery — Thank-You Cards (250)', 'stationery', 'Branded thank-you cards for closings and referrals. 250 pack.', 139.00, true, 19)
on conflict do nothing;

-- Variants for the flagship products (sizes/finishes with price adjustments).
insert into public.marketing_product_variants (product_id, name, variant_type, price_adjustment, sort_order)
select p.id, 'Matte Finish', 'finish', 0, 1 from public.marketing_products p where p.name = 'Business Cards — Standard' and not exists (select 1 from public.marketing_product_variants v where v.product_id = p.id and v.name = 'Matte Finish');
insert into public.marketing_product_variants (product_id, name, variant_type, price_adjustment, sort_order)
select p.id, 'Glossy Finish', 'finish', 10.00, 2 from public.marketing_products p where p.name = 'Business Cards — Standard' and not exists (select 1 from public.marketing_product_variants v where v.product_id = p.id and v.name = 'Glossy Finish');
insert into public.marketing_product_variants (product_id, name, variant_type, price_adjustment, sort_order)
select p.id, 'With QR Code', 'style', 15.00, 3 from public.marketing_products p where p.name = 'Business Cards — Standard' and not exists (select 1 from public.marketing_product_variants v where v.product_id = p.id and v.name = 'With QR Code');
insert into public.marketing_product_variants (product_id, name, variant_type, price_adjustment, sort_order)
select p.id, 'Spot UV Logo', 'finish', 25.00, 4 from public.marketing_products p where p.name = 'Business Cards — Premium Soft-Touch' and not exists (select 1 from public.marketing_product_variants v where v.product_id = p.id and v.name = 'Spot UV Logo');

commit;

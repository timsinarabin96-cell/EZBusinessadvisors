-- Store design step: AI-generated or uploaded artwork attached to each order.
alter table public.store_orders
  add column if not exists artwork_url text,
  add column if not exists design_mode text not null default 'auto';  -- auto | ai | upload

-- index for supplier/settings lookups stays as-is; nothing else needed.

-- Concord Deal Platform
-- Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
-- Proprietary & confidential. No copying, distribution, or modification without
-- prior written permission. See LICENSE for full terms.

-- =============================================================================
-- FIX STORAGE POLICIES — 2026-08-26
-- -----------------------------------------------------------------------------
-- Symptom: photos/uploads fail with "Storage bucket 'listing_images' not
-- found (Bucket not found)" in the browser, even though the bucket exists and
-- is public. Root cause: the buckets were created without storage RLS
-- policies, so the anon/authenticated roles get 404 from storage.
--
-- RUN THIS IN: Supabase Dashboard → SQL Editor → Run (whole script).
-- Idempotent + additive — safe to run again.
-- =============================================================================

-- 1) anon + authenticated may LIST buckets (fixes getBucket 404)
drop policy if exists "public_buckets_read_anon" on storage.buckets;
create policy "public_buckets_read_anon" on storage.buckets
  for select to anon using (true);

drop policy if exists "public_buckets_read_auth" on storage.buckets;
create policy "public_buckets_read_auth" on storage.buckets
  for select to authenticated using (true);

-- 2) Public buckets: anon + authenticated can READ objects (public URLs)
do $$
declare b text;
begin
  foreach b in array array[
    'listing_images','profile_images','broker_photos','training',
    'recast_docs','bov_docs','cim_docs','bli_docs'
  ] loop
    execute format('drop policy if exists "public_objects_read_anon_%s" on storage.objects', b);
    execute format('create policy "public_objects_read_anon_%s" on storage.objects for select to anon using (bucket_id = %L)', b, b);
    execute format('drop policy if exists "public_objects_read_auth_%s" on storage.objects', b);
    execute format('create policy "public_objects_read_auth_%s" on storage.objects for select to authenticated using (bucket_id = %L)', b, b);
  end loop;
end $$;

-- 3) Public buckets: authenticated can INSERT / UPDATE / DELETE objects
do $$
declare b text;
begin
  foreach b in array array[
    'listing_images','profile_images','broker_photos','training',
    'recast_docs','bov_docs','cim_docs','bli_docs'
  ] loop
    execute format('drop policy if exists "public_objects_insert_auth_%s" on storage.objects', b);
    execute format('create policy "public_objects_insert_auth_%s" on storage.objects for insert to authenticated with check (bucket_id = %L)', b, b);
    execute format('drop policy if exists "public_objects_update_auth_%s" on storage.objects', b);
    execute format('create policy "public_objects_update_auth_%s" on storage.objects for update to authenticated using (bucket_id = %L) with check (bucket_id = %L)', b, b, b);
    execute format('drop policy if exists "public_objects_delete_auth_%s" on storage.objects', b);
    execute format('create policy "public_objects_delete_auth_%s" on storage.objects for delete to authenticated using (bucket_id = %L)', b, b);
  end loop;
end $$;

-- 4) Private buckets (documents, financial_docs): authenticated full access
do $$
declare b text;
begin
  foreach b in array array['documents','financial_docs'] loop
    execute format('drop policy if exists "private_objects_read_auth_%s" on storage.objects', b);
    execute format('create policy "private_objects_read_auth_%s" on storage.objects for select to authenticated using (bucket_id = %L)', b, b);
    execute format('drop policy if exists "private_objects_insert_auth_%s" on storage.objects', b);
    execute format('create policy "private_objects_insert_auth_%s" on storage.objects for insert to authenticated with check (bucket_id = %L)', b, b);
    execute format('drop policy if exists "private_objects_update_auth_%s" on storage.objects', b);
    execute format('create policy "private_objects_update_auth_%s" on storage.objects for update to authenticated using (bucket_id = %L) with check (bucket_id = %L)', b, b, b);
    execute format('drop policy if exists "private_objects_delete_auth_%s" on storage.objects', b);
    execute format('create policy "private_objects_delete_auth_%s" on storage.objects for delete to authenticated using (bucket_id = %L)', b, b);
  end loop;
end $$;

-- Sanity check: confirm the anon role can now see the listing_images bucket.
select count(*) as anon_visible_buckets
from storage.buckets
where id in ('listing_images','profile_images','broker_photos','training');

// Read-only live DB probe for commission waterfall audit (2026-08-24)
// Loads env from .env.local manually (no dotenv dep).
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
const env = {};
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const { createClient } = require('@supabase/supabase-js');
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('missing env'); process.exit(1); }
const svc = createClient(url, key, { auth: { persistSession: false } });

(async () => {
  const out = {};
  const q = async (label, fn) => {
    const res = await fn();
    out[label] = res.error ? { error: res.error.message } : res.data;
  };

  await q('commission_records.count', () =>
    svc.from('commission_records').select('id', { count: 'exact', head: true }));
  await q('commission_records.sample', () =>
    svc.from('commission_records').select('*').limit(5));
  await q('listings.columns.check', () =>
    svc.rpc('get_table_columns')); // may not exist

  // information_schema probe
  const schemaProbe = async (query) => {
    const { data, error } = await svc.from('_information_schema').select('*').limit(0).maybeSingle();
    return { error: error ? error.message : null };
  };
  out['info_schema.direct'] = await schemaProbe();

  // Check column existence via a raw select on each candidate column
  for (const col of ['commission_split_agent', 'commission_split_brokerage']) {
    const r = await svc.from('listings').select(col).limit(1);
    out[`listings.${col}`] = r.error ? { error: r.error.message } : { ok: true, value: r.data?.[0]?.[col] ?? null };
  }

  // agency_members.commission_split
  {
    const r = await svc.from('agency_members').select('id, commission_split').limit(3);
    out['agency_members.commission_split'] = r.error ? { error: r.error.message } : r.data;
  }

  // deals with status closed — do they have commission rows?
  {
    const r = await svc.from('deals').select('id, listing_id, status, purchase_price').eq('status', 'closed').limit(10);
    out['deals.closed'] = r.error ? { error: r.error.message } : r.data;
    if (r.data?.length) {
      const ids = r.data.map(d => d.id);
      const c = await svc.from('commission_records').select('*').in('deal_id', ids);
      out['commission_records.for_closed_deals'] = c.error ? { error: c.error.message } : c.data;
    }
  }

  // total deals + status distribution
  {
    const r = await svc.from('deals').select('status');
    if (!r.error) {
      const dist = {};
      r.data.forEach(d => { dist[d.status] = (dist[d.status] || 0) + 1; });
      out['deals.status_distribution'] = dist;
    } else out['deals.status_distribution'] = { error: r.error.message };
  }

  // success_fee_records exist? (the pattern that DOES work)
  {
    const r = await svc.from('success_fee_records').select('id', { count: 'exact', head: true });
    out['success_fee_records.count'] = r.error ? { error: r.error.message } : r.count;
  }

  // triggers on deals/listings (postgres via rpc fallback: try a stored proc if present)
  {
    const r = await svc.rpc('audit_list_triggers').select().maybeSingle();
    out['triggers.rpc'] = r.error ? { error: r.error.message } : r.data;
  }

  // listings with commission_split_agent populated
  {
    const r = await svc.from('listings').select('id, commission_split_agent, commission_split_brokerage').not('commission_split_agent', 'is', null).limit(5);
    out['listings.split_populated'] = r.error ? { error: r.error.message } : r.data;
  }

  console.log(JSON.stringify(out, null, 2));
})();

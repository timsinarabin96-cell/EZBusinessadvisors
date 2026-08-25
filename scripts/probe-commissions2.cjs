// Read-only probe #2: success fees, milestones, deals/listings columns
const fs = require('fs');
const path = require('path');
const env = {};
for (const line of fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const { createClient } = require('@supabase/supabase-js');
const svc = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

(async () => {
  const out = {};

  // success_fee_records: exists? count?
  {
    const r = await svc.from('success_fee_records').select('*', { count: 'exact', head: true });
    out['success_fee_records.head'] = r.error ? { error: r.error.message } : { count: r.count };
    if (!r.error && r.count > 0) {
      const s = await svc.from('success_fee_records').select('id, listing_id, sale_price, fee_percent, fee_cents, status').limit(5);
      out['success_fee_records.sample'] = s.data;
    }
  }

  // deal_closing_milestones: any completed closing-category milestones?
  {
    const r = await svc.from('deal_closing_milestones').select('category, completed_at', { count: 'exact', head: true });
    out['milestones.head'] = r.error ? { error: r.error.message } : { count: r.count };
    if (!r.error && r.count > 0) {
      const s = await svc.from('deal_closing_milestones').select('title, category, completed_at').limit(10);
      out['milestones.sample'] = s.data;
    }
  }

  // Full listings row: which commission/fee columns actually exist?
  {
    const r = await svc.from('listings').select('*').limit(1);
    if (!r.error && r.data?.[0]) {
      const keys = Object.keys(r.data[0]).sort();
      out['listings.columns'] = keys.filter(k => /commission|fee|split|price|status|agency/.test(k));
      out['listings.sample_vals'] = {
        commission_split_agent: r.data[0].commission_split_agent,
        commission_split_brokerage: r.data[0].commission_split_brokerage,
        status: r.data[0].status,
      };
    } else out['listings.columns'] = { error: r.error?.message };
  }

  // Full deals row: which columns exist (fee_rate? commission?)
  {
    const r = await svc.from('deals').select('*').limit(1);
    if (!r.error && r.data?.[0]) {
      out['deals.columns'] = Object.keys(r.data[0]).sort();
    } else out['deals.columns'] = { error: r.error?.message };
  }

  // commissions list join check: does listings FK exist on commission_records?
  {
    const r = await svc.from('commission_records').select('*, listings(business_name), profiles(full_name)').limit(1);
    out['commission_records.join'] = r.error ? { error: r.error.message } : r.data;
  }

  // agency_members columns
  {
    const r = await svc.from('agency_members').select('*').limit(1);
    if (!r.error && r.data?.[0]) {
      out['agency_members.columns'] = Object.keys(r.data[0]).sort();
    } else out['agency_members.columns'] = { error: r.error?.message };
  }

  // hiring_packages live
  {
    const r = await svc.from('hiring_packages').select('id, name, role, commission_split, is_active');
    out['hiring_packages'] = r.error ? { error: r.error.message } : r.data;
  }

  console.log(JSON.stringify(out, null, 2));
})();

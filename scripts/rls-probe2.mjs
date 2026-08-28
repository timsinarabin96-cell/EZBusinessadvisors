import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'
function parseEnv(s){return Object.fromEntries(s.split(/\r?\n/).filter(l=>l&&!l.trimStart().startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');let k=l.slice(0,i).trim();let v=l.slice(i+1).trim();if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'")))v=v.slice(1,-1);return[k,v]}))}
const env=parseEnv(readFileSync('.env.local','utf8'));
const c = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const { data: si } = await c.auth.signInWithPassword({ email: 'harbor.agent@tenant.test', password: 'Tenant!Test#2026#Concord' });
console.log('user:', si.user.id);
// membership lookup
const { data: mem, error: memErr } = await c.from('agency_members').select('*').eq('profile_id', si.user.id);
console.log('MEMBERSHIPS:', memErr ? 'ERR '+memErr.message : JSON.stringify(mem));
// try insert WITH agency_id explicitly
const { data: ins, error: insErr } = await c.from('listings').insert({ business_name: 'RLS Probe 2', agent_id: si.user.id, agency_id: 'ee99cb99-552e-42ba-ae6d-eac516f63372', status: 'draft', review_stage: 'draft' }).select().single();
console.log('INSERT w/ agency:', insErr ? 'ERR ' + insErr.message : 'OK ' + ins.id);
if (ins) await c.from('listings').delete().eq('id', ins.id);

import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'
function parseEnv(s){return Object.fromEntries(s.split(/\r?\n/).filter(l=>l&&!l.trimStart().startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');let k=l.slice(0,i).trim();let v=l.slice(i+1).trim();if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'")))v=v.slice(1,-1);return[k,v]}))}
const env=parseEnv(readFileSync('.env.local','utf8'));
const c = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const { data: si, error: sie } = await c.auth.signInWithPassword({ email: 'harbor.agent@tenant.test', password: 'Tenant!Test#2026#Concord' });
if (sie) { console.log('SIGNIN ERR', sie.message); process.exit(1) }
console.log('signed in as', si.user.email);
const { data, error } = await c.from('listings').insert({ business_name: 'RLS Probe', agent_id: si.user.id, status: 'draft', review_stage: 'draft' }).select().single();
console.log('INSERT:', error ? 'ERR ' + error.message : 'OK ' + data.id);
if (data) { await c.from('listings').delete().eq('id', data.id); console.log('cleaned'); }

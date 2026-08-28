import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'
function parseEnv(s){return Object.fromEntries(s.split(/\r?\n/).filter(l=>l&&!l.trimStart().startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');let k=l.slice(0,i).trim();let v=l.slice(i+1).trim();if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'")))v=v.slice(1,-1);return[k,v]}))}
const env=parseEnv(readFileSync('.env.local','utf8'));
const svc = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data, error } = await svc.from('agency_members').insert({
  agency_id: 'ee99cb99-552e-42ba-ae6d-eac516f63372',
  profile_id: 'fd1a2990-bd45-4c11-83cf-18cad852daaa',
  role: 'agent',
  is_owner: false,
}).select().single();
console.log('INSERT MEMBER:', error ? 'ERR ' + error.message : 'OK ' + JSON.stringify(data).slice(0,120));

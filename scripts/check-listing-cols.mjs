import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
function parseEnv(s){return Object.fromEntries(s.split(/\r?\n/).filter(l=>l&&!l.trimStart().startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()]}))}
const env = parseEnv(readFileSync('.env.local','utf8'))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
const { data, error } = await sb.from('listings').select('*').limit(1)
if (error) { console.error('ERR', error.message); process.exit(1) }
const row = data[0] || {}
const cols = Object.keys(row).sort()
console.log('video_url present:', 'video_url' in row)
console.log('gallery_json present:', 'gallery_json' in row)
console.log('ai_metadata present:', 'ai_metadata' in row)
console.log('sample cols:', cols.slice(0, 15).join(', '), '…')

/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// scripts/provision-white-label.mjs — ONE-COMMAND white-label CRM handoff.
// -----------------------------------------------------------------------------
// Sells a fully separate CRM instance to a broker:
//   1. Creates a brand-new Supabase project (their OWN database — you can
//      never see their data; you only collect the license fee).
//   2. Loads the complete platform schema into it (RUN_ALL.sql + deltas).
//   3. Deploys the app to Vercel as their own project with their own keys.
//   4. Writes a handover sheet (URLs, keys, next steps) for the broker.
//
// You only ever see: the Stripe license payment. This script is the delivery.
//
// Usage:
//   SUPABASE_ACCESS_TOKEN=sbp_... VERCEL_TOKEN=... node scripts/provision-white-label.mjs \
//     --name "Acme Brokerage" --email owner@acme.com \
//     [--org "EZ Business Advisors" | --org <org-id>] \
//     [--db-pass <16+ chars>] [--region us-east-1] [--plan free|pro] \
//     [--env STRIPE_SECRET_KEY=sk_...] [--env STRIPE_WEBHOOK_SECRET=whsec_...] \
//     [--skip-deploy] [--out ./outputs]
//
// Dry-run (validate tokens + resolve org, create NOTHING):
//   SUPABASE_ACCESS_TOKEN=sbp_... node scripts/provision-white-label.mjs --check
// =============================================================================

import { execFileSync } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..')
const API = 'https://api.supabase.com/v1'

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------
const args = process.argv.slice(2)
const flag = (name) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
const has = (name) => args.includes(name)

const NAME = flag('--name')
const EMAIL = flag('--email')
const ORG = flag('--org') || 'EZ Business Advisors'
const DB_PASS = flag('--db-pass')
const REGION = flag('--region') || 'us-east-1'
const PLAN = flag('--plan') || 'free'
const OUT_DIR = resolve(flag('--out') || join(REPO_ROOT, 'outputs'))
const SKIP_DEPLOY = has('--skip-deploy')
const CHECK_ONLY = has('--check')

// --env KEY=VALUE pairs (broker's own Stripe keys, etc.)
const EXTRA_ENV = {}
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--env') {
    const kv = args[i + 1]
    const eq = kv.indexOf('=')
    if (eq <= 0) throw new Error(`Bad --env value: ${kv} (expected KEY=VALUE)`)
    EXTRA_ENV[kv.slice(0, eq)] = kv.slice(eq + 1)
  }
}

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN
const VERCEL_TOKEN = process.env.VERCEL_TOKEN

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const log = (m) => console.log(`\n▶ ${m}`)
const ok = (m) => console.log(`  ✅ ${m}`)
const warn = (m) => console.log(`  ⚠️  ${m}`)

const slugify = (s) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'brokerage'

const genPass = () => randomBytes(14).toString('base64url').replace(/[-_]/g, 'x') // URL-safe, no padding
const genSecret = () => randomBytes(24).toString('hex')

async function supabase(path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    method: opts.method || 'GET',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
  const text = await res.text()
  let json = null
  try { json = text ? JSON.parse(text) : null } catch { /* non-JSON */ }
  if (!res.ok) {
    const msg = json?.message || json?.error || json?.msg || text || res.statusText
    throw new Error(`Supabase API ${res.status} ${path}: ${msg}`)
  }
  return json
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

// ---------------------------------------------------------------------------
// 0) Auth check + org resolution
// ---------------------------------------------------------------------------
async function resolveOrg() {
  log('Resolving Supabase organization')
  let orgs = await supabase('/organizations')
  // Fine-grained tokens may not list orgs — fall back to the org of an
  // existing project the token CAN see (same org, by definition).
  if (!orgs || orgs.length === 0) {
    warn('Organizations endpoint returned empty — deriving org from an existing project')
    const projects = await supabase('/projects?limit=1')
    const proj = (projects || [])[0]
    if (proj?.organization_id) {
      orgs = [{ id: proj.organization_id, name: proj.organization_id }]
      ok(`Derived organization from project "${proj.name}": ${proj.organization_id}`)
    }
  }
  let match = (orgs || []).find((o) => o.id === ORG || o.name === ORG)
  if (!match && !args.includes('--org')) {
    // No --org given: use the first org the token can see (derived or listed).
    match = (orgs || [])[0]
  }
  if (!match) {
    throw new Error(`Organization not found: "${ORG}". Available: ${(orgs || []).map((o) => o.name).join(', ')}`)
  }
  ok(`Organization: ${match.name} (${match.id})`)
  return match.id
}

// ---------------------------------------------------------------------------
// 1) Create the broker's own Supabase project
// ---------------------------------------------------------------------------
async function createProject(orgId, name, dbPass) {
  log(`Creating Supabase project "${name}" (${REGION}, plan ${PLAN}) — their own database`)
  const proj = await supabase('/projects', {
    method: 'POST',
    body: {
      name,
      org_id: orgId,
      db_pass: dbPass,
      region: REGION,
      plan: PLAN,
    },
  })
  ok(`Project created: ref=${proj.id} (${proj.region}, ${proj.plan})`)
  return proj.id
}

async function waitHealthy(ref) {
  log(`Waiting for project ${ref} to become healthy`)
  const deadline = Date.now() + 5 * 60_000
  while (Date.now() < deadline) {
    const p = await supabase(`/projects/${ref}`)
    const status = String(p.status || '').toUpperCase()
    if (status === 'ACTIVE_HEALTHY' || status === 'ACTIVE' || status === 'INACTIVE_ACTIVE') {
      ok(`Project status: ${status}`)
      return
    }
    if (status.includes('FAIL') || status.includes('ERROR')) {
      throw new Error(`Project ${ref} entered bad status: ${status}`)
    }
    await wait(5000)
  }
  throw new Error(`Project ${ref} not healthy within 5 minutes (last status poll timed out)`)
}

async function fetchKeys(ref) {
  log('Fetching API keys')
  const keys = await supabase(`/projects/${ref}/api-keys?reveal=true`)
  const anon = keys.find((k) => k.name === 'anon')
  const service = keys.find((k) => k.name === 'service_role')
  if (!anon || !service) throw new Error('Could not find anon/service_role keys')
  ok('anon + service_role keys fetched')
  return { anon: anon.api_key, service: service.api_key }
}

// ---------------------------------------------------------------------------
// 2) Load the complete schema (RUN_ALL.sql + newer delta files)
// ---------------------------------------------------------------------------
async function runSchema(ref) {
  const sqlDir = join(REPO_ROOT, 'sql')
  const runAll = join(sqlDir, 'RUN_ALL.sql')
  const files = [runAll]
  // Deltas = every .sql newer than RUN_ALL (incremental fixes landed after it).
  const runAllMtime = statSync(runAll).mtimeMs
  const deltas = readdirSync(sqlDir)
    .filter((f) => f.endsWith('.sql') && f !== 'RUN_ALL.sql')
    .map((f) => join(sqlDir, f))
    .filter((f) => statSync(f).mtimeMs > runAllMtime)
    .sort()
  files.push(...deltas)

  const errors = []
  for (const file of files) {
    const sql = readFileSync(file, 'utf8')
    const label = file.replace(sqlDir + '/', '')
    try {
      await supabase(`/projects/${ref}/database/query`, { method: 'POST', body: { query: sql } })
      ok(`Schema loaded: ${label} (${(sql.length / 1024).toFixed(0)} KB)`)
    } catch (e) {
      errors.push({ label, error: e.message })
      warn(`Schema file had errors (continuing): ${label} → ${e.message.slice(0, 200)}`)
    }
  }
  if (errors.length) {
    warn(`${errors.length} schema file(s) reported errors — review before handover.`)
  }
  return errors
}

// ---------------------------------------------------------------------------
// 3) Deploy to Vercel (their own project, their own keys)
// ---------------------------------------------------------------------------
function vercelBin() {
  return join(REPO_ROOT, 'node_modules', '.bin', 'vercel')
}

async function deployVercel(slug, env) {
  if (SKIP_DEPLOY) {
    warn('--skip-deploy set — not deploying to Vercel')
    return null
  }
  if (!VERCEL_TOKEN) {
    warn('VERCEL_TOKEN not set — skipping Vercel deploy (handover sheet will include manual deploy steps)')
    return null
  }
  log('Deploying to Vercel (this builds ~5–10 min on first deploy)')
  const flags = ['deploy', '--prod', '--yes', '--token', VERCEL_TOKEN, '--name', slug]
  for (const [k, v] of Object.entries(env)) {
    flags.push('--build-env', `${k}=${v}`, '--env', `${k}=${v}`)
  }
  // Link scope: use the token's default team; CLI handles it.
  const out = execFileSync(vercelBin(), flags, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 20 * 60_000,
  })
  const url = (out.match(/https:\/\/[^\s]+/g) || []).pop()
  ok(`Deployed: ${url}`)
  return url
}

// ---------------------------------------------------------------------------
// 4) Handover sheet
// ---------------------------------------------------------------------------
function writeHandover({ name, email, slug, ref, dbPass, keys, url, env, errors }) {
  mkdirSync(OUT_DIR, { recursive: true })
  const file = join(OUT_DIR, `${slug}-handover.md`)
  const lines = [
    `# 🏛️ White-Label CRM Handover — ${name}`,
    '',
    `- **Broker contact:** ${email || '(not provided)'}`,
    `- **Provisioned:** ${new Date().toISOString()}`,
    '',
    '## 🔗 Login',
    `- **Platform URL:** ${url || '(deploy skipped — see "Manual deploy" below)'}`,
    '- First user to sign up at the URL becomes the agency owner (follow the onboarding wizard).',
    '',
    '## 🗄️ Infrastructure (theirs — you cannot see this data)',
    `- **Supabase project ref:** \`${ref}\``,
    `- **Region / plan:** ${REGION} / ${PLAN}`,
    `- **API URL:** https://${ref}.supabase.co`,
    `- **Anon key:** \`${keys.anon}\``,
    `- **Service role key:** \`${keys.service}\` (server-only — never expose in browser code)`,
    `- **DB connection (postgres):** postgresql://postgres.${ref}:${dbPass}@aws-0-${REGION}.pooler.supabase.com:6543/postgres`,
    '',
    '## ⚙️ Env vars configured on Vercel',
    ...Object.keys(env).map((k) => `- \`${k}\``),
    '',
    '## 📋 Next steps for the broker',
    '- Add their custom domain in Vercel + Supabase Auth (Site URL) if white-labeling to their own domain.',
    '- (Optional) Add their own Stripe keys: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (theirs — they keep 100% of their subscription revenue).',
    '- (Optional) Replace VAPID pair if they want their own push-notification identity.',
    '- Verify: sign up → create agency → post a listing → check /pricing.',
    '',
  ]
  if (errors && errors.length) {
    lines.push('## ⚠️ Schema warnings (review before handover)')
    for (const e of errors) lines.push(`- \`${e.label}\`: ${e.error}`)
    lines.push('')
  }
  if (!url) {
    lines.push('## 🛠️ Manual deploy (run from a clone of the repo)')
    lines.push('```bash')
    lines.push(`vercel deploy --prod --name ${slug} \\`)
    for (const [k, v] of Object.entries(env)) lines.push(`  --build-env ${k}=${v} --env ${k}=${v} \\`)
    lines.push('```')
    lines.push('')
  }
  writeFileSync(file, lines.join('\n'))
  ok(`Handover sheet: ${file}`)
  return file
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  if (!TOKEN) throw new Error('SUPABASE_ACCESS_TOKEN (sbp_...) is required. Get one at supabase.com → Account → Access Tokens.')

  if (CHECK_ONLY) {
    log('--check mode: validating token + resolving org only (nothing created)')
    const orgId = await resolveOrg()
    ok(`Token valid. Organization: ${orgId}`)
    console.log('\nReady to provision. Run without --check to create the broker stack.')
    return
  }

  if (!NAME) throw new Error('--name "Brokerage Name" is required (or use --check)')
  const slug = slugify(NAME)
  const dbPass = DB_PASS || genPass()
  const orgId = await resolveOrg()

  const ref = await createProject(orgId, NAME, dbPass)
  await waitHealthy(ref)
  const keys = await fetchKeys(ref)
  const schemaErrors = await runSchema(ref)

  // Per-instance secrets
  const vapid = await import('web-push').then((m) => m.default.generateVAPIDKeys()).catch(() => null)
  const siteUrl = SKIP_DEPLOY ? `https://${slug}.vercel.app` : `https://${slug}.vercel.app`

  const env = {
    NEXT_PUBLIC_SUPABASE_URL: `https://${ref}.supabase.co`,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: keys.anon,
    SUPABASE_SERVICE_ROLE_KEY: keys.service,
    NEXT_PUBLIC_SITE_URL: siteUrl,
    NEXT_PUBLIC_APP_URL: siteUrl,
    CRON_SECRET: genSecret(),
    ...(vapid
      ? { NEXT_PUBLIC_VAPID_PUBLIC_KEY: vapid.publicKey, VAPID_PRIVATE_KEY: vapid.privateKey, VAPID_SUBJECT: `mailto:${EMAIL || 'admin@concorddealplatform.com'}` }
      : {}),
    ...EXTRA_ENV,
  }

  const url = await deployVercel(slug, env)
  const sheet = writeHandover({ name: NAME, email: EMAIL, slug, ref, dbPass, keys, url, env, errors: schemaErrors })

  console.log('\n' + '='.repeat(60))
  console.log('🎉 White-label CRM provisioned.')
  console.log(`  Broker:   ${NAME}`)
  console.log(`  URL:      ${url || '(deploy skipped)'}`)
  console.log(`  Supabase: https://${ref}.supabase.co`)
  console.log(`  Handover: ${sheet}`)
  console.log('='.repeat(60))
  console.log('\nYou collect the license payment via Stripe. Their data lives in THEIR database — you never see it.')
}

main().catch((e) => {
  console.error(`\n❌ ${e.message}`)
  process.exit(1)
})

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'

// =============================================================================
// Route audit — guards the class of bug that shipped three times in one pass:
// UI links / API fetches pointing at routes that don't exist (hiring
// subpaths, certificate verify, marketplace/pricing). Fails the build if any
// internal link or API call dangles. Static + fast.
// =============================================================================

function walk(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (name === 'node_modules') continue
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else out.push(p)
  }
  return out
}

/** Collect real page routes (dynamic segments → *). */
function collectPages(): Set<string> {
  const pages = new Set<string>()
  for (const p of walk('app')) {
    if (!p.endsWith('/page.tsx')) continue
    let rel = p.slice('app/'.length, -'/page.tsx'.length)
    rel = rel.replace(/^\([^)]*\)\/?/, '') // strip route groups
    rel = rel.replace(/\[[^\]]+\]/g, '*')
    pages.add(rel ? '/' + rel : '/')
  }
  return pages
}

/** Collect real API routes. */
function collectApis(): Set<string> {
  const apis = new Set<string>()
  for (const p of walk('app/api')) {
    if (!p.endsWith('/route.ts')) continue
    let rel = p.slice('app/api/'.length, -'/route.ts'.length)
    rel = rel.replace(/\[[^\]]+\]/g, '*')
    apis.add('/api/' + rel)
  }
  return apis
}

function matches(path: string, table: Set<string>): boolean {
  if (table.has(path)) return true
  const seg = path.split('/')
  for (let i = seg.length; i > 0; i--) {
    if (table.has(seg.slice(0, i).join('/') + '/*'.repeat(seg.length - i))) return true
  }
  return false
}

function scanSources(): { links: Set<string>; apiCalls: Set<string> } {
  const links = new Set<string>()
  const apiCalls = new Set<string>()
  const files = [...walk('app'), ...walk('components')].filter((f) => f.endsWith('.tsx') || f.endsWith('.ts'))
  for (const f of files) {
    const src = readFileSync(f, 'utf8')
    // href="/path"
    for (const m of src.matchAll(/href="(\/[^"#?]*)/g)) {
      const u = m[1].split('?')[0]
      if (!u.startsWith('/api/')) links.add(u)
    }
    // href={`/path/${var}`} → *
    for (const m of src.matchAll(/href=\{`(\/[^`"]*)`/g)) {
      const u = m[1].split('?')[0].replace(/\$\{[^}]+\}/g, '*')
      if (!u.startsWith('/api/')) links.add(u)
    }
    // fetch('/api/...') and fetch(`/api/...`)
    for (const m of src.matchAll(/fetch\(["'`](\/api\/[^"'`?]*)/g)) {
      apiCalls.add(m[1].split('?')[0].replace(/\$\{[^}]+\}/g, '*'))
    }
    // quoted "/api/..." strings used as endpoints (e.g. href="/api/...", router.push)
    for (const m of src.matchAll(/["'`](\/api\/[^"'`$?]+)["'`]/g)) {
      const u = m[1].split('?')[0]
      if (!u.includes('${')) apiCalls.add(u)
    }
  }
  return { links, apiCalls }
}

test('route audit: every internal page link resolves to a real route', () => {
  const pages = collectPages()
  const { links } = scanSources()
  const broken = [...links].filter((l) => !matches(l, pages)).sort()
  assert.deepEqual(broken, [], `Dangling page links: ${broken.join(', ')}`)
})

test('route audit: every API fetch resolves to a real API route', () => {
  const apis = collectApis()
  const { apiCalls } = scanSources()
  const broken = [...apiCalls].filter((a) => !matches(a, apis)).sort()
  assert.deepEqual(broken, [], `Dangling API calls: ${broken.join(', ')}`)
})

test('route audit: sample sanity — known routes exist', () => {
  const pages = collectPages()
  const apis = collectApis()
  assert.ok(pages.has('/pricing'), '/pricing page exists')
  assert.ok(pages.has('/license'), '/license page exists')
  assert.ok(apis.has('/api/hiring/applications'), 'hiring applications route exists')
  assert.ok(apis.has('/api/hiring/review'), 'hiring review route exists')
  assert.ok(apis.has('/api/certificates'), 'certificates route exists')
  assert.ok(apis.has('/api/stripe/webhook'), 'stripe webhook route exists')
})

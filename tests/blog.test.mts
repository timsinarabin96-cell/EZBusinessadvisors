import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const lib = readFileSync('lib/blog.ts', 'utf8')
const route = readFileSync('app/api/blog/route.ts', 'utf8')
const hub = readFileSync('app/(public)/marketplace/insights/page.tsx', 'utf8')
const article = readFileSync('app/(public)/marketplace/insights/[slug]/page.tsx', 'utf8')
const page = readFileSync('app/dashboard/blog/page.tsx', 'utf8')
const shell = readFileSync('components/layout/AppShell.tsx', 'utf8')

test('blog: engine is DDL-free on platform_settings with a curated seed set', () => {
  assert.match(lib, /platform_settings/)
  assert.match(lib, /const SETTINGS_KEY = 'blog_posts'/)
  assert.match(lib, /export const SEED_POSTS/)
  assert.match(lib, /business-valuation-guide/)
  assert.match(lib, /sba-loan-guide/)
  assert.match(lib, /recast-explained/)
  assert.match(lib, /confidentiality-nda/)
})

test('blog: lib exposes public + admin CRUD with slugify', () => {
  assert.match(lib, /export async function listPublishedPosts/)
  assert.match(lib, /export async function listAllPosts/)
  assert.match(lib, /export async function getPostBySlug/)
  assert.match(lib, /export async function savePost/)
  assert.match(lib, /export async function deletePost/)
  assert.match(lib, /const slugify/)
  assert.match(lib, /Never show an empty hub/)
})

test('blog: API is public-read, broker-gated write', () => {
  assert.match(route, /GET/)
  assert.match(route, /POST/)
  assert.match(route, /DELETE/)
  assert.match(route, /authenticateProfileRequest/)
  assert.match(route, /Broker access required/)
  assert.match(route, /\?all=1/)
  assert.match(route, /listPublishedPosts/)
  assert.match(route, /savePost/)
})

test('blog: public hub + article render from the engine', () => {
  assert.match(hub, /listPublishedPosts/)
  assert.match(hub, /posts\.map/)
  assert.match(hub, /Read article/)
  assert.match(article, /getPostBySlug/)
  assert.match(article, /generateStaticParams/)
  assert.match(article, /generateMetadata/)
  assert.match(article, /notFound\(\)/)
  assert.match(article, /revalidate = 60/)
})

test('blog: dashboard manager has list, editor, publish/unpublish, delete', () => {
  assert.match(page, /AppShell active="Blog & Insights"/)
  assert.match(page, /\/api\/blog\?all=1/)
  assert.match(page, /New article/)
  assert.match(page, /togglePublish/)
  assert.match(page, /Unpublish/)
  assert.match(page, /Publish/)
  assert.match(page, /Add section/)
  assert.match(page, /sections\.filter/)
})

test('blog: nav includes Blog & Insights under Marketing & Growth', () => {
  assert.match(shell, /\/dashboard\/blog/)
  assert.match(shell, /'Blog & Insights'/)
  assert.match(shell, /'Marketing & Growth'/)
})

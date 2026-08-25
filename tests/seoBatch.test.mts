import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const industryPage = readFileSync('app/(public)/marketplace/industry/[slug]/page.tsx', 'utf8')
const sba = readFileSync('components/public/SbaCalculator.tsx', 'utf8')
const similar = readFileSync('components/public/SimilarListings.tsx', 'utf8')
const homepage = readFileSync('app/(public)/page.tsx', 'utf8')
const detailPage = readFileSync('app/(public)/marketplace/listings/[id]/page.tsx', 'utf8')
const detailInteractive = readFileSync('components/public/ListingDetailInteractive.tsx', 'utf8')

test('industry hubs: SEO page per industry with metadata + JSON-LD', () => {
  assert.match(industryPage, /generateMetadata/)
  assert.match(industryPage, /generateStaticParams/)
  assert.match(industryPage, /SLUG_TO_INDUSTRY/)
  assert.match(industryPage, /CollectionPage/)
  assert.match(industryPage, /Businesses for Sale/)
  assert.match(industryPage, /canonical/)
  assert.match(industryPage, /slugify/)
})

test('industry hubs: filters listings by industry + industry quick-nav', () => {
  assert.match(industryPage, /filter\(\(l\) => l\.industry/)
  assert.match(industryPage, /is_featured/)
  assert.match(industryPage, /avg asking/)
  assert.match(industryPage, /marketplace\/industry/)
})

test('sba calculator: deterministic affordability estimate with controls', () => {
  assert.match(sba, /SBA 7\(a\) Payment Calculator/)
  assert.match(sba, /RATE_LOW/)
  assert.match(sba, /monthly\.low/)
  assert.match(sba, /down \(10%\)/)
  assert.match(sba, /monthly payment/i)
  assert.match(sba, /APR/)
  assert.match(sba, /lender to confirm/)
  assert.doesNotMatch(sba, /deepseek|claude|anthropic|openai/i)
})

test('similar listings: zero-token recommendation engine', () => {
  assert.match(similar, /Similar Businesses/)
  assert.match(similar, /searchPublicListings/)
  assert.match(similar, /points \+= 40/)
  assert.match(similar, /slice\(0, 3\)/)
  assert.match(similar, /You Might Also Like/)
  assert.doesNotMatch(similar, /deepseek|claude|anthropic|openai/i)
})

test('website: homepage has browse-by-industry SEO entry points', () => {
  assert.match(homepage, /Browse by industry/)
  assert.match(homepage, /marketplace\/industry/)
  assert.match(homepage, /slugify/)
})

test('website: detail page wires similar listings', () => {
  assert.match(detailPage, /SimilarListings/)
})

test('website: detail financial card wires SBA calculator', () => {
  assert.match(detailInteractive, /SbaCalculator/)
  assert.match(detailInteractive, /import SbaCalculator/)
})

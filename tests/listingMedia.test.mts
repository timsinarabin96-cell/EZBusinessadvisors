import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const intelligence = readFileSync('lib/listingIntelligence.ts', 'utf8')
const form = readFileSync('components/listings/IntelligentListingForm.tsx', 'utf8')

test('media: listing model carries gallery_images through to image_urls', () => {
  assert.match(intelligence, /gallery_images: string\[\]/)
  assert.match(intelligence, /gallery_images: \[\],/)
  assert.match(intelligence, /image_urls: input\.gallery_images\.length \? input\.gallery_images : null/)
})

test('media: studio has a Photos & Video section', () => {
  assert.match(form, /id: 'media', label: 'Photos & Video'/)
  assert.match(form, /<MediaSection form=\{form\} setValue=\{setValue\} listingId=\{createdListingId\} \/>/)
})

test('media: MediaSection uploads to the listing_images bucket with previews', () => {
  assert.match(form, /uploadListingImages/)
  assert.match(form, /deleteListingImage/)
  assert.match(form, /Choose photos/)
  assert.match(form, /accept="image\/jpeg,image\/png,image\/webp"/)
  assert.match(form, /COVER/)
  assert.match(form, /gallery_images\.map/)
  assert.match(form, /Walkthrough \/ promo video URL/)
})

test('media: edit mode restores existing gallery', () => {
  assert.match(form, /gallery_images: Array\.isArray\(\(l as any\)\.image_urls\)/)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { generateStorePrintPdf, printSpecFor } from '../lib/storePrintFiles.ts'
import { writeFileSync } from 'node:fs'

test('print-ready PDF generates valid bytes for postcards', async () => {
  const pdf = await generateStorePrintPdf({
    orderId: 'test-1', workOrderRef: 'WO-TEST-PRINT', productName: 'Postcard — 4x6',
    category: 'postcards', quantity: 500,
    shipTo: { name: 'John Broker', line1: '123 Main St', city: 'Buffalo', state: 'NY', zip: '14201' },
    businessName: 'Harbor Diner', headline: 'Confidential Business Opportunity',
    contact: { name: 'EZ Business Advisors', phone: '555-0100', email: 'rtimsina@ezbusinessadvisors.com', website: 'ezbusinessadvisors.com' },
    brand: { name: 'CONCORD Deal Platform' },
  })
  assert.ok(pdf.length > 500, 'pdf has bytes')
  assert.equal(pdf[0], 0x25, 'starts with %')
  assert.equal(pdf[1], 0x50, 'starts with P')
  assert.equal(pdf[2], 0x44, 'starts with D')
  assert.equal(pdf[3], 0x46, 'starts with F')
  writeFileSync('/tmp/test-print.pdf', Buffer.from(pdf))
})

test('print spec sizes per category', () => {
  assert.equal(printSpecFor('business_cards').width, 252)
  assert.equal(printSpecFor('postcards').height, 432)
  assert.equal(printSpecFor('flyers').width, 612)
})

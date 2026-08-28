// Sample A: fill the boss's REAL branded NDA via the existing overlay engine.
import { writeFileSync } from 'fs'
import { readFile } from 'fs/promises'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const path = require('path')

const { composeFilledPdf } = await import('../lib/pdfOverlay.ts')
const { NDA_TEMPLATE } = await import('../lib/pdfOverlayMaps.ts')

const ndaBytes = await readFile(path.join(process.cwd(), 'public', 'document-templates', 'nda.pdf'))

const out = await composeFilledPdf(
  [
    {
      template: NDA_TEMPLATE,
      templateBytes: ndaBytes,
      values: {
        prospect_full_legal_name: 'Michael R. Buyer',
        address: '1420 Market Street',
        city: 'Philadelphia',
        state: 'PA',
        zip: '19102',
        email: 'mbuyer@example.com',
        drivers_license_or_ein: 'DL-48291377',
        phone: '(215) 555-0142',
        cell: '(215) 555-0199',
        fax: '',
        _business_category: 'Home Health',
      },
    },
  ],
  { signerName: 'Michael R. Buyer', signedAt: '2026-08-28T12:00:00Z' },
)

writeFileSync('/tmp/sample-nda-real-filled.pdf', Buffer.from(out))
console.log('WROTE sample-nda-real-filled.pdf')

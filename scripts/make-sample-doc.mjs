// Generate a sample legal-pack document PDF for review.
import { writeFileSync } from 'fs'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { jsPDF } = require('jspdf')

const { PACK_TEMPLATES } = await import('../lib/legalPackTemplates.ts')

const tpl = PACK_TEMPLATES.find((t) => t.name === 'Exclusive Listing Agreement')
if (!tpl) throw new Error('template not found')

const filled = {
  title: 'EXCLUSIVE LISTING AGREEMENT',
  business_name: 'Harrisburg Family Restaurant',
  seller_name: 'John A. Seller',
  seller_entity_type: 'LLC',
  asking_price: '495,000',
  commission_rate: '10',
  minimum_commission: '15,000',
  term_months: '12',
  listing_date: 'August 28, 2026',
  tail_period: '6',
  non_compete_radius: '25',
  agency_name: 'EZ Business Advisors',
  broker_name: 'Rabin Timsina',
}

const body = tpl.body_template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) =>
  filled[k] != null ? String(filled[k]) : '[' + k + ']',
)
const lines = body.split('\n')

const doc = new jsPDF({ unit: 'pt', format: 'letter' })
const W = doc.internal.pageSize.getWidth()
const H = doc.internal.pageSize.getHeight()
const M = 56
const NAVY = [26, 26, 46]
const GOLD = [201, 168, 76]
const INK = [43, 43, 58]
const MUTED = [120, 120, 140]
let y = 0
const ensure = (n) => { if (y + n > H - 60) { doc.addPage(); y = 60 } }

// Letterhead
doc.setFillColor(...NAVY); doc.rect(0, 0, W, 64, 'F')
doc.setFillColor(...GOLD); doc.rect(0, 62, W, 3, 'F')
doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(15)
doc.text('EZ BUSINESS ADVISORS LLC', M, 30)
doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(210, 210, 220)
doc.text('Business Brokerage • M&A Advisory  |  Harrisburg, PA', M, 46)
doc.setTextColor(...NAVY); doc.setFont('times', 'bold'); doc.setFontSize(17)
doc.text('EXCLUSIVE LISTING AGREEMENT', M, 92)
doc.setDrawColor(...GOLD); doc.setLineWidth(1.5); doc.line(M, 100, W - M, 100)
y = 118

for (const line of lines) {
  if (!line.trim()) { y += 10; continue }
  const isHeader = /^[A-Z][A-Z .]{3,}$/.test(line.trim()) && line.trim().length < 70 && !line.trim().startsWith('{{') && !line.trim().includes('(')
  const isSig = /Signature:|Printed Name:|Title:|Date:|IN WITNESS|SELLER:|BROKER/.test(line)
  if (isHeader) {
    ensure(24)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(...GOLD)
    doc.text(line.trim().replace(/\.$/, '').toUpperCase(), M, y); y += 16
  } else if (isSig) {
    ensure(20)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); doc.setTextColor(...INK)
    doc.text(line, M, y); y += 18
  } else {
    ensure(16)
    doc.setFont('times', 'normal'); doc.setFontSize(11); doc.setTextColor(...INK)
    const words = line.split(' '); let out = ''
    for (const w of words) {
      const test = out ? out + ' ' + w : w
      if (doc.getTextWidth(test) > W - 2 * M && out) { doc.text(out, M, y); y += 14; out = w }
      else out = test
    }
    if (out) { doc.text(out, M, y); y += 14 }
  }
}

doc.setFontSize(7.5); doc.setTextColor(...MUTED)
doc.text('This is a general form document provided for convenience and does not constitute legal advice. All parties should review with an attorney licensed in the applicable jurisdiction.', M, H - 30)

const out = Buffer.from(doc.output('arraybuffer'))
writeFileSync('/tmp/sample-exclusive-listing-agreement.pdf', out)
console.log('WROTE', out.length, 'bytes')

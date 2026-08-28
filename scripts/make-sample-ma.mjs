import { writeFileSync } from 'fs'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { jsPDF } = require('jspdf')
const { PACK_TEMPLATES } = await import('../lib/legalPackTemplates.ts')

const tpl = PACK_TEMPLATES.find((t) => t.name === 'Marketing Agreement')
const filled = {
  title: 'MARKETING AGREEMENT',
  business_name: 'Derry Beverage', legal_entity: 'Brothers Beverages LLC',
  business_address: '1624 Continental Blvd', city: 'Washingtonville', state: 'PA', zip: '17884',
  owner_names: 'Rabin Timsina & Upendra Adhikari',
  asking_price: '220,000', annual_sales: '600,000', sde: '72,000', ebitda: 'Not Applicable',
  inventory_value: '25,000', ffe_value: '25,000', real_estate: 'Not Applicable',
  commission_rate: '10', minimum_commission: '10,000', term_months: '6', tail_period: '12',
  non_compete_radius: '30', training_weeks: '2', agreement_date: 'June 11, 2020',
  agency_name: 'EZ Business Advisors', broker_name: 'Rabin Timsina',
}
const body = tpl.body_template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => filled[k] != null ? String(filled[k]) : '[' + k + ']')

const doc = new jsPDF({ unit: 'pt', format: 'letter' })
const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 56
const NAVY=[26,26,46], GOLD=[201,168,76], INK=[43,43,58], MUTED=[120,120,140]
let y = 0
const ensure = (n) => { if (y + n > H - 60) { doc.addPage(); y = 60 } }

doc.setFillColor(...NAVY); doc.rect(0,0,W,64,'F'); doc.setFillColor(...GOLD); doc.rect(0,62,W,3,'F')
doc.setTextColor(255,255,255); doc.setFont('helvetica','bold'); doc.setFontSize(15)
doc.text('EZ BUSINESS ADVISORS LLC', M, 30)
doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(210,210,220)
doc.text('Business Brokerage • M&A Advisory  |  Harrisburg, PA', M, 46)
doc.setTextColor(...NAVY); doc.setFont('times','bold'); doc.setFontSize(17)
doc.text('MARKETING AGREEMENT', M, 92)
doc.setDrawColor(...GOLD); doc.setLineWidth(1.5); doc.line(M, 100, W-M, 100)
y = 118

for (const line of body.split("\n")) {
  if (!line.trim()) { y += 10; continue }
  const isHeader = /^[A-Z][A-Z .]{3,}$/.test(line.trim()) && line.trim().length < 70 && !line.trim().startsWith('{{')
  const isSig = /Signature:|Printed Name:|Title:|Date:|IN WITNESS|SELLER:|BROKER/.test(line)
  if (isHeader) { ensure(24); doc.setFont('helvetica','bold'); doc.setFontSize(10.5); doc.setTextColor(...GOLD); doc.text(line.trim().replace(/\.$/,'').toUpperCase(), M, y); y += 16 }
  else if (isSig) { ensure(20); doc.setFont('helvetica','normal'); doc.setFontSize(10.5); doc.setTextColor(...INK); doc.text(line, M, y); y += 18 }
  else {
    ensure(16); doc.setFont('times','normal'); doc.setFontSize(11); doc.setTextColor(...INK)
    const words = line.split(' '); let out = ''
    for (const w of words) { const t = out ? out+' '+w : w; if (doc.getTextWidth(t) > W-2*M && out) { doc.text(out, M, y); y += 14; out = w } else out = t }
    if (out) { doc.text(out, M, y); y += 14 }
  }
}
doc.setFontSize(7.5); doc.setTextColor(...MUTED)
doc.text('This is a general form document provided for convenience and does not constitute legal advice. All parties should review with an attorney licensed in the applicable jurisdiction.', M, H-30)
writeFileSync('/tmp/sample-marketing-agreement.pdf', Buffer.from(doc.output('arraybuffer')))
console.log('WROTE', '/tmp/sample-marketing-agreement.pdf')

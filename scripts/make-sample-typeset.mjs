// Sample B: properly TYPESET Exclusive Listing Agreement (Option 2 style).
// Real legal-document typography: logo letterhead, gold rules, field blanks,
// checkbox squares, two-column signature blocks, footer + page numbers.
import { writeFileSync, readFileSync } from 'fs'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { jsPDF } = require('jspdf')

const doc = new jsPDF({ unit: 'pt', format: 'letter' })
const W = doc.internal.pageSize.getWidth()
const H = doc.internal.pageSize.getHeight()
const M = 64
const CW = W - 2 * M
const NAVY = [23, 32, 56]
const GOLD = [176, 141, 62]
const INK = [36, 36, 44]
const MUTED = [118, 118, 130]
const LINE = [208, 202, 188]

// ── Letterhead ────────────────────────────────────────────────────────────────
try {
  const logo = readFileSync('public/brand/ez-business-advisors.jpg')
  const b64 = logo.toString('base64')
  const img = new Image()
  img.src = `data:image/jpeg;base64,${b64}`
  await new Promise((r) => { img.onload = r; img.onerror = r })
  const lw = 170
  const lh = (img.height / (img.width || 1)) * lw
  doc.addImage(img, 'JPEG', M, 40, lw, lh)
} catch { /* logo optional */ }

doc.setTextColor(...NAVY)
doc.setFont('times', 'bold')
doc.setFontSize(17)
doc.text('EZ BUSINESS ADVISORS LLC', M + 180, 62)
doc.setFont('helvetica', 'normal')
doc.setFontSize(8.5)
doc.setTextColor(...MUTED)
doc.text('Business Brokerage • M&A Advisory  |  119 Aster Dr. Ste 101, Harrisburg, PA 17112  |  (717) 706-7457', M + 180, 76)
doc.setTextColor(...GOLD)
doc.setFont('helvetica', 'bold')
doc.setFontSize(8)
doc.text('EXCLUSIVE MARKETING & LISTING AGREEMENT', M + 180, 90)
doc.setDrawColor(...GOLD)
doc.setLineWidth(2)
doc.line(M, 112, W - M, 112)
doc.setLineWidth(0.6)
doc.setDrawColor(...LINE)
doc.line(M, 116, W - M, 116)

// ── Title ─────────────────────────────────────────────────────────────────────
doc.setTextColor(...NAVY)
doc.setFont('times', 'bold')
doc.setFontSize(22)
doc.text('EXCLUSIVE LISTING AGREEMENT', M, 160)
doc.setDrawColor(...GOLD)
doc.setLineWidth(1)
doc.line(M, 168, M + 220, 168)

let y = 196
const ensure = (n) => { if (y + n > H - 90) { doc.addPage(); y = 80 } }
const section = (label) => {
  ensure(34)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...GOLD)
  doc.text(label.toUpperCase(), M, y)
  doc.setDrawColor(...GOLD)
  doc.setLineWidth(0.6)
  doc.line(M, y + 4, M + 160, y + 4)
  y += 16
}
const field = (label, value, col = 0, width = CW / 2 - 20) => {
  const x = M + col * (CW / 2 + 10)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...MUTED)
  doc.text(label.toUpperCase(), x, y)
  doc.setDrawColor(...LINE)
  doc.setLineWidth(0.8)
  doc.line(x, y + 4, x + width, y + 4)
  if (value) {
    doc.setFont('times', 'normal')
    doc.setFontSize(10.5)
    doc.setTextColor(...INK)
    doc.text(String(value), x, y + 16)
  }
  y += 26
}
const check = (label, checked) => {
  doc.setDrawColor(...LINE)
  doc.setLineWidth(0.8)
  doc.rect(M + 8, y - 6, 9, 9)
  if (checked) {
    doc.setTextColor(...NAVY)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.text('✓', M + 9.5, y + 1)
  }
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  doc.setTextColor(...INK)
  doc.text(label, M + 24, y)
  y += 16
}
const para = (text, indent = 0) => {
  doc.setFont('times', 'normal')
  doc.setFontSize(10.5)
  doc.setTextColor(...INK)
  const words = text.split(' ')
  let out = ''
  const x = M + indent
  const maxW = CW - indent
  for (const w of words) {
    const t = out ? out + ' ' + w : w
    if (doc.getTextWidth(t) > maxW && out) {
      ensure(14)
      doc.text(out, x, y)
      y += 14
      out = w
    } else out = t
  }
  if (out) { ensure(14); doc.text(out, x, y); y += 16 }
}

// ── Section 1: Business & Seller ──────────────────────────────────────────────
section('1. Business & Seller Information')
field('Business Name', 'Harrisburg Family Restaurant')
field('Seller Legal Name', 'John A. Seller', 1)
field('Seller Entity Type', 'LLC')
field('Business Address', '4500 Jonestown Rd, Harrisburg, PA', 1)
field('Principal Name', 'John A. Seller')
field('Contact Phone', '(717) 555-0192', 1)
field('Private Email', 'john@seller.com')
field('Listing Date', 'August 28, 2026', 1)

// ── Section 2: Transaction Terms ──────────────────────────────────────────────
section('2. Transaction Terms')
field('Asking Price ($)', '$495,000')
field('Annual Sales ($)', '$640,000', 1)
field('SDE ($)', '$118,000')
field('EBITDA ($)', '$74,000', 1)
field('Commission Rate (%)', '10%')
field('Minimum Commission ($)', '$15,000', 1)
field('Exclusive Listing Term (months)', '12 months')
field('Tail / Protection Period (months)', '6 months', 1)
field('Non-Compete Radius (miles)', '25')
field('Inventory Included ($)', '$28,000', 1)
field('Seller Financing Available?', '')
field('Training Period (weeks)', '4', 1)

// ── Section 3: Additional Provisions ──────────────────────────────────────────
section('3. Additional Provisions / Special Terms')
para('Seller agrees to provide three (3) years of financial statements and tax returns for buyer due diligence. Broker to coordinate all showings; Seller will make the business available for inspection with 24 hours notice.')

// ── Section 4: Key Terms (binders) ────────────────────────────────────────────
section('4. Key Terms of Engagement')
check('Exclusive right to market and sell', true)
check('Commission earned on any sale during term or tail period', true)
check('Non-circumvention — all inquiries routed through Broker', true)
check('Governing law: Commonwealth of Pennsylvania', true)

// ── Section 5: Representations ────────────────────────────────────────────────
section('5. Seller Representations')
para('Seller represents and warrants that Seller has full right, power, and authority to sell the Business; that all financial and operational information provided is true, accurate, and complete in all material respects; and that there are no undisclosed liabilities, judgments, or encumbrances that would materially impair the sale. Seller agrees to indemnify Broker against claims arising from Seller misrepresentations.')

// ── Signature blocks (two-column) ─────────────────────────────────────────────
ensure(190)
doc.setDrawColor(...GOLD)
doc.setLineWidth(1)
doc.line(M, y, W - M, y)
y += 22
section('Execution')

const sigBlock = (x, title) => {
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...NAVY)
  doc.text(title, x, y)
  y += 8
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(...MUTED)
  const rows = [
    ['Signature:', ''],
    ['Printed Name:', 'John A. Seller'],
    ['Title:', 'Managing Member'],
    ['Date:', ''],
  ]
  for (const [label, val] of rows) {
    y += 22
    doc.text(label, x, y)
    doc.setDrawColor(...LINE)
    doc.setLineWidth(0.8)
    doc.line(x + 90, y, x + 90 + 200, y)
    if (val) {
      doc.setFont('times', 'italic')
      doc.setFontSize(10)
      doc.setTextColor(...INK)
      doc.text(val, x + 94, y)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8.5)
      doc.setTextColor(...MUTED)
    }
  }
  y += 26
}

const yBefore = y
sigBlock(M, 'SELLER')
y = yBefore
sigBlock(M + CW / 2 + 10, 'BROKER — EZ BUSINESS ADVISORS LLC')

// ── Footer ────────────────────────────────────────────────────────────────────
const pageCount = doc.getNumberOfPages()
for (let i = 1; i <= pageCount; i++) {
  doc.setPage(i)
  doc.setDrawColor(...GOLD)
  doc.setLineWidth(1.2)
  doc.line(M, H - 48, W - M, H - 48)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(...MUTED)
  doc.text('This is a general form document provided for convenience and does not constitute legal advice. All parties should review with an attorney licensed in the applicable jurisdiction.', M, H - 34)
  doc.text(`Page ${i} of ${pageCount}`, W - M, H - 34, { align: 'right' })
  doc.text('EZ Business Advisors LLC — Business Brokerage & M&A Advisory', M, H - 22)
}

writeFileSync('/tmp/sample-listing-agreement-typeset.pdf', Buffer.from(doc.output('arraybuffer')))
console.log('WROTE sample-listing-agreement-typeset.pdf')

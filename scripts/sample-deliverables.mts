// Sample deliverable generator — CIM / BOV / Recast with the Phase quality
// bar (multi-year trend analysis, add-back justification, market comparables,
// sensitivity + pushback). Renders the Open Claw PDFs and writes pages to PNG
// so the actual document quality can be reviewed.
// Run: node --import ./scripts/paths-loader.mjs --experimental-strip-types scripts/sample-deliverables.mts
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

// Dummy env so supabase client imports don't blow up (pure generation only).
process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://example.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'dummy'
process.env.NEXT_PUBLIC_APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://ezbusinessadvisors.vercel.app'

const { generateCimContent } = await import('../lib/cim.ts')
const { generateBovContent } = await import('../lib/bov.ts')
const { recastFinancials, attachRecastAnalysis } = await import('../lib/recast.ts')
const { exportCimToPdf, exportBovToPdf, exportRecastToPdf } = await import('../lib/pdfExport.ts')
const { bandForIndustry } = await import('../lib/marketMultiplesCore.ts')

// ---------------------------------------------------------------------------
// Realistic test listing — BrightPath Home Care (matches the home-care band:
// 4-5x EBITDA / 2.5-3.5x SDE in marketMultiplesCore).
// ---------------------------------------------------------------------------
const listing: any = {
  id: 'sample-0000-0000-0000-000000000001',
  agency_id: '354facdb-cce2-4eb0-a160-8454854e731a',
  business_name: 'BrightPath Home Care Services',
  headline: 'Established Home Care Agency — 3-Year Growth, Recurring Clientele',
  industry: 'Home Care Agency',
  sub_industry: 'Home care',
  location_general: 'Charlotte, NC metro',
  description:
    'BrightPath Home Care Services is a licensed home care agency serving the greater Charlotte, NC metro with companion and personal care services. The agency operates a recurring-care model with a tenured caregiver team, an active client census of ~140, and a referral network anchored by discharge planners and senior-living communities. Growth has been driven by demographic tailwinds and expansion of the private-pay book.',
  asking_price: 1_150_000,
  annual_revenue: 1_412_000,
  sde: 318_000,
  ebitda: 246_000,
  inventory_value: 8_000,
  ffe_value: 64_000,
  real_estate_included: false,
  reason_for_sale: 'Owner is retiring after 14 years and wishes to transition the agency to a buyer who will continue serving the community and growing the private-pay book.',
  established_year: 2011,
  employees_full_time: 18,
  employees_part_time: 26,
  owner_hours_weekly: 45,
  growth_opportunities: 'Expand the private-pay book, add a second office in an adjacent county, introduce specialized dementia-care packages, and grow referrals through hospital and rehab partnerships.',
  competitive_advantages: 'Licensed with a strong local reputation, tenured caregivers, low client churn, and established relationships with discharge planners.',
  customer_concentration: 'Largest client is ~6% of revenue; top ten ~31%. No single-payer dependence.',
  facilities_summary: 'Leased 2,400 sq ft office in Charlotte; lease $4,100/mo through 2028 with renewal options.',
  lease_monthly: 4100,
  lease_expires_on: '2028-06-30',
  seller_financing_available: true,
  financing_notes: 'Seller financing available for a qualified buyer; SBA 7(a) suitable.',
  transition_support: 'Owner will provide 8 weeks of full-time transition plus up to 6 months of part-time consulting.',
  training_period_weeks: 8,
  confidentiality_level: 'confidential',
  image_urls: [],
  primary_image_url: null,
}

// ---------------------------------------------------------------------------
// 3-year financial history + add-backs
// ---------------------------------------------------------------------------
const baseYear = new Date().getFullYear()
const years = [
  {
    year: baseYear - 2, label: `FY${baseYear - 2}`,
    grossRevenue: 1_187_000, cogs: 0, operatingExpenses: 812_000,
    ownerComp: 132_000, depreciation: 19_000, interest: 12_000, otherExpenses: 0,
    netIncome: 212_000,
  },
  {
    year: baseYear - 1, label: `FY${baseYear - 1}`,
    grossRevenue: 1_296_000, cogs: 0, operatingExpenses: 878_000,
    ownerComp: 138_000, depreciation: 21_000, interest: 11_000, otherExpenses: 0,
    netIncome: 248_000,
  },
  {
    year: baseYear, label: `FY${baseYear}`,
    grossRevenue: 1_412_000, cogs: 0, operatingExpenses: 958_000,
    ownerComp: 142_000, depreciation: 24_000, interest: 10_000, otherExpenses: 0,
    netIncome: 278_000,
  },
]

const addBacks = [
  { id: 'ab1', category: 'owner_salary' as const, description: 'Owner salary above market replacement cost', amount: 42_000, recurring: true, year: baseYear - 2 },
  { id: 'ab2', category: 'owner_benefits' as const, description: 'Owner health, retirement, vehicle', amount: 19_500, recurring: true, year: baseYear - 2 },
  { id: 'ab3', category: 'depreciation' as const, description: 'Non-cash depreciation', amount: 19_000, recurring: true, year: baseYear - 2 },
  { id: 'ab4', category: 'discretionary' as const, description: 'Owner travel & entertainment', amount: 8_200, recurring: false, year: baseYear - 2 },
  { id: 'ab5', category: 'one_time' as const, description: 'State licensing re-application one-time', amount: 6_400, recurring: false, year: baseYear - 2 },

  { id: 'ab6', category: 'owner_salary' as const, description: 'Owner salary above market replacement cost', amount: 44_000, recurring: true, year: baseYear - 1 },
  { id: 'ab7', category: 'owner_benefits' as const, description: 'Owner health, retirement, vehicle', amount: 20_800, recurring: true, year: baseYear - 1 },
  { id: 'ab8', category: 'depreciation' as const, description: 'Non-cash depreciation', amount: 21_000, recurring: true, year: baseYear - 1 },
  { id: 'ab9', category: 'discretionary' as const, description: 'Owner travel & entertainment', amount: 8_900, recurring: false, year: baseYear - 1 },
  { id: 'ab10', category: 'one_time' as const, description: 'CRM migration consulting one-time', amount: 7_100, recurring: false, year: baseYear - 1 },
  { id: 'ab11', category: 'non_arm_length' as const, description: 'Family member payroll above market', amount: 14_000, recurring: true, year: baseYear - 1 },

  { id: 'ab12', category: 'owner_salary' as const, description: 'Owner salary above market replacement cost', amount: 46_000, recurring: true, year: baseYear },
  { id: 'ab13', category: 'owner_benefits' as const, description: 'Owner health, retirement, vehicle', amount: 22_400, recurring: true, year: baseYear },
  { id: 'ab14', category: 'depreciation' as const, description: 'Non-cash depreciation', amount: 24_000, recurring: true, year: baseYear },
  { id: 'ab15', category: 'discretionary' as const, description: 'Owner travel & entertainment', amount: 9_600, recurring: false, year: baseYear },
  { id: 'ab16', category: 'one_time' as const, description: 'One-time legal settlement', amount: 11_200, recurring: false, year: baseYear },
  { id: 'ab17', category: 'non_arm_length' as const, description: 'Family member payroll above market', amount: 15_000, recurring: true, year: baseYear },
]

// ---------------------------------------------------------------------------
// Generate
// ---------------------------------------------------------------------------
const recast = attachRecastAnalysis(recastFinancials({
  listingId: listing.id,
  businessName: listing.business_name,
  entityType: 'llc',
  currency: '$',
  years,
  addBacks,
}))

const marketBand = bandForIndustry(listing.industry, 'EBITDA')
const cim = generateCimContent(listing, { recast, marketBand })
const bov = generateBovContent(listing)

// ---------------------------------------------------------------------------
// Render PDFs
// ---------------------------------------------------------------------------
const outDir = '/root/.openclaw/workspace/sample-deliverables'
mkdirSync(outDir, { recursive: true })

const assets = (() => {
  try {
    const root = process.cwd()
    const b64 = (rel: string) => {
      const p = path.join(root, 'public', rel)
      return existsSync(p) ? Buffer.from(readFileSync(p)).toString('base64') : ''
    }
    return {
      fonts: {
        '/fonts/PlayfairDisplay_700Bold.ttf': b64('fonts/PlayfairDisplay_700Bold.ttf'),
        '/fonts/PlayfairDisplay_400Regular.ttf': b64('fonts/PlayfairDisplay_400Regular.ttf'),
        '/fonts/Inter_400Regular.ttf': b64('fonts/Inter_400Regular.ttf'),
        '/fonts/Inter_700Bold.ttf': b64('fonts/Inter_700Bold.ttf'),
      },
      images: {
        '/brand/claw-cover.jpg': b64('brand/claw-cover.jpg'),
        '/brand/claw-data.jpg': b64('brand/claw-data.jpg'),
      },
    }
  } catch { return undefined }
})()

const agency = { name: 'EZ Business Advisors', displayName: 'EZ Business Advisors' }

const files: Record<string, Uint8Array> = {}
const recastBytes = await exportRecastToPdf(recast, { returnBytes: true, agency, assets })
if (recastBytes) { files['recast'] = recastBytes; writeFileSync(path.join(outDir, 'recast.pdf'), Buffer.from(recastBytes)) }

const cimBytes = await exportCimToPdf(cim, { returnBytes: true, agency, assets })
if (cimBytes) { files['cim'] = cimBytes; writeFileSync(path.join(outDir, 'cim.pdf'), Buffer.from(cimBytes)) }

const bovBytes = await exportBovToPdf(bov, { returnBytes: true, agency, assets })
if (bovBytes) { files['bov'] = bovBytes; writeFileSync(path.join(outDir, 'bov.pdf'), Buffer.from(bovBytes)) }

// Page counts via pdftoppm render (also produces PNG previews)
for (const [key, bytes] of Object.entries(files)) {
  const pdfPath = path.join(outDir, `${key}.pdf`)
  try {
    const pages = execFileSync('pdfinfo', [pdfPath]).toString()
    const count = parseInt((pages.match(/Pages:\s+(\d+)/) || [])[1] || '0', 10)
    console.log(`${key}: ${count} pages`)
    // Render first 3 pages to PNG
    const pngPrefix = path.join(outDir, `${key}-page`)
    execFileSync('pdftoppm', ['-png', '-r', '70', '-f', '1', '-l', Math.min(3, count), pdfPath, pngPrefix])
    console.log(`${key}: rendered previews`)
  } catch (e: any) {
    console.log(`${key}: render note — ${e?.message?.split('\n')[0] || 'n/a'}`)
  }
}

// Print summary facts for the report
console.log('\n--- recast analysis ---')
console.log('CAGR revenue:', recast.analysis?.cagr.revenue?.toFixed(4))
console.log('CAGR SDE:', recast.analysis?.cagr.sde?.toFixed(4))
console.log('recurring add-back %:', recast.analysis?.addBackMix.recurringPct)
console.log('justifications:', recast.analysis?.justifications.length)
console.log('trendNote:', recast.analysis?.trendNote)
console.log('\n--- cim sections ---')
console.log('sections:', cim.sections.length)
console.log('titles:', cim.sections.map((s) => s.id).join(', '))
console.log('\n--- bov ---')
console.log('valuationRange:', bov.valuationRange)
console.log('conclusion:', bov.conclusion)
console.log('sections:', bov.sections.length)
console.log('\nOutput:', outDir)

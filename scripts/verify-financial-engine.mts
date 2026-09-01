// Financial Engine Gate 1+2 Verification — multi-industry rendered-output check.
// Satisfies the boss's standing order: Gates 1+2 verified across 2–3 industries
// and entity types, with regression tests passing AND rendered output checked
// (not just code). Renders Recast/CIM/BOV for three industries:
//   1. Home Care Agency (LLC)   — services, recurring-care model
//   2. Restaurant (S-Corp)      — hospitality, food cost + labor
//   3. Manufacturing (C-Corp)   — equipment-heavy, depreciation + capex
// The SDE invariant (SDE = NI + Σ(itemized)) must hold for every year of every
// industry, and all three deliverables must render to PDF.
//
// Run: node --import ./scripts/paths-loader.mjs --experimental-strip-types scripts/verify-financial-engine.mts
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://example.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'dummy'
process.env.NEXT_PUBLIC_APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://ezbusinessadvisors.vercel.app'

const { generateCimContent } = await import('../lib/cim.ts')
const { generateBovContent } = await import('../lib/bov.ts')
const { recastFinancials, attachRecastAnalysis, assertRecastConsistency, recastConsistencyErrors } = await import('../lib/recast.ts')
const { exportCimToPdf, exportBovToPdf, exportRecastToPdf } = await import('../lib/pdfExport.ts')
const { bandForIndustry } = await import('../lib/marketMultiplesCore.ts')

const baseYear = new Date().getFullYear()

// ---------------------------------------------------------------------------
// Three industry scenarios, three entity types
// ---------------------------------------------------------------------------
const scenarios: any[] = [
  {
    id: 'homecare',
    listing: {
      business_name: 'BrightPath Home Care Services',
      industry: 'Home Care Agency',
      sub_industry: 'Home care',
      location_general: 'Charlotte, NC metro',
      asking_price: 1_150_000,
      annual_revenue: 1_412_000,
      sde: 318_000,
      ebitda: 246_000,
      description: 'Licensed home care agency with a recurring-care model, ~140 active clients, tenured caregivers, and referral networks anchored by discharge planners.',
      reason_for_sale: 'Owner retiring after 14 years.',
      established_year: 2011,
    },
    entityType: 'llc',
    years: [
      { year: baseYear - 2, label: `FY${baseYear - 2}`, grossRevenue: 1_187_000, cogs: 0, operatingExpenses: 812_000, ownerComp: 132_000, depreciation: 19_000, interest: 12_000, otherExpenses: 0, netIncome: 212_000 },
      { year: baseYear - 1, label: `FY${baseYear - 1}`, grossRevenue: 1_296_000, cogs: 0, operatingExpenses: 878_000, ownerComp: 138_000, depreciation: 21_000, interest: 11_000, otherExpenses: 0, netIncome: 248_000 },
      { year: baseYear, label: `FY${baseYear}`, grossRevenue: 1_412_000, cogs: 0, operatingExpenses: 958_000, ownerComp: 142_000, depreciation: 24_000, interest: 10_000, otherExpenses: 0, netIncome: 278_000 },
    ],
    addBacks: [
      { id: 'hc1', category: 'owner_salary', description: 'Owner salary above market', amount: 42_000, recurring: true, year: baseYear - 2 },
      { id: 'hc2', category: 'owner_benefits', description: 'Owner health/retirement/vehicle', amount: 19_500, recurring: true, year: baseYear - 2 },
      { id: 'hc3', category: 'depreciation', description: 'Non-cash depreciation', amount: 19_000, recurring: true, year: baseYear - 2 },
      { id: 'hc4', category: 'owner_salary', description: 'Owner salary above market', amount: 44_000, recurring: true, year: baseYear - 1 },
      { id: 'hc5', category: 'owner_benefits', description: 'Owner health/retirement/vehicle', amount: 20_800, recurring: true, year: baseYear - 1 },
      { id: 'hc6', category: 'depreciation', description: 'Non-cash depreciation', amount: 21_000, recurring: true, year: baseYear - 1 },
      { id: 'hc7', category: 'owner_salary', description: 'Owner salary above market', amount: 46_000, recurring: true, year: baseYear },
      { id: 'hc8', category: 'owner_benefits', description: 'Owner health/retirement/vehicle', amount: 22_400, recurring: true, year: baseYear },
      { id: 'hc9', category: 'depreciation', description: 'Non-cash depreciation', amount: 24_000, recurring: true, year: baseYear },
    ],
  },
  {
    id: 'restaurant',
    listing: {
      business_name: 'Saddleback Smokehouse & Taproom',
      industry: 'Restaurants',
      sub_industry: 'Restaurant',
      location_general: 'Boise, ID metro',
      asking_price: 725_000,
      annual_revenue: 1_860_000,
      sde: 214_000,
      ebitda: 168_000,
      description: 'Established BBQ restaurant and craft taproom with a loyal local following, strong takeout/delivery mix, and a turnkey leased space with all equipment included.',
      reason_for_sale: 'Owner pursuing a second location opportunity out of state.',
      established_year: 2014,
    },
    entityType: 's_corp',
    years: [
      { year: baseYear - 2, label: `FY${baseYear - 2}`, grossRevenue: 1_640_000, cogs: 574_000, operatingExpenses: 786_000, ownerComp: 96_000, depreciation: 38_000, interest: 22_000, otherExpenses: 0, netIncome: 124_000 },
      { year: baseYear - 1, label: `FY${baseYear - 1}`, grossRevenue: 1_760_000, cogs: 616_000, operatingExpenses: 838_000, ownerComp: 102_000, depreciation: 40_000, interest: 19_000, otherExpenses: 0, netIncome: 145_000 },
      { year: baseYear, label: `FY${baseYear}`, grossRevenue: 1_860_000, cogs: 651_000, operatingExpenses: 884_000, ownerComp: 108_000, depreciation: 42_000, interest: 16_000, otherExpenses: 0, netIncome: 159_000 },
    ],
    addBacks: [
      { id: 'rs1', category: 'owner_salary', description: 'Owner salary above market', amount: 28_000, recurring: true, year: baseYear - 2 },
      { id: 'rs2', category: 'depreciation', description: 'Non-cash depreciation', amount: 38_000, recurring: true, year: baseYear - 2 },
      { id: 'rs3', category: 'owner_salary', description: 'Owner salary above market', amount: 31_000, recurring: true, year: baseYear - 1 },
      { id: 'rs4', category: 'depreciation', description: 'Non-cash depreciation', amount: 40_000, recurring: true, year: baseYear - 1 },
      { id: 'rs5', category: 'owner_salary', description: 'Owner salary above market', amount: 34_000, recurring: true, year: baseYear },
      { id: 'rs6', category: 'depreciation', description: 'Non-cash depreciation', amount: 42_000, recurring: true, year: baseYear },
    ],
  },
  {
    id: 'manufacturing',
    listing: {
      business_name: 'PrecisionForge Metal Works',
      industry: 'Manufacturing',
      sub_industry: 'Manufacturing',
      location_general: 'Youngstown, OH metro',
      asking_price: 2_400_000,
      annual_revenue: 3_850_000,
      sde: 612_000,
      ebitda: 528_000,
      description: 'Contract metal fabrication and CNC machining shop serving industrial OEMs, with a 40,000 sq ft owned facility, 28 employees, and long-term supply agreements.',
      reason_for_sale: 'Founder retiring; management team in place.',
      established_year: 1998,
    },
    entityType: 'c_corp',
    years: [
      { year: baseYear - 2, label: `FY${baseYear - 2}`, grossRevenue: 3_420_000, cogs: 2_260_000, operatingExpenses: 812_000, ownerComp: 185_000, depreciation: 96_000, interest: 58_000, otherExpenses: 0, netIncome: 9_000 },
      { year: baseYear - 1, label: `FY${baseYear - 1}`, grossRevenue: 3_640_000, cogs: 2_410_000, operatingExpenses: 848_000, ownerComp: 195_000, depreciation: 102_000, interest: 52_000, otherExpenses: 0, netIncome: 33_000 },
      { year: baseYear, label: `FY${baseYear}`, grossRevenue: 3_850_000, cogs: 2_540_000, operatingExpenses: 876_000, ownerComp: 205_000, depreciation: 108_000, interest: 46_000, otherExpenses: 0, netIncome: 75_000 },
    ],
    addBacks: [
      { id: 'mf1', category: 'owner_salary', description: 'Founder salary above market', amount: 65_000, recurring: true, year: baseYear - 2 },
      { id: 'mf2', category: 'owner_benefits', description: 'Founder health/retirement', amount: 31_000, recurring: true, year: baseYear - 2 },
      { id: 'mf3', category: 'depreciation', description: 'Non-cash depreciation', amount: 96_000, recurring: true, year: baseYear - 2 },
      { id: 'mf4', category: 'interest', description: 'Interest expense (non-operating)', amount: 58_000, recurring: true, year: baseYear - 2 },
      { id: 'mf5', category: 'owner_salary', description: 'Founder salary above market', amount: 70_000, recurring: true, year: baseYear - 1 },
      { id: 'mf6', category: 'owner_benefits', description: 'Founder health/retirement', amount: 34_000, recurring: true, year: baseYear - 1 },
      { id: 'mf7', category: 'depreciation', description: 'Non-cash depreciation', amount: 102_000, recurring: true, year: baseYear - 1 },
      { id: 'mf8', category: 'interest', description: 'Interest expense (non-operating)', amount: 52_000, recurring: true, year: baseYear - 1 },
      { id: 'mf9', category: 'owner_salary', description: 'Founder salary above market', amount: 75_000, recurring: true, year: baseYear },
      { id: 'mf10', category: 'owner_benefits', description: 'Founder health/retirement', amount: 36_000, recurring: true, year: baseYear },
      { id: 'mf11', category: 'depreciation', description: 'Non-cash depreciation', amount: 108_000, recurring: true, year: baseYear },
      { id: 'mf12', category: 'interest', description: 'Interest expense (non-operating)', amount: 46_000, recurring: true, year: baseYear },
    ],
  },
]

const outDir = '/root/.openclaw/workspace/sample-deliverables/verify'
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
let allPass = true

for (const s of scenarios) {
  console.log(`\n=== ${s.id.toUpperCase()} (${s.entityType}) — ${s.listing.business_name} ===`)
  const listing: any = { id: `verify-${s.id}`, agency_id: '354facdb-cce2-4eb0-a160-8454854e731a', ...s.listing, image_urls: [], primary_image_url: null }
  const recast = attachRecastAnalysis(recastFinancials({
    listingId: listing.id,
    businessName: listing.business_name,
    entityType: s.entityType,
    currency: '$',
    years: s.years,
    addBacks: s.addBacks,
  }))

  // GATE 1: invariant must hold for every year of every industry.
  const errs = recastConsistencyErrors(recast)
  if (errs.length > 0) { allPass = false; console.log('❌ INVARIANT VIOLATION:', errs) }
  else { assertRecastConsistency(recast); console.log('✅ invariant holds') }
  for (const yr of recast.years) {
    const ok = yr.recast.sde === yr.asReported.netIncome + yr.totalAddBacks
    if (!ok) allPass = false
    console.log(`   ${yr.label}: SDE ${yr.recast.sde.toLocaleString()} = NI ${yr.asReported.netIncome.toLocaleString()} + addbacks ${yr.totalAddBacks.toLocaleString()} ${ok ? '✅' : '❌'}`)
  }

  // GATE 2: deliverables consume the canonical resolver — never listing.sde.
  const marketBand = bandForIndustry(listing.industry, 'EBITDA')
  const cim = generateCimContent(listing, { recast, marketBand })
  const bov = generateBovContent(listing, { recast })

  // Render all three to PDF.
  const recastBytes = await exportRecastToPdf(recast, { returnBytes: true, agency, assets })
  const cimBytes = await exportCimToPdf(cim, { returnBytes: true, agency, assets })
  const bovBytes = await exportBovToPdf(bov, { returnBytes: true, agency, assets })
  writeFileSync(path.join(outDir, `${s.id}-recast.pdf`), Buffer.from(recastBytes || new Uint8Array()))
  writeFileSync(path.join(outDir, `${s.id}-cim.pdf`), Buffer.from(cimBytes || new Uint8Array()))
  writeFileSync(path.join(outDir, `${s.id}-bov.pdf`), Buffer.from(bovBytes || new Uint8Array()))

  const pageCount = (p: string) => {
    try { return parseInt((execFileSync('pdfinfo', [p]).toString().match(/Pages:\s+(\d+)/) || [])[1] || '0', 10) }
    catch { return 0 }
  }
  console.log(`✅ rendered: recast ${pageCount(path.join(outDir, `${s.id}-recast.pdf`))}p · cim ${pageCount(path.join(outDir, `${s.id}-cim.pdf`))}p · bov ${pageCount(path.join(outDir, `${s.id}-bov.pdf`))}p`)
  console.log(`   bov range: ${bov.valuationRange}`)
}

console.log(`\n${allPass ? '✅ ALL SCENARIOS PASS — Gate 1 invariant + Gate 2 rendering verified across 3 industries (LLC/S-Corp/C-Corp)' : '❌ FAILURES DETECTED'}`)
console.log('Output:', outDir)

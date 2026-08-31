import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

// =============================================================================
// AGENCY BRANDING — licensing regression guard (Phase 0).
// The core promise: a licensed broker's client documents (CIM, LOI, PA, closing
// packet, emails, PDF footer) carry the AGENCY's own legal name — and NEVER a
// hardcoded "EZ Business Advisors" brand. This test asserts both directions:
//   1. the resolver + injection points exist and are wired
//   2. the doc/email generators no longer bake in the EZ brand
// =============================================================================

const branding = readFileSync('lib/agencyBranding.ts', 'utf8')
const clawFooter = readFileSync('lib/pdfOpenClaw.ts', 'utf8')
const autoGen = readFileSync('lib/autoGenerate.ts', 'utf8')
const emailShell = readFileSync('lib/email.ts', 'utf8')
const loiRender = readFileSync('lib/loiRender.ts', 'utf8')
const bundle = readFileSync('app/api/documents/bundle/route.ts', 'utf8')
const pitchPdf = readFileSync('lib/advertiserPitchPdf.ts', 'utf8')
const followups = readFileSync('lib/followups.ts', 'utf8')
const voiceAgent = readFileSync('lib/voiceAgent.ts', 'utf8')

test('branding: resolver exposes the full agency identity block', () => {
  assert.match(branding, /export interface AgencyBrand/)
  assert.match(branding, /legalName: string/)
  assert.match(branding, /displayName: string/)
  assert.match(branding, /logoUrl: string \| null/)
  assert.match(branding, /signingName: string \| null/)
  assert.match(branding, /signingTitle: string \| null/)
  assert.match(branding, /signingSignature: string \| null/)
  assert.match(branding, /export function brandFromRow/)
  assert.match(branding, /export async function resolveAgencyBranding/)
  assert.match(branding, /export function platformBrand\(\)/)
  // Resolver reads the agency's OWN identity fields.
  assert.match(branding, /\.select\('/)
  assert.match(branding, /name, brand_color, accent_color, logo_url, copyright_name, phone, email, signing_name, signing_title, signing_signature/)
  assert.match(branding, /\.maybeSingle\(\)/)
  assert.match(branding, /signing_name/)
  assert.match(branding, /logo_url/)
  assert.match(branding, /copyright_name/)
  assert.match(branding, /brand_color/)
  // brandFromRow tolerates legal_name for forward-compat but doesn't require it.
  assert.match(branding, /legal_name \|\| name/)
})

test('branding: PDF footer uses the agency display name — no EZ append', () => {
  // LICENSING FIX: the footer used to hardcode ['Business Advisors'] after the
  // agency name ("Harbor Acquisitions | Business Advisors"). That is gone.
  assert.doesNotMatch(clawFooter, /parts = \[name, 'Business Advisors'\]/)
  assert.match(clawFooter, /agency\?\.displayName\?\.trim\(\) \|\| agency\?\.name/)
  // DocAgency carries the broker's own display name.
  assert.match(clawFooter, /displayName\?: string \| null/)
})

test('branding: auto-generate resolves the agency brand for CIM/BLI/BOV PDFs', () => {
  assert.match(autoGen, /resolveAgencyBranding/)
  assert.match(autoGen, /brand\.displayName/)
  assert.match(autoGen, /agency = \{ name: brand\.displayName/)
})

test('branding: email shell is brand-aware (logo + name + copyright overridable)', () => {
  assert.match(emailShell, /function shell\(title: string, body: string, cta\?:.*brand\?: \{/)
  assert.match(emailShell, /brand\?\.name\?\.trim\(\) \|\| 'EZ Business Advisors'/)
  assert.match(emailShell, /brand\?\.logoUrl\?\.trim\(\)/)
  assert.match(emailShell, /brand\?\.copyrightName\?\.trim\(\) \|\| bName/)
})

test('branding: LOI letterhead accepts the agency brand', () => {
  assert.match(loiRender, /renderLoiHtml\(content: LoiContent, brand\?:/)
  assert.match(loiRender, /brand\?\.displayName \|\| brand\?\.legalName/)
  assert.match(loiRender, /letterhead/)
})

test('branding: signed-pack bundle injects agency_name/broker_name from resolver', () => {
  assert.match(bundle, /resolveAgencyBranding/)
  assert.match(bundle, /if \(!filled\.agency_name\) filled\.agency_name = brand\.displayName/)
  assert.match(bundle, /if \(!filled\.broker_name\) filled\.broker_name = brand\.displayName/)
})

test('branding: advertiser pitch + SMS + voice agent no longer hardcode EZ', () => {
  // Strip copyright headers (legal notices — always keep) before checking
  // user-facing text.
  const pitchBody = pitchPdf.split('\n').filter((l) => !l.includes('Copyright (c)')).join('\n')
  const followBody = followups.split('\n').filter((l) => !l.includes('Copyright (c)')).join('\n')
  const voiceBody = voiceAgent.split('\n').filter((l) => !l.includes('Copyright (c)')).join('\n')
  // Advertiser pitch PDF footer.
  assert.match(pitchPdf, /agencyName\?: string/)
  assert.match(pitchPdf, /input\?\.agencyName\?\.trim\(\) \|\| 'Concord Deal Platform'/)
  assert.doesNotMatch(pitchBody, /EZ Business Advisors LLC/, 'pitch PDF must not hardcode EZ')
  // SMS follow-up.
  assert.match(followups, /NEXT_PUBLIC_AGENCY_NAME/)
  assert.match(followups, /from \$\{outreachAgency\}/)
  assert.doesNotMatch(followBody, /from EZ Business Advisors/, 'SMS must not hardcode EZ')
  // Voice agent receptionist.
  assert.match(voiceAgent, /NEXT_PUBLIC_AGENCY_NAME/)
  assert.match(voiceAgent, /receptionist at \$\{AGENCY_NAME\}/)
  assert.doesNotMatch(voiceBody, /receptionist at EZ Business Advisors/, 'voice agent must not hardcode EZ')
})

test('branding: doc generators carry NO user-facing EZ string', () => {
  // The four doc generators the boss called out — CIM, LOI, PA (legal pack),
  // closing packet — plus PDF overlay, and the buyer/seller FORM SCHEMAS
  // (NDA guide text, listing-agreement intro) that render on client-facing
  // surfaces. Copyright headers and code comments are not user-facing and are
  // excluded; USER-FACING text must never say "EZ Business Advisors".
  const stripNonUserFacing = (src: string) =>
    src
      .split('\n')
      .filter((l) => {
        const t = l.trim()
        if (!t) return false
        if (l.includes('Copyright (c)')) return false
        if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return false
        return true
      })
      .join('\n')
  for (const [name, src] of [
    ['CIM', readFileSync('lib/cim.ts', 'utf8')],
    ['BLI', readFileSync('lib/bli.ts', 'utf8')],
    ['LOI render', readFileSync('lib/loiRender.ts', 'utf8')],
    ['legal pack templates', readFileSync('lib/legalPackTemplates.ts', 'utf8')],
    ['document builder', readFileSync('lib/documentBuilder.ts', 'utf8')],
    ['PDF export', readFileSync('lib/pdfExport.ts', 'utf8')],
    ['buyer form schemas', readFileSync('lib/buyerFormSchemas.ts', 'utf8')],
    ['seller form schemas', readFileSync('lib/sellerFormSchemas.ts', 'utf8')],
  ] as const) {
    const userFacing = stripNonUserFacing(src)
    assert.doesNotMatch(userFacing, /EZ Business Advisors/, `${name} must not hardcode EZ branding`)
  }
})

/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Seed the EZ Business Advisors legal pack into document_templates
// Usage: node scripts/seed-legal-docs.mjs
// Rebuilt from Boss's actual forms (2026-08-24 uploads):
//   • 5_Documentation_Checklist.pdf
//   • 6_Buyer_Forms_Overview_and_Guide.pdf
// PA law (Commonwealth of Pennsylvania, Dauphin County). Multiple-owner
// signature slots. Idempotent (fixed UUIDs + upsert).
// =============================================================================
import { readFile } from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'

function parseEnv(source) {
  return Object.fromEntries(source
    .split(/\r?\n/)
    .filter((line) => line && !line.trimStart().startsWith('#') && line.includes('='))
    .map((line) => {
      const index = line.indexOf('=')
      const key = line.slice(0, index).trim()
      let value = line.slice(index + 1).trim()
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
      return [key, value]
    }))
}

const env = parseEnv(await readFile('.env.local', 'utf8'))
const url = env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) throw new Error('Supabase URL and service-role key are required')

const db = createClient(url, serviceKey, { auth: { persistSession: false } })

// --- Shared PA-law preamble helpers ------------------------------------------
const PA_DISCLOSURE = 'EZ Business Advisors LLC acts as a business broker and transaction intermediary only. Broker is NOT a real estate broker or real estate agent, attorney, accountant, or tax advisor. All parties are strongly encouraged to consult qualified legal, financial, and tax professionals. This Agreement is governed by the laws of the Commonwealth of Pennsylvania; venue shall lie exclusively in Dauphin County, Pennsylvania.'

const TEMPLATES = [
  // -------------------------------------------------------------------------
  // SELLER PACK
  // -------------------------------------------------------------------------
  {
    id: 'd0c00000-0001-4000-8000-000000000001',
    name: 'Marketing Agreement',
    description: 'Exclusive engagement authorizing the broker to market and sell the business. Broker + every owner signs (multi-owner support).',
    category: 'Marketing Agreement',
    fields: [
      { key: 'business_name', label: 'Business Name', type: 'text', required: true, placeholder: 'e.g. ABC Manufacturing LLC' },
      { key: 'seller_entity', label: 'Seller Entity / Owner(s)', type: 'text', required: true, placeholder: 'e.g. John Smith & Jane Smith' },
      { key: 'entity_type', label: 'Entity Type', type: 'select', required: true, options: ['LLC', 'Corporation', 'Sole Proprietorship', 'Partnership'], placeholder: '' },
      { key: 'asking_price', label: 'Total Sales Price', type: 'number', required: true, placeholder: '500000' },
      { key: 'commission_type', label: 'Commission Structure', type: 'select', required: true, options: ['Percentage of Total Sales Price', 'Flat Fee', 'Percentage with Minimum', 'Percentage or Minimum, Whichever is Greater'], placeholder: '' },
      { key: 'commission_rate', label: 'Commission Rate %', type: 'number', required: false, placeholder: '10' },
      { key: 'commission_flat', label: 'Flat Fee ($)', type: 'number', required: false, placeholder: '50000' },
      { key: 'commission_min', label: 'Minimum Commission ($)', type: 'number', required: false, placeholder: '15000' },
      { key: 'term_months', label: 'Term (months)', type: 'number', required: true, placeholder: '12' },
      { key: 'protection_months', label: 'Protection Period (months after term)', type: 'number', required: false, placeholder: '24' },
      { key: 'exclusive', label: 'Exclusive', type: 'select', required: true, options: ['Yes', 'No'], placeholder: '' },
      { key: 'effective_date', label: 'Effective Date', type: 'date', required: true, placeholder: '' },
      { key: 'listing_date', label: 'Listing Date (for expiry tracking)', type: 'date', required: true, placeholder: '' },
      { key: 'agreement_year', label: 'Year (2025 / 2026 / 2027)', type: 'select', required: true, options: ['2025', '2026', '2027', '2028'], placeholder: '' },
      { key: 'agency_name', label: 'Agency Name', type: 'text', required: false, placeholder: 'Your brokerage' },
      { key: 'property_included', label: 'Real Property Included?', type: 'select', required: true, options: ['No', 'Yes — see Property Addendum'], placeholder: '' },
      { key: 'non_compete_miles', label: 'Non-Compete (miles)', type: 'number', required: false, placeholder: '25' },
      { key: 'non_compete_years', label: 'Non-Compete (years)', type: 'number', required: false, placeholder: '2' },
      { key: 'training_weeks', label: 'Seller Training (weeks at no cost)', type: 'number', required: false, placeholder: '4' },
      { key: 'inventory_included', label: 'Inventory Included ($)', type: 'number', required: false, placeholder: '0' },
      { key: 'annual_sales', label: 'Annual Sales ($)', type: 'number', required: false, placeholder: '0' },
      { key: 'sde', label: "Seller's Discretionary Earnings ($)", type: 'number', required: false, placeholder: '0' },
      { key: 'down_payment', label: 'Down Payment ($)', type: 'number', required: false, placeholder: '0' },
      { key: 'seller_note', label: 'Seller Note ($)', type: 'number', required: false, placeholder: '0' },
      { key: 'note_interest', label: 'Note Interest (%)', type: 'number', required: false, placeholder: '6' },
    ],
    parties: [
      { key: 'agent', label: 'Broker / Agency', role: 'agent' },
      { key: 'seller1', label: 'Owner 1', role: 'seller' },
      { key: 'seller2', label: 'Owner 2 (if any)', role: 'seller' },
      { key: 'seller3', label: 'Owner 3 (if any)', role: 'seller' },
      { key: 'seller4', label: 'Owner 4 (if any)', role: 'seller' },
    ],
        body_template: `MARKETING AGREEMENT

Effective Date: {{effective_date}} · Listing Date: {{listing_date}}

THIS MARKETING AGREEMENT ("Agreement") is made and entered into as of the Effective Date set forth above, by and between {{agency_name}} ("Broker") and {{seller_entity}} ("Seller"), for the {{exclusive}} right to market and sell the Business described below. In consideration of the services of Broker, Seller hereby gives Broker the full and {{exclusive}} right to sell the Business, which includes all or any portion of its assets, rights, liabilities or property, at the Total Sales Price and terms set forth below, or for any other price and terms acceptable to Seller. A sale is not guaranteed.

====================================================
DEAL SUMMARY
====================================================
Business Name: {{business_name}}
Seller: {{seller_entity}} · Entity Type: {{entity_type}}
Total Sales Price: \${{asking_price}}
COMMISSION: {{commission_clause}}
Term: {{term_months}} months (the "Term") · Protection Period: {{protection_months}} months after expiration
Exclusive: {{exclusive}} · Real Property: {{property_included}}
Non-Compete: {{non_compete_miles}} miles for {{non_compete_years}} years · Seller Training: {{training_weeks}} weeks at no cost
Inventory Included: \${{inventory_included}} · Annual Sales: \${{annual_sales}} · Seller's Discretionary Earnings: \${{sde}}
Down Payment: \${{down_payment}} · Seller Note: \${{seller_note}} at {{note_interest}}% interest
====================================================

1. ENGAGEMENT. Seller engages Broker as Seller's broker and advisor, on an {{exclusive}} basis, to market, advertise, and solicit buyers for the sale of {{business_name}} (the "Business"), a {{entity_type}}. The parties agree as follows:

2. ASKING PRICE. The initial asking price for the Business shall be \${{asking_price}} (the "Asking Price"). Broker shall not advertise a price other than the Asking Price without Seller's prior written consent.

3. COMMISSION AND COMPENSATION. Seller shall pay to Broker, as compensation or liquidated damages, {{commission_clause}}, if any of the following occur:
  a. Seller and Buyer consummate the sale of the Business; or
  b. Broker procures a Prospect ready, willing and able to purchase the Business at the terms set forth above, or as amended; or
  c. Seller sells, leases, trades or otherwise disposes of all or any part of the Business other than in the normal course of business; or
  d. Seller withdraws the Business for sale, seeks to terminate, or terminates this Agreement prior to the end of the Term; or
  e. Seller, through no fault of Prospect, fails or refuses to complete a sale after entering into a written agreement to do so; or
  f. Seller sells or transfers any or all shares of stock or interest in the Business; such sale or transfer is considered a sale of the Business assets at the Total Sales Price.

4. TOTAL SALES PRICE DEFINED. "Total Sales Price" is the amount paid for the Business by the person or entity purchasing the Business ("Buyer"), including inventory and any liabilities, contingent liabilities, other obligations assumed by Buyer, consulting or management agreements, and any compensation paid.

5. WHEN COMMISSION IS DUE. Broker's compensation will be due and payable upon the occurrence of any item listed in Section 3, or at the Closing, whichever is first. Broker is authorized to instruct the Closing agent to pay any and all compensation due to Broker under this Agreement at the Closing.

6. PROTECTION PERIOD. Broker shall use its best efforts to procure a ready, willing and able Prospect. Seller will show the Business upon reasonable notification. If Seller, within {{protection_months}} months after the end of the Term, with any party disclosed during the Term, (1) enters into a contract, accepts a deposit, offers a purchase option, or does any act equivalent to a sale; (2) has an employment, independent contractor or consulting relationship; or (3) leases, trades or options any Business asset, then the full compensation based on the Total Sales Price shall be immediately due and payable.

7. SELLER'S REPRESENTATIONS AND WARRANTIES. Seller represents and warrants that: (a) Seller and the Business's operation are in full compliance with all applicable laws, rules and regulations regarding the Business, and to the best of Seller's knowledge and belief there are no matters which would adversely affect the sale; (b) all facts, figures and additional documents about the Business have been provided to Broker by Seller; and (c) Seller is not under obligation to another party (whether included in a business brokerage agreement or otherwise) which would prevent Seller from freely entering into this exclusive relationship.

8. SELLER'S COOPERATION. Seller agrees to fully cooperate with Broker, including referring immediately to Broker all inquiries regarding the sale of the Business. Seller will deliver to Broker copies of any agreement between Seller and any Prospect or potential buyer immediately, and permit Broker to be present at the Closing.

9. ADVERTISING AND CO-BROKING. Seller understands and acknowledges that information provided by Seller may be disclosed to Prospects, Buyer and other brokers. Broker may choose to co-broke this listing and advertise at its discretion.

10. INFORMATION AND INDEMNIFICATION. Seller acknowledges and agrees that all information supplied to Broker pertaining to the Business will be used for promoting the Business to Prospects and that such information will be relied upon by Broker, Prospects and Buyer. Seller further acknowledges and agrees that Broker has not made, and will not make, any independent investigation of the accuracy of any information provided by Seller. Seller agrees to indemnify and hold Broker harmless against any and all claims, demands, causes of action, losses, damages, costs and expenses, including attorneys' fees and expenses incurred by Broker, regardless of whether a suit is filed, in the event that Seller breaches any warranty, representation or obligation set forth herein. Any information attached hereto and/or acknowledged by the parties shall be part of this Agreement. The Business Listing Information (BLI), Seller Interview, Resolution to Sell, Asset Analysis and Owners Benefits Worksheet shall be deemed to be a part of this Agreement.

11. BUYER VERIFICATION. Seller agrees to independently verify the qualifications of all Prospects, and understands that Broker will not warrant Buyer's health, financial status, experience, competency, or residency.

12. GOVERNING LAW; VENUE; JURY WAIVER. This Agreement shall be governed by the laws of the State of Pennsylvania. The prevailing party in any litigation arising under this Agreement shall be entitled to recover, in addition to any other relief awarded, all of its attorneys' fees, costs, and expenses incurred at both trial and appellate levels. Each party agrees that any disputes under this Agreement shall be resolved exclusively in the state courts located in Harrisburg, Dauphin County, Pennsylvania, or the federal courts located in the Harrisburg District of Pennsylvania; and consents to and waives any objection to personal jurisdiction and venue therein. Each party waives any right to have a jury participate in the resolution of any dispute.

13. ENTIRE AGREEMENT. This Agreement constitutes the entire agreement between the parties and supersedes all negotiations, preliminary agreements, and all prior discussions and understandings, and shall not be modified except in writing executed by the parties. Seller acknowledges that it has read, understood and received a copy of this Agreement.

14. PRINCIPAL GUARANTY. Seller's principal guarantees Seller's performance under the terms of this Agreement and agrees to be jointly and severally liable to pay Broker its compensation if Seller breaches the terms of this Agreement.

15. ELECTRONIC EXECUTION. Documents may be sent electronically, and such electronic copies, as well as electronic signatures, shall be treated for all purposes as (a) properly authorized and/or endorsed by the sending party; (b) "in writing" and signed; and (c) as an original document.

16. INDEPENDENT CONTRACTOR; NO AGENCY. Broker is an independent contractor and not an employee, joint venturer, partner, or agent of Seller, except as expressly set forth in this Agreement. Broker is not authorized to bind Seller to any contract, agreement, or obligation without Seller's prior written consent. Nothing in this Agreement creates a partnership, joint venture, or fiduciary relationship between the parties beyond the brokerage duties expressly stated herein.

17. CONFIDENTIALITY. Both parties shall keep the terms of this Agreement, and all non-public information concerning the other party and the Business, confidential, except as required to market and sell the Business or as required by law.

IN WITNESS WHEREOF, the parties have executed this Agreement as of the Effective Date in the year {{agreement_year}}.

BROKER: {{agency_name}}
By: ____________________________  Date: ____________

SELLER:
Each Owner executing below confirms their authority to bind the Seller and agrees to the terms of this Agreement. If more than four owners exist, additional signature pages are attached.

${PA_DISCLOSURE}`,
  },
  {
    id: 'd0c00000-0007-4000-8000-000000000007',
    name: 'Listing Agreement',
    description: 'Seller engagement agreement for listing, marketing, and sale of the business. Multi-owner signature slots.',
    category: 'Marketing Agreement',
    fields: [
      { key: 'seller_name', label: 'Seller Name(s)', type: 'text', required: true, placeholder: 'e.g. John Smith & Jane Smith' },
      { key: 'business_name', label: 'Business Name', type: 'text', required: true, placeholder: 'e.g. ABC Manufacturing LLC' },
      { key: 'listing_price', label: 'Listing Price', type: 'number', required: true, placeholder: '500000' },
      { key: 'commission_type', label: 'Commission Structure', type: 'select', required: true, options: ['Percentage of Total Sales Price', 'Flat Fee', 'Percentage with Minimum', 'Percentage or Minimum, Whichever is Greater'], placeholder: '' },
      { key: 'commission_rate', label: 'Commission Rate %', type: 'number', required: false, placeholder: '10' },
      { key: 'commission_flat', label: 'Flat Fee ($)', type: 'number', required: false, placeholder: '50000' },
      { key: 'commission_min', label: 'Minimum Commission ($)', type: 'number', required: false, placeholder: '15000' },
      { key: 'term_months', label: 'Term (months)', type: 'number', required: false, placeholder: '12' },
      { key: 'protection_months', label: 'Protection Period (months after term)', type: 'number', required: false, placeholder: '24' },
      { key: 'effective_date', label: 'Effective Date', type: 'date', required: true, placeholder: '' },
      { key: 'listing_date', label: 'Listing Date (for expiry tracking)', type: 'date', required: true, placeholder: '' },
      { key: 'agreement_year', label: 'Year (2025 / 2026 / 2027)', type: 'select', required: true, options: ['2025', '2026', '2027', '2028'], placeholder: '' },
      { key: 'agency_name', label: 'Agency Name', type: 'text', required: false, placeholder: 'Your brokerage' },
    ],
    parties: [
      { key: 'agent', label: 'Broker / Agency', role: 'agent' },
      { key: 'seller1', label: 'Owner 1', role: 'seller' },
      { key: 'seller2', label: 'Owner 2 (if any)', role: 'seller' },
      { key: 'seller3', label: 'Owner 3 (if any)', role: 'seller' },
    ],
    body_template: `LISTING AGREEMENT

Effective Date: {{effective_date}} · Listing Date: {{listing_date}}

THIS LISTING AGREEMENT ("Agreement") is entered into as of the Effective Date set forth above, by and between {{agency_name}} ("Broker") and the Seller(s) identified below ("Seller"), relating to the listing and sale of {{business_name}} (the "Business"). The parties agree as follows:

1. APPOINTMENT. Seller hereby appoints Broker as Seller's exclusive agent for the listing and sale of the Business, and Broker accepts such appointment.

2. LISTING PRICE. The initial listing price for the Business shall be \${{listing_price}} (the "Listing Price"). Broker shall not market the Business above or below the Listing Price without Seller's prior written consent.

3. COMMISSION AND COMPENSATION. Seller shall pay to Broker, as compensation or liquidated damages, {{commission_clause}}, if any of the following occur:
  a. Seller and Buyer consummate the sale of the Business; or
  b. Broker procures a Prospect ready, willing and able to purchase the Business at the terms set forth above, or as amended; or
  c. Seller sells, leases, trades or otherwise disposes of all or any part of the Business other than in the normal course of business; or
  d. Seller withdraws the Business for sale, seeks to terminate, or terminates this Agreement prior to the end of the Term; or
  e. Seller, through no fault of Prospect, fails or refuses to complete a sale after entering into a written agreement to do so; or
  f. Seller sells or transfers any or all shares of stock or interest in the Business; such sale or transfer is considered a sale of the Business assets at the Total Sales Price.

4. TOTAL SALES PRICE DEFINED. "Total Sales Price" is the amount paid for the Business by the person or entity purchasing the Business ("Buyer"), including inventory and any liabilities, contingent liabilities, other obligations assumed by Buyer, consulting or management agreements, and any compensation paid.

5. WHEN COMMISSION IS DUE. Broker's compensation will be due and payable upon the occurrence of any item listed in Section 3, or at the Closing, whichever is first. Broker is authorized to instruct the Closing agent to pay any and all compensation due to Broker under this Agreement at the Closing.

6. TERM AND PROTECTION. This Agreement shall remain in effect for {{term_months}} months from the Listing Date (the "Term"). Expiration: {{expiry_clause}}. For a period of {{protection_months}} months following expiration (the "Protection Period"), if the Business is sold, leased, traded or optioned to any person or entity with whom Broker or Seller had substantive negotiations during the Term, or with whom any employment, independent contractor or consulting relationship is formed, Seller shall pay Broker the commission set forth in Section 3, and such compensation shall be immediately due and payable.

7. BROKER'S AUTHORITY. Broker is authorized to: (a) advertise and market the Business; (b) distribute information to prospective buyers subject to confidentiality agreements; (c) qualify and pre-screen buyers; (d) coordinate showings and site visits; (e) co-broke the listing and advertise at its discretion; and (f) negotiate on Seller's behalf, subject to Seller's written approval of price and material terms.

8. SELLER'S OBLIGATIONS. Seller shall: (a) provide accurate financial statements and business records; (b) make the premises and records available for reasonable inspection; (c) refer all buyer inquiries to Broker; (d) not negotiate with any prospective buyer without Broker's involvement; (e) deliver to Broker copies of any agreement between Seller and any Prospect immediately; (f) permit Broker to be present at the Closing; and (g) keep Broker informed of any material changes in the Business.

9. REPRESENTATIONS. Seller represents and warrants that Seller has the legal right and authority to sell the Business, that the Business is free of undisclosed liens and encumbrances, that all information provided to Broker is true, accurate, and complete in all material respects, and that Seller and the Business are in full compliance with all applicable laws, rules and regulations regarding the Business. Seller is not under obligation to another party which would prevent Seller from freely entering into this exclusive relationship.

10. INDEMNIFICATION. Seller acknowledges that Broker has not made, and will not make, any independent investigation of the accuracy of any information provided by Seller. Seller agrees to indemnify and hold Broker harmless against any and all claims, demands, causes of action, losses, damages, costs and expenses, including attorneys' fees and expenses incurred by Broker, regardless of whether a suit is filed, in the event that Seller breaches any warranty, representation or obligation set forth herein.

11. GOVERNING LAW; VENUE; JURY WAIVER. This Agreement shall be governed by the laws of the State of Pennsylvania. The prevailing party in any litigation arising under this Agreement shall be entitled to recover, in addition to any other relief awarded, all of its attorneys' fees, costs, and expenses incurred at both trial and appellate levels. Each party agrees that any disputes under this Agreement shall be resolved exclusively in the state courts located in Harrisburg, Dauphin County, Pennsylvania, or the federal courts located in the Harrisburg District of Pennsylvania; and consents to and waives any objection to personal jurisdiction and venue therein. Each party waives any right to have a jury participate in the resolution of any dispute.

12. ENTIRE AGREEMENT. This Agreement contains the entire understanding of the parties and may only be amended in writing signed by both parties. Seller acknowledges that it has read, understood and received a copy of this Agreement.

13. PRINCIPAL GUARANTY. Seller's principal guarantees Seller's performance under the terms of this Agreement and agrees to be jointly and severally liable to pay Broker its compensation if Seller breaches the terms of this Agreement.

14. ELECTRONIC EXECUTION. Documents may be sent electronically, and such electronic copies, as well as electronic signatures, shall be treated for all purposes as (a) properly authorized and/or endorsed by the sending party; (b) "in writing" and signed; and (c) as an original document.

IN WITNESS WHEREOF, the parties have executed this Agreement as of the year {{agreement_year}}.

BROKER: {{agency_name}}
By: ____________________________  Date: ____________

SELLER(S):
Each Owner executing below authorizes the listing and sale of {{business_name}}.

${PA_DISCLOSURE}`,
    id: 'd0c00000-0002-4000-8000-000000000002',
    name: 'LLC Resolution',
    description: 'Member resolution authorizing the sale of the company or its assets — one signature slot per member.',
    category: 'Corporate Documents',
    fields: [
      { key: 'company_name', label: 'LLC Name', type: 'text', required: true, placeholder: 'e.g. ABC Manufacturing LLC' },
      { key: 'state', label: 'State of Formation', type: 'text', required: true, placeholder: 'e.g. Pennsylvania' },
      { key: 'business_name', label: 'Business Being Sold', type: 'text', required: true, placeholder: 'e.g. ABC Manufacturing LLC' },
      { key: 'resolution_date', label: 'Resolution Date', type: 'date', required: true, placeholder: '' },
      { key: 'authorized_price', label: 'Authorized Minimum Price', type: 'number', required: true, placeholder: '500000' },
      { key: 'sale_assets', label: 'Sale of', type: 'select', required: true, options: ['All assets', 'All membership interests', 'Substantially all assets'], placeholder: '' },
    ],
    parties: [
      { key: 'member1', label: 'Member 1', role: 'seller' },
      { key: 'member2', label: 'Member 2 (if any)', role: 'seller' },
      { key: 'member3', label: 'Member 3 (if any)', role: 'seller' },
      { key: 'member4', label: 'Member 4 (if any)', role: 'seller' },
    ],
    body_template: `LLC MEMBER RESOLUTION\n\n{{company_name}}, a {{state}} limited liability company\n\nRESOLVED, that the members of {{company_name}} authorize the sale of {{sale_assets}} of {{business_name}} for no less than {{authorized_price}}, and authorize the managers to execute all necessary documents to effect the sale.\n\nEach member executing below confirms their membership and authority.\n\nAdopted: {{resolution_date}}\n\n${PA_DISCLOSURE}`,
  },
  {
    id: 'd0c00000-0003-4000-8000-000000000003',
    name: 'Corporate Authorization Resolution',
    description: 'Board resolution authorizing the sale — use when Seller is organized as a Corporation. Mirrors EZ Business Advisors form: authorized officer, meeting details, multi-officer signatures.',
    category: 'Corporate Documents',
    fields: [
      { key: 'company_name', label: 'Corporation Full Legal Name', type: 'text', required: true, placeholder: 'e.g. ABC Corporation' },
      { key: 'state', label: 'State of Incorporation', type: 'text', required: true, placeholder: 'e.g. Pennsylvania' },
      { key: 'business_name', label: 'Business Being Sold', type: 'text', required: true, placeholder: 'e.g. ABC Corporation' },
      { key: 'authorized_officer', label: 'Authorized Officer Full Name', type: 'text', required: true, placeholder: 'e.g. Jane Doe' },
      { key: 'officer_title', label: 'Officer Title', type: 'text', required: true, placeholder: 'e.g. President' },
      { key: 'meeting_date', label: 'Meeting / Consent Date', type: 'date', required: true, placeholder: '' },
      { key: 'meeting_county_state', label: 'County & State of Meeting', type: 'text', required: true, placeholder: 'e.g. Dauphin County, Pennsylvania' },
      { key: 'authorized_person', label: 'Person Authorized to Act for Corporation', type: 'text', required: true, placeholder: 'e.g. John Smith' },
      { key: 'authorized_price', label: 'Authorized Minimum Price', type: 'number', required: true, placeholder: '500000' },
      { key: 'sale_assets', label: 'Sale of', type: 'select', required: true, options: ['All assets', 'All stock', 'Substantially all assets'], placeholder: '' },
    ],
    parties: [
      { key: 'officer1', label: 'Officer / Director 1', role: 'seller' },
      { key: 'officer2', label: 'Officer / Director 2 (if any)', role: 'seller' },
    ],
    body_template: `CORPORATE AUTHORIZATION RESOLUTION

Corporation Full Legal Name: {{company_name}} · State of Incorporation: {{state}}
Authorized Officer: {{authorized_officer}} · Title: {{officer_title}}
Meeting / Consent Date: {{meeting_date}} · County & State of Meeting: {{meeting_county_state}}
Person Authorized to Act on Behalf of Corporation: {{authorized_person}}

BOARD RESOLUTIONS

The undersigned hereby certifies that {{company_name}} adopted the following resolutions at a duly held meeting of the Board of Directors, or by unanimous written consent of the Board, in accordance with the Corporation's governing documents and applicable Pennsylvania law:

RESOLVED, that the authorized officer identified above is hereby empowered with full authority to:
(a) Sell, transfer, and convey any or all assets, real and personal, of the Corporation, in connection with a business sale transaction of {{business_name}} ({{sale_assets}}) for no less than {{authorized_price}};
(b) Execute the Exclusive Marketing & Listing Agreement with {{agency_name}} and any amendments thereto; and
(c) Execute and deliver all agreements, contracts, deeds, bills of sale, and other documents reasonably necessary or appropriate to complete a business sale or transfer transaction.

And, be it further RESOLVED, that this authorization shall remain effective and in full force while the Exclusive Marketing & Listing Agreement is in force, and may not be revoked, amended, or modified without the prior written consent of the Broker during such period, to the extent permitted by applicable law.

IN WITNESS WHEREOF, the undersigned certifies that the foregoing resolutions were duly adopted and are in full force and effect as of the date signed below.

${PA_DISCLOSURE}`,
  },
  {
    id: 'd0c00000-000b-4000-8000-00000000000b',
    name: 'LLC Authorization Resolution',
    description: 'Member resolution authorizing the sale — use when Seller is organized as an LLC. Multi-member signature slots.',
    category: 'Corporate Documents',
    fields: [
      { key: 'company_name', label: 'LLC Full Legal Name', type: 'text', required: true, placeholder: 'e.g. ABC Manufacturing LLC' },
      { key: 'state', label: 'State of Formation', type: 'text', required: true, placeholder: 'e.g. Pennsylvania' },
      { key: 'business_name', label: 'Business Being Sold', type: 'text', required: true, placeholder: 'e.g. ABC Manufacturing LLC' },
      { key: 'authorized_member', label: 'Authorized Member Full Name', type: 'text', required: true, placeholder: 'e.g. John Smith' },
      { key: 'meeting_date', label: 'Consent / Meeting Date', type: 'date', required: true, placeholder: '' },
      { key: 'meeting_county_state', label: 'County & State', type: 'text', required: true, placeholder: 'e.g. Dauphin County, Pennsylvania' },
      { key: 'authorized_price', label: 'Authorized Minimum Price', type: 'number', required: true, placeholder: '500000' },
      { key: 'sale_assets', label: 'Sale of', type: 'select', required: true, options: ['All assets', 'All membership interests', 'Substantially all assets'], placeholder: '' },
    ],
    parties: [
      { key: 'member1', label: 'Member 1', role: 'seller' },
      { key: 'member2', label: 'Member 2 (if any)', role: 'seller' },
      { key: 'member3', label: 'Member 3 (if any)', role: 'seller' },
      { key: 'member4', label: 'Member 4 (if any)', role: 'seller' },
    ],
    body_template: `LLC AUTHORIZATION RESOLUTION

LLC Full Legal Name: {{company_name}} · State of Formation: {{state}}
Authorized Member: {{authorized_member}}
Consent / Meeting Date: {{meeting_date}} · County & State: {{meeting_county_state}}

MEMBER RESOLUTIONS

The undersigned hereby certifies that {{company_name}} adopted the following resolutions by member consent in accordance with the LLC's operating agreement and applicable Pennsylvania law:

RESOLVED, that the members authorize the sale of {{sale_assets}} of {{business_name}} for no less than {{authorized_price}}, and authorize the authorized member identified above to execute all agreements, contracts, deeds, bills of sale, and other documents reasonably necessary to complete the transaction, including the Exclusive Marketing & Listing Agreement.

And, be it further RESOLVED, that this authorization shall remain effective while the Exclusive Marketing & Listing Agreement is in force, and may not be revoked without the prior written consent of the Broker, to the extent permitted by applicable law.

IN WITNESS WHEREOF, the undersigned certifies that the foregoing resolutions were duly adopted and are in full force and effect as of the date signed below. Each member executing below confirms their membership and authority.

${PA_DISCLOSURE}`,
  },
  {
    id: 'd0c00000-0006-4000-8000-000000000006',
    name: 'Property Addendum',
    description: 'Addendum when the business is sold together with real property.',
    category: 'Marketing Agreement',
    fields: [
      { key: 'business_name', label: 'Business Name', type: 'text', required: true, placeholder: 'e.g. ABC Manufacturing LLC' },
      { key: 'property_address', label: 'Property Address', type: 'text', required: true, placeholder: 'e.g. 123 Industrial Blvd, Harrisburg, PA' },
      { key: 'property_value', label: 'Property Value', type: 'number', required: true, placeholder: '750000' },
      { key: 'sale_type', label: 'Sale Type', type: 'select', required: true, options: ['Asset + Real Estate', 'Stock + Real Estate'], placeholder: '' },
      { key: 'addendum_date', label: 'Date', type: 'date', required: true, placeholder: '' },
    ],
    parties: [
      { key: 'seller1', label: 'Seller / Owner 1', role: 'seller' },
      { key: 'seller2', label: 'Owner 2 (if any)', role: 'seller' },
      { key: 'buyer', label: 'Buyer', role: 'buyer' },
    ],
    body_template: `PROPERTY ADDENDUM

Business: {{business_name}}
Property: {{property_address}}
Property Value: {{property_value}}
Sale Type: {{sale_type}}
Date: {{addendum_date}}

THIS PROPERTY ADDENDUM (\"Addendum\") is attached to and made a part of the Marketing Agreement and/or Listing Agreement between the Seller and Broker, and confirms the following:

1. INCLUSION OF REAL PROPERTY. The real property located at {{property_address}} (the \"Property\") is included in the sale of {{business_name}} as a {{sale_type}} transaction. The agreed value attributed to the Property for purposes of the sale is \${{property_value}}.

2. TRANSFER. The Property shall be conveyed by a deed or other instrument of transfer at closing, subject to any existing mortgages, liens, easements, and encumbrances of record.

3. BROKER NOT A REAL ESTATE BROKER. Broker acts as a business broker and transaction intermediary only and is not a real estate broker or real estate agent. The parties are advised to engage licensed real estate counsel to review the property transfer documents.

4. PROPERTY CONDITION. The Property is sold in its present \"as-is\" condition, and Seller makes no warranty as to its condition except as expressly set forth in the purchase agreement for the Property.

5. GOVERNING LAW. This Addendum shall be governed by the laws of the Commonwealth of Pennsylvania, and venue shall lie exclusively in Dauphin County, Pennsylvania.

IN WITNESS WHEREOF, the parties have executed this Addendum as of the date set forth above.

${PA_DISCLOSURE}`,
  },
  // -------------------------------------------------------------------------
  // BUYER PACK
  // -------------------------------------------------------------------------
  {
    id: 'd0c00000-0008-4000-8000-000000000008',
    name: 'Confidentiality, Disclosure & Registration Agreement (NDA)',
    description: 'Buyer NDA per EZ Business Advisors form — full 12-term confidentiality, conduct, procuring cause, PA governing law, electronic signature provisions.',
    category: 'NDA',
    fields: [
      { key: 'prospect_name', label: 'Prospect Full Legal Name', type: 'text', required: true, placeholder: 'e.g. John Smith' },
      { key: 'address', label: 'Address', type: 'text', required: false, placeholder: 'Street' },
      { key: 'city', label: 'City', type: 'text', required: false, placeholder: 'Harrisburg' },
      { key: 'state', label: 'State', type: 'text', required: false, placeholder: 'PA' },
      { key: 'zip', label: 'ZIP', type: 'text', required: false, placeholder: '17112' },
      { key: 'email', label: 'Email', type: 'text', required: true, placeholder: 'buyer@email.com' },
      { key: 'driver_license_ein', label: 'Driver License No. / EIN', type: 'text', required: false, placeholder: '' },
      { key: 'phone', label: 'Phone', type: 'text', required: false, placeholder: '(717) 555-0100' },
      { key: 'cell', label: 'Cell', type: 'text', required: false, placeholder: '' },
      { key: 'business_listing_id', label: 'Business Listing ID No.', type: 'text', required: false, placeholder: '' },
      { key: 'business_category', label: 'Business Category', type: 'text', required: false, placeholder: 'e.g. Manufacturing' },
      { key: 'effective_date', label: 'Effective Date', type: 'date', required: true, placeholder: '' },
      { key: 'agency_name', label: 'Agency Name', type: 'text', required: false, placeholder: 'EZ Business Advisors LLC' },
    ],
    parties: [
      { key: 'seller', label: 'Seller', role: 'seller' },
      { key: 'buyer', label: 'Prospect / Buyer', role: 'buyer' },
    ],
    body_template: `CONFIDENTIALITY, DISCLOSURE & REGISTRATION AGREEMENT
(Non-Disclosure Agreement)

{{agency_name}} acts as a Transaction Broker / Intermediary only. Not a Real Estate Broker or Real Estate Agent.

This Agreement is entered into by and between {{agency_name}} of Harrisburg, Pennsylvania ("Broker") and the undersigned Prospect, effective as of {{effective_date}}.

PROSPECT INFORMATION
Prospect Full Legal Name: {{prospect_name}} · Address: {{address}}, {{city}}, {{state}} {{zip}}
Email: {{email}} · Driver's License No. / EIN: {{driver_license_ein}}
Phone: {{phone}} · Cell: {{cell}}
Business Listing ID No.: {{business_listing_id}} · Business Category: {{business_category}}

TERMS AND CONDITIONS

1. Confidential Information. Prospect acknowledges that Broker and/or Seller may disclose confidential and proprietary information concerning the Business ("Confidential Information"), including non-public financial data, customer lists, supplier relationships, operational data, and business plans, whether disclosed orally, in writing, or by any other means. Prospect shall not disclose, share, or use any Confidential Information for any purpose other than evaluating a potential acquisition, and shall not disclose Confidential Information to any third party except to attorneys, accountants, lenders, or advisors who agree in writing to maintain its confidentiality.

2. Conduct. All communications regarding the Business Listing shall be conducted exclusively through Broker unless Broker gives prior written consent otherwise. Prospect shall not directly contact the Seller, Seller's employees, customers, suppliers, or visit the business premises without Broker's prior written permission. Broker earns its commission when: (a) Prospect is ready, willing, and able to purchase; (b) Prospect acquires any interest in the Business within the protected period; (c) Seller and Prospect enter a purchase contract; or (d) Prospect otherwise circumvents Broker's role.

3. Information. All documents and information provided to Prospect are for review purposes only and remain the property of Seller. Prospect shall independently verify all information and may not rely on Broker for legal, financial, tax, or business advice. Prospect agrees to indemnify and hold Broker harmless from claims arising from Prospect's use or reliance on information received.

4. Seller as Third-Party Beneficiary. Seller is an intended third-party beneficiary of this Agreement and may directly enforce the confidentiality and non-contact obligations contained herein.

5. Representation — Transaction Broker. Broker acts solely as a transaction broker and intermediary and is NOT an exclusive agent for either Seller or Prospect, unless otherwise agreed in writing. Broker is a business broker only and is not a real estate broker or real estate agent.

6. Advice. Prospect is strongly advised to consult with a licensed attorney, certified public accountant, and other qualified advisors before evaluating, negotiating, or completing the acquisition of any business.

7. Procuring Cause. Prospect acknowledges Broker as the procuring cause of any transaction involving the Business during the term of this Agreement and any applicable protected period, to the extent established by the parties' signed agreements and applicable Pennsylvania law. For a period of two (2) years from the date of this Agreement, Prospect shall not deal directly with Seller with respect to the Business without Broker's prior written consent.

8. Warranties. Prospect represents that all information provided is accurate and complete, that Prospect has sufficient financial capacity to evaluate and potentially complete a purchase, that Prospect has not filed for undisclosed bankruptcy, and that Prospect has not been convicted of any felony or disqualifying crime.

9. No Waiver. Failure by either party to enforce any term of this Agreement in any instance shall not constitute a waiver of that party's right to enforce such term in any other instance.

10. Governing Law; Venue. This Agreement is governed by the laws of the Commonwealth of Pennsylvania. Venue for all disputes shall lie exclusively in Dauphin County, Pennsylvania, unless otherwise required by applicable law.

11. Attorneys' Fees. The prevailing party in any dispute arising out of this Agreement is entitled to an award of its reasonable attorneys' fees and costs, to the extent permitted by law.

12. Copies and Electronic Signatures. Electronic signatures and electronically transmitted copies are valid and binding to the fullest extent permitted by Pennsylvania's Electronic Transactions Act, 73 P.S. § 2260.101 et seq.

IN WITNESS WHEREOF, the parties have executed this Agreement as of the date first written above.

${PA_DISCLOSURE}`,
  },
  {
    id: 'd0c00000-0004-4000-8000-000000000004',
    name: 'Buyer Profile Form',
    description: 'Buyer qualification profile — personal info, business preferences, background, financials, assets & liabilities. Mirrors EZ Business Advisors form.',
    category: 'Buyer Documents',
    fields: [
      { key: 'last_name', label: 'Last Name', type: 'text', required: true, placeholder: 'e.g. Smith' },
      { key: 'first_name', label: 'First Name', type: 'text', required: true, placeholder: 'e.g. John' },
      { key: 'middle_initial', label: 'Middle Initial', type: 'text', required: false, placeholder: 'A' },
      { key: 'spouse_name', label: 'Spouse / Partner\'s Name', type: 'text', required: false, placeholder: '' },
      { key: 'address', label: 'Address', type: 'text', required: false, placeholder: 'Street' },
      { key: 'city', label: 'City', type: 'text', required: false, placeholder: 'Harrisburg' },
      { key: 'state', label: 'State', type: 'text', required: false, placeholder: 'PA' },
      { key: 'zip', label: 'ZIP', type: 'text', required: false, placeholder: '17112' },
      { key: 'phone', label: 'Phone', type: 'text', required: false, placeholder: '(717) 555-0100' },
      { key: 'mobile', label: 'Mobile', type: 'text', required: false, placeholder: '(717) 555-0101' },
      { key: 'email', label: 'Email', type: 'text', required: true, placeholder: 'buyer@email.com' },
      { key: 'marital_status', label: 'Marital Status', type: 'select', required: true, options: ['Married', 'Single', 'Divorced'], placeholder: '' },
      { key: 'currently_employed', label: 'Currently Employed', type: 'select', required: true, options: ['Yes', 'No'], placeholder: '' },
      { key: 'relocating', label: 'Relocating', type: 'select', required: true, options: ['Yes', 'No'], placeholder: '' },
      { key: 'business_preference', label: 'Type of Business Preferred (in order)', type: 'textarea', required: true, placeholder: 'e.g. 1) Manufacturing 2) Distribution' },
      { key: 'location_preference', label: 'Location Preference — County / City', type: 'text', required: false, placeholder: 'e.g. Dauphin County, PA' },
      { key: 'franchise_ok', label: 'Consider a Franchise?', type: 'select', required: true, options: ['Yes', 'No'], placeholder: '' },
      { key: 'franchise_type', label: 'If yes, what type?', type: 'text', required: false, placeholder: '' },
      { key: 'buy_timeline', label: 'When do you plan to buy?', type: 'text', required: true, placeholder: 'e.g. 3-6 months' },
      { key: 'buy_obstacles', label: 'Issues preventing you from buying now?', type: 'textarea', required: false, placeholder: '' },
      { key: 'education', label: 'Education', type: 'select', required: true, options: ['High School', 'Some College', 'Bachelor\'s Degree', 'Graduate Degree'], placeholder: '' },
      { key: 'field_of_study', label: 'Field of Study / Major', type: 'text', required: false, placeholder: '' },
      { key: 'owned_business', label: 'Have you owned a business?', type: 'select', required: true, options: ['Yes', 'No'], placeholder: '' },
      { key: 'owned_business_type', label: 'If yes, what type?', type: 'text', required: false, placeholder: '' },
      { key: 'present_occupation', label: 'Present Occupation / Business', type: 'text', required: true, placeholder: '' },
      { key: 'annual_income', label: 'Current Annual Income ($)', type: 'number', required: false, placeholder: '150000' },
      { key: 'previous_occupation', label: 'Previous Occupation / Business', type: 'text', required: false, placeholder: '' },
      { key: 'other_decision_makers', label: 'Who else is involved in this decision?', type: 'text', required: false, placeholder: '' },
      { key: 'down_payment', label: 'Amount Set Aside for Down Payment ($)', type: 'number', required: true, placeholder: '100000' },
      { key: 'funds_available_when', label: 'When Will Funds Be Available?', type: 'text', required: true, placeholder: 'e.g. Immediately' },
      { key: 'min_owner_benefit', label: 'Minimum Owner Benefit / EBITDA Required ($)', type: 'number', required: false, placeholder: '100000' },
      { key: 'sba_qualified', label: 'Qualified for SBA Loan?', type: 'select', required: true, options: ['Yes', 'No'], placeholder: '' },
      { key: 'down_payment_source', label: 'Source of Down Payment', type: 'text', required: true, placeholder: 'e.g. Personal Savings' },
      { key: 'total_assets', label: 'Total Assets ($)', type: 'number', required: false, placeholder: '500000' },
      { key: 'total_liabilities', label: 'Total Liabilities ($)', type: 'number', required: false, placeholder: '100000' },
      { key: 'profile_date', label: 'Profile Date', type: 'date', required: true, placeholder: '' },
    ],
    parties: [
      { key: 'buyer', label: 'Buyer', role: 'buyer' },
      { key: 'agent', label: 'Broker', role: 'agent' },
    ],
    body_template: `BUYER PROFILE FORM

Date: {{profile_date}}

PERSONAL INFORMATION
Name: {{first_name}} {{middle_initial}} {{last_name}} · Spouse/Partner: {{spouse_name}}
Address: {{address}}, {{city}}, {{state}} {{zip}}
Phone: {{phone}} · Mobile: {{mobile}} · Email: {{email}}
Marital Status: {{marital_status}} · Employed: {{currently_employed}} · Relocating: {{relocating}}

BUSINESS PREFERENCES
Type of Business Preferred: {{business_preference}}
Location Preference: {{location_preference}}
Franchise Considered: {{franchise_ok}}{{franchise_type ? ' — ' + franchise_type : ''}}
Plan to Buy: {{buy_timeline}}
Obstacles: {{buy_obstacles}}

BACKGROUND
Education: {{education}} · Field of Study: {{field_of_study}}
Owned a Business: {{owned_business}}{{owned_business_type ? ' — ' + owned_business_type : ''}}
Present Occupation: {{present_occupation}}
Current Annual Income: \${{annual_income}} · Previous Occupation: {{previous_occupation}}
Others in Decision: {{other_decision_makers}}

FINANCIAL INFORMATION
Down Payment Set Aside: \${{down_payment}} · Funds Available: {{funds_available_when}}
Minimum Owner Benefit / EBITDA Required: \${{min_owner_benefit}}
SBA Qualified: {{sba_qualified}} · Source of Down Payment: {{down_payment_source}}

ASSETS & LIABILITIES
Total Assets: \${{total_assets}} · Total Liabilities: \${{total_liabilities}}

BUYER CERTIFICATION
Buyer represents that all information provided herein is true and correct to the best of Buyer's knowledge. Buyer understands that providing false or misleading information may result in termination of the engagement and potential legal liability.

${PA_DISCLOSURE}`,
  },
  {
    id: 'd0c00000-0005-4000-8000-000000000005',
    name: 'Due Diligence Checklist',
    description: 'Standard due diligence checklist shared with the buyer after LOI.',
    category: 'Buyer Documents',
    fields: [
      { key: 'business_name', label: 'Business Name', type: 'text', required: true, placeholder: 'e.g. ABC Manufacturing LLC' },
      { key: 'checklist_date', label: 'Date', type: 'date', required: true, placeholder: '' },
      { key: 'diligence_days', label: 'Diligence Period (days)', type: 'number', required: true, placeholder: '30' },
    ],
    parties: [
      { key: 'buyer', label: 'Buyer', role: 'buyer' },
      { key: 'seller', label: 'Seller', role: 'seller' },
    ],
    body_template: `DUE DILIGENCE CHECKLIST\n\nBusiness: {{business_name}}\nDate: {{checklist_date}}\nDiligence Period: {{diligence_days}} days\n\n1. Last 3 years federal and state business income tax returns\n2. Year-end P&L statements (3 years) + current YTD P&L\n3. Year-end balance sheets (3 years) + current interim balance sheet\n4. Monthly sales reports (3 years)\n5. Lease(s) and/or deed for business premises\n6. Itemized FF&E list (furniture, fixtures, equipment) owned or to be transferred\n7. List of equipment borrowed or leased (with copies of leases; vehicles with make/model/year/mileage)\n8. Top five customers by revenue (confidential)\n9. Major suppliers and key supplier contracts\n10. Employee list (name, title, length of service, compensation — last 12 months, including owners)\n11. Major creditors and outstanding balances\n12. Contractual obligations to be assumed (franchise, distribution, employment, equipment leases, service agreements)\n13. Appraisals from the last 24 months (if any)\n\nBoth parties acknowledge the above checklist governs the diligence period.\n\n${PA_DISCLOSURE}`,
  },
  // -------------------------------------------------------------------------
  // SELLER DOCUMENTATION CHECKLIST (from Boss's actual form)
  // -------------------------------------------------------------------------
  {
    id: 'd0c00000-0009-4000-8000-000000000009',
    name: 'Documentation Checklist (Seller Package)',
    description: 'EZ Business Advisors Documentation Checklist — financial, facility, operations, and marketing materials the seller must provide before listing.',
    category: 'Seller Documents',
    fields: [
      { key: 'business_name', label: 'Business Name', type: 'text', required: true, placeholder: 'e.g. ABC Manufacturing LLC' },
      { key: 'checklist_date', label: 'Date', type: 'date', required: true, placeholder: '' },
      { key: 'advisor_name', label: 'Advisor / Broker Name', type: 'text', required: false, placeholder: 'Your name' },
      { key: 'contact_phone', label: 'Contact Phone', type: 'text', required: false, placeholder: '(717) 555-0100' },
    ],
    parties: [
      { key: 'seller1', label: 'Owner 1', role: 'seller' },
      { key: 'seller2', label: 'Owner 2 (if any)', role: 'seller' },
      { key: 'agent', label: 'Broker / Advisor', role: 'agent' },
    ],
    body_template: `DOCUMENTATION CHECKLIST — SELLER PACKAGE\n\nBusiness: {{business_name}}\nDate: {{checklist_date}}\nAdvisor: {{advisor_name}} · {{contact_phone}}\n\nFINANCIAL DOCUMENTS\n■ Last 3 years of federal and state business income tax returns\n■ Year-end Profit & Loss Statements for the last 3 years\n■ Current year interim (year-to-date) P&L Statement\n■ Year-end Balance Sheets for the last 3 years + current interim Balance Sheet\n■ Monthly sales reports for the last 3 years\n■ Name, firm, phone, and email of your Accountant or CPA\n\nFACILITY DOCUMENTS\n■ Complete copy of current Lease(s) and/or Deed for business premises\n■ Complete itemized list of all Furniture, Fixtures, and Equipment (FF&E) owned outright or to be transferred — exclude personal items not for sale\n■ Separate list of equipment NOT owned by the business (borrowed or leased); include equipment leases; for vehicles: make/model/year/mileage\n■ Any appraisals for business property or equipment completed in the last 24 months\n\nBUSINESS OPERATIONS\n■ Top five (5) customers by revenue contribution (held strictly confidential)\n■ List of major suppliers and copies of key supplier contracts\n■ Complete employee list: name, title, length of service, compensation (last 12 months) — include the owner(s)\n■ List of all major creditors and outstanding balances\n■ Ongoing or upcoming contractual obligations to be assumed by Purchaser (franchise agreements, distribution rights, employment contracts, equipment leases, service agreements, etc.)\n\nMARKETING MATERIALS\n■ Current price lists\n■ Menus, service descriptions, or product offering information\n■ Franchise documents and contracts (if applicable)\n■ Company brochures, flyers, and marketing collateral\n■ Website URL(s), login credentials (for transfer), social media profiles\n■ Product catalogs or portfolios\n■ Any other information relevant to the business offering\n\nYour Business Listing Information (BLI) will be prepared from this material. Notify your Advisor of any pertinent omissions.\n\n${PA_DISCLOSURE}`,
  },
  {
    id: 'd0c00000-000a-4000-8000-00000000000a',
    name: 'Purchase Agreement',
    description: 'Sale and purchase agreement between buyer and seller — multi-owner signature slots.',
    category: 'Purchase Agreement',
    fields: [
      { key: 'buyer_name', label: 'Buyer Name', type: 'text', required: true, placeholder: 'e.g. John Smith' },
      { key: 'seller_name', label: 'Seller Name(s)', type: 'text', required: true, placeholder: 'e.g. John Smith & Jane Smith' },
      { key: 'business_name', label: 'Business Name', type: 'text', required: true, placeholder: 'e.g. ABC Manufacturing LLC' },
      { key: 'purchase_price', label: 'Purchase Price', type: 'number', required: true, placeholder: '500000' },
      { key: 'closing_date', label: 'Target Closing Date', type: 'date', required: true, placeholder: '' },
    ],
    parties: [
      { key: 'seller1', label: 'Seller / Owner 1', role: 'seller' },
      { key: 'seller2', label: 'Owner 2 (if any)', role: 'seller' },
      { key: 'buyer', label: 'Buyer', role: 'buyer' },
    ],
    body_template: `PURCHASE AGREEMENT

Business: {{business_name}}
Purchase Price: \${{purchase_price}}
Target Closing: {{closing_date}}

THIS PURCHASE AGREEMENT (\"Agreement\") is entered into as of {{closing_date}}, by and between the Seller(s) identified below (\"Seller\") and {{buyer_name}} (\"Buyer\"), for the purchase and sale of {{business_name}} (the \"Business\"). The parties agree as follows:

1. PURCHASE AND SALE. Subject to the terms of this Agreement, Seller agrees to sell, and Buyer agrees to purchase, the Business, including its assets, goodwill, trade name, inventory, equipment, and other tangible and intangible property as more fully described in the Definitive Purchase Agreement to be executed by the parties (the \"Definitive Agreement\").

2. PURCHASE PRICE. The total purchase price for the Business is \${{purchase_price}}, payable in cash, promissory note, assumed liabilities, or other consideration as set forth in the Definitive Agreement.

3. DUE DILIGENCE. Buyer shall have the right to conduct due diligence with respect to the Business, including review of financial statements, tax returns, contracts, leases, and other records, for the period set forth in the Due Diligence Checklist.

4. CLOSING. The closing of the transaction shall occur on or before the Target Closing Date, or such other date as the parties may agree in writing (the \"Closing\").

5. CONDITIONS. Seller's obligation to close is subject to Buyer's payment of the Purchase Price. Buyer's obligation to close is subject to satisfactory completion of due diligence and Buyer's ability to obtain financing, if any.

6. SELLER'S REPRESENTATIONS. Each Seller represents and warrants that Seller has full authority to sell the Business, that the Business is free of undisclosed liens and encumbrances, and that all information provided to Buyer is true and accurate in all material respects.

7. BUYER'S REPRESENTATIONS. Buyer represents that Buyer has the financial capacity to complete the purchase and that Buyer is acquiring the Business for Buyer's own account.

8. BROKER'S ROLE. The parties acknowledge that Broker acted as a transaction intermediary in this transaction. Broker is not a party to this Agreement and makes no representations or warranties regarding the Business.

9. GOVERNING LAW. This Agreement shall be governed by the laws of the Commonwealth of Pennsylvania, with venue in Dauphin County, Pennsylvania.

IN WITNESS WHEREOF, the parties have executed this Agreement as of the date first written above.

SELLER(S):
Each Seller executing below confirms their authority to sell.

BUYER: {{buyer_name}}

${PA_DISCLOSURE}`,
  },
  {
    id: 'd0c00000-000c-4000-8000-00000000000c',
    name: 'Seller Interview Form',
    description: 'Complete seller questionnaire used to prepare the Business Listing Information (BLI). Mirrors EZ Business Advisors form. Multi-owner certification signatures.',
    category: 'Seller Documents',
    fields: [
      { key: 'business_name', label: 'Business Name', type: 'text', required: true, placeholder: 'e.g. ABC Manufacturing LLC' },
      { key: 'legal_entity_name', label: 'Legal Entity Name', type: 'text', required: true, placeholder: 'e.g. ABC Manufacturing LLC' },
      { key: 'seller_name', label: 'Principal / Owner Name', type: 'text', required: true, placeholder: 'e.g. John Smith' },
      { key: 'owner_address', label: 'Principal Home Address', type: 'text', required: false, placeholder: 'Street, City, State, ZIP' },
      { key: 'best_phone', label: 'Best Contact Phone', type: 'text', required: false, placeholder: '(717) 555-0100' },
      { key: 'reason_for_sale', label: 'Reason for Sale', type: 'textarea', required: false, placeholder: 'e.g. Retirement' },
      { key: 'business_phone', label: 'Business Telephone', type: 'text', required: false, placeholder: '(717) 555-0199' },
      { key: 'website', label: 'Website', type: 'text', required: false, placeholder: 'https://…' },
      { key: 'hours', label: 'Hours of Operation', type: 'text', required: false, placeholder: 'e.g. M–F 9–5' },
      { key: 'owner_hours_week', label: 'Hours Owner Works per Week', type: 'text', required: false, placeholder: 'e.g. 50' },
      { key: 'years_established', label: 'Years Established', type: 'number', required: false, placeholder: '15' },
      { key: 'years_ownership', label: 'Years Under Current Ownership', type: 'number', required: false, placeholder: '10' },
      { key: 'org_type', label: 'Organization Type', type: 'select', required: true, options: ['LLC', 'Corporation', 'Sole Proprietorship', 'Partnership'], placeholder: '' },
      { key: 'state_formed', label: 'State of Incorporation / Formation', type: 'text', required: false, placeholder: 'e.g. Pennsylvania' },
      { key: 'relocatable', label: 'Is Business Relocatable?', type: 'select', required: true, options: ['Yes', 'No'], placeholder: '' },
      { key: 'home_based', label: 'Home-Based?', type: 'select', required: true, options: ['Yes', 'No'], placeholder: '' },
      { key: 'franchise', label: 'Franchise?', type: 'select', required: true, options: ['Yes', 'No'], placeholder: '' },
      { key: 'employees_managers', label: 'Managers', type: 'number', required: false, placeholder: '2' },
      { key: 'employees_full_time', label: 'Full-Time Employees', type: 'number', required: false, placeholder: '8' },
      { key: 'employees_part_time', label: 'Part-Time Employees', type: 'number', required: false, placeholder: '3' },
      { key: 'lawsuits', label: 'Lawsuits Existing or Pending?', type: 'select', required: true, options: ['No', 'Yes — explained below'], placeholder: '' },
      { key: 'tax_liens', label: 'Tax Liens?', type: 'select', required: true, options: ['No', 'Yes — explained below'], placeholder: '' },
      { key: 'legal_notes', label: 'If yes to either, please explain', type: 'textarea', required: false, placeholder: '' },
      { key: 'skills_licenses', label: 'Skills / Licenses Required to Operate', type: 'text', required: false, placeholder: 'e.g. HVAC license' },
      { key: 'business_category', label: 'Business Category', type: 'text', required: true, placeholder: 'e.g. Manufacturing' },
      { key: 'sub_category', label: 'Business Sub-Category / Detail', type: 'text', required: false, placeholder: 'e.g. Precision machining' },
      { key: 'business_description', label: 'Business Description', type: 'textarea', required: false, placeholder: '' },
      { key: 'growth_opportunities', label: 'Potential Growth Opportunities', type: 'textarea', required: false, placeholder: '' },
      { key: 'competitive_overview', label: 'Competitive Overview', type: 'textarea', required: false, placeholder: '' },
      { key: 'general_location', label: 'General Location', type: 'text', required: false, placeholder: 'e.g. Harrisburg, PA' },
      { key: 'facility_type', label: 'Facility Type', type: 'select', required: false, options: ['Office', 'Retail', 'Warehouse', 'Other'], placeholder: '' },
      { key: 'building_type', label: 'Building Type', type: 'select', required: false, options: ['Own', 'Lease'], placeholder: '' },
      { key: 'leasable_sqft', label: 'Leasable Square Feet', type: 'number', required: false, placeholder: '5000' },
      { key: 'monthly_rent', label: 'Monthly Rent / Lease ($)', type: 'number', required: false, placeholder: '4000' },
      { key: 'lease_expiration', label: 'Lease Expiration Date', type: 'date', required: false, placeholder: '' },
      { key: 'interview_date', label: 'Interview Date', type: 'date', required: true, placeholder: '' },
    ],
    parties: [
      { key: 'seller1', label: 'Owner 1', role: 'seller' },
      { key: 'seller2', label: 'Owner 2 (if any)', role: 'seller' },
      { key: 'agent', label: 'Broker / Advisor', role: 'agent' },
    ],
    body_template: `SELLER INTERVIEW FORM

Business: {{business_name}} · Legal Entity: {{legal_entity_name}}
Organization Type: {{org_type}} · State: {{state_formed}}
Interview Date: {{interview_date}}

SELLER INFORMATION
Principal / Owner: {{seller_name}} · Address: {{owner_address}}
Best Contact Phone: {{best_phone}}
Reason for Sale: {{reason_for_sale}}

BUSINESS DETAILS
Business Telephone: {{business_phone}} · Website: {{website}} · Hours: {{hours}}
Owner Works: {{owner_hours_week}} hrs/week · Established: {{years_established}} · Under Current Ownership: {{years_ownership}}
Relocatable: {{relocatable}} · Home-Based: {{home_based}} · Franchise: {{franchise}}

EMPLOYEES (Excluding Owner)
Managers: {{employees_managers}} · Full Time: {{employees_full_time}} · Part Time: {{employees_part_time}}

LEGAL & OPERATIONS
Lawsuits: {{lawsuits}} · Tax Liens: {{tax_liens}}
Explanation: {{legal_notes}}
Skills / Licenses Required: {{skills_licenses}}
Business Category: {{business_category}} · Sub-Category: {{sub_category}}

BUSINESS PROFILE
Description: {{business_description}}
Growth Opportunities: {{growth_opportunities}}
Competitive Overview: {{competitive_overview}}

LOCATION
General Location: {{general_location}} · Facility Type: {{facility_type}} · Building: {{building_type}}
Leasable SqFt: {{leasable_sqft}} · Monthly Rent: \${{monthly_rent}} · Lease Expires: {{lease_expiration}}

CERTIFICATION
The above information has been provided by Seller and is believed to be true and correct to the best of Seller's knowledge. Broker makes no independent representation or warranty as to accuracy. By signing below, each Seller certifies the above.

${PA_DISCLOSURE}`,
  },
]

console.log(`Upserting ${TEMPLATES.length} legal templates…`)
const { error } = await db.from('document_templates').upsert(
  TEMPLATES.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    category: t.category,
    fields: t.fields,
    parties: t.parties,
    body_template: t.body_template,
    is_active: true,
  })),
  { onConflict: 'id' },
)
if (error) throw new Error('template upsert failed: ' + error.message)

const { data, error: qErr } = await db.from('document_templates').select('name, category').order('name')
if (qErr) throw new Error('verify failed: ' + qErr.message)

console.log('\n✅ EZ LEGAL PACK SEEDED (PA LAW + MULTI-OWNER)')
data.forEach((t) => console.log(`  • ${t.name} (${t.category})`))

/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// GENERIC LEGAL PACK — white-label document templates for the CRM.
// -----------------------------------------------------------------------------
// Every template is written to full legal standard (top-firm style): recitals,
// defined terms, representations & warranties, indemnification, governing law,
// counterpart execution, and signature blocks. They are intentionally GENERIC
// (no personal/agency branding) so any agency buying the CRM ships with an
// intact, professional legal pack. Parties + fields render into the fillable
// document engine with e-sign slots.
//
// NOTE: These are standard forms, not legal advice. Each carries a footer
// advising consultation with an attorney licensed in the relevant jurisdiction.
// =============================================================================

export interface PackTemplateSeed {
  name: string
  description: string
  category: string
  fields: unknown[]
  parties: unknown[]
  body_template: string
}

const LEGAL_FOOTER =
  '\n\n---\nThis is a general form document provided for convenience and does not constitute legal advice. All parties are strongly advised to review this document with an attorney licensed in the applicable jurisdiction before signing.'

export const PACK_TEMPLATES: PackTemplateSeed[] = [
  {
    name: 'Exclusive Listing Agreement',
    description: 'Full-service exclusive right-to-sell engagement between the Seller and the Brokerage — commission, term, non-circumvention, and representations & warranties.',
    category: 'Seller Pack',
    fields: [
      { key: 'business_name', label: 'Business Name', type: 'text', required: true },
      { key: 'seller_name', label: 'Seller Legal Name', type: 'text', required: true },
      { key: 'seller_entity_type', label: 'Seller Entity Type', type: 'select', required: true, options: ['Individual', 'Corporation', 'LLC', 'Partnership', 'Trust', 'Other'] },
      { key: 'asking_price', label: 'Asking Price ($)', type: 'number', required: true },
      { key: 'commission_rate', label: 'Commission Rate (%)', type: 'number', required: true, placeholder: 'e.g. 10' },
      { key: 'minimum_commission', label: 'Minimum Commission ($)', type: 'number', required: false },
      { key: 'term_months', label: 'Exclusive Listing Term (months)', type: 'number', required: false, default: 12, placeholder: 'e.g. 12' },
      { key: 'listing_date', label: 'Listing Date', type: 'date', required: true },
      { key: 'tail_period', label: 'Tail / Protection Period (months)', type: 'number', required: false, default: 6 },
      { key: 'non_compete_radius', label: 'Non-Compete Radius (miles)', type: 'text', required: false },
      { key: 'agency_name', label: 'Brokerage Name', type: 'text', required: true },
      { key: 'broker_name', label: 'Broker Name', type: 'text', required: true },
    ],
    parties: [
      { key: 'agent', label: 'Broker', role: 'agent' },
      { key: 'seller', label: 'Seller', role: 'seller' },
    ],
    body_template: `{{title}}

EXCLUSIVE LISTING AGREEMENT

This Exclusive Listing Agreement (this "Agreement") is entered into as of {{listing_date}} (the "Effective Date"), by and between {{seller_name}}, a {{seller_entity_type}} ("Seller"), and {{broker_name}} of {{agency_name}} ("Broker"). Seller and Broker are each a "Party" and collectively the "Parties."

RECITALS

WHEREAS, Seller owns or controls the business known as {{business_name}} (the "Business"); and

WHEREAS, Seller desires to engage Broker on an exclusive basis to market and sell the Business, and Broker desires to accept such engagement on the terms set forth herein.

NOW, THEREFORE, in consideration of the mutual covenants contained herein and other good and valuable consideration, the receipt and sufficiency of which are hereby acknowledged, the Parties agree as follows:

1. ENGAGEMENT. Seller hereby grants Broker the exclusive right to market, advertise, and solicit purchasers for the Business during the Term, and to negotiate on Seller's behalf with prospective purchasers.

2. LISTING PRICE. The initial asking price for the Business shall be \${{asking_price}} (the "Listing Price"), which may be adjusted only with the mutual written consent of the Parties.

3. COMMISSION. In consideration of Broker's services, Seller agrees to pay Broker a commission equal to {{commission_rate}}% of the final purchase price (the "Commission"), payable at closing, and in no event less than a minimum commission of \${{minimum_commission}}. The Commission shall be deemed earned and payable if, during the Term or any tail period, the Business is sold, transferred, or otherwise disposed of to any purchaser introduced by Broker or with whom Seller had negotiations, whether initiated during or after the Term, in accordance with the terms of this Agreement.

4. LISTING TERM AND TAIL. This Agreement shall remain in full force for an exclusive listing term of {{term_months}} months from the Effective Date (the "Term"). Seller agrees that if a sale of the Business occurs within {{tail_period}} months after the expiration of the Term (the "Tail Period") to any purchaser with whom Broker had substantive negotiations during the Term, the Commission shall still be due and payable.

5. NON-CIRCUMVENTION. Seller agrees not to circumvent Broker by selling the Business to any purchaser introduced by Broker without Broker's participation, and to refer all inquiries regarding the Business to Broker during the Term.

6. SELLER'S REPRESENTATIONS. Seller represents and warrants that: (a) Seller has the full right, power, and authority to sell the Business; (b) all financial and operational information provided to Broker is true, accurate, and complete in all material respects; and (c) there are no undisclosed liabilities, judgments, or encumbrances affecting the Business that would materially impair its sale.

7. COOPERATION. Seller shall cooperate with Broker's reasonable marketing efforts, including providing access to facilities, financial records, and management for due diligence by qualified purchasers.

8. CONFIDENTIALITY. Broker shall hold all non-public information concerning the Business in confidence and shall not disclose same except to qualified purchasers who have executed a confidentiality agreement.

9. INDEMNIFICATION. Seller agrees to indemnify and hold Broker harmless from any claims, damages, or liabilities arising out of Seller's breach of this Agreement or Seller's misrepresentations, except to the extent caused by Broker's gross negligence or willful misconduct.

10. INDEPENDENT CONTRACTOR. Broker is an independent contractor and not an employee, partner, or agent of Seller except as expressly set forth herein.

11. GOVERNING LAW. This Agreement shall be governed by and construed in accordance with the laws of the state in which the Business is located, without regard to conflict-of-law principles. The Parties consent to the exclusive jurisdiction of the courts located therein.

12. ENTIRE AGREEMENT. This Agreement constitutes the entire understanding of the Parties and supersedes all prior agreements, whether written or oral. No modification shall be effective unless in writing and signed by both Parties.

13. COUNTERPARTS. This Agreement may be executed in counterparts, each of which shall be deemed an original, and all of which together shall constitute one instrument. Signatures transmitted electronically shall be deemed original signatures.

IN WITNESS WHEREOF, the Parties have executed this Agreement as of the Effective Date.

SELLER:
Signature: ______________________________
Printed Name: __________________________
Title: __________________________________
Date: ___________________________________

BROKER ({{agency_name}}):
Signature: ______________________________
Printed Name: {{broker_name}}
Title: __________________________________
Date: ___________________________________{{LEGAL_FOOTER}}`,
  },
  {
    name: 'Confidentiality & Non-Disclosure Agreement (NDA)',
    description: 'Mutual confidentiality agreement protecting Seller financials, customer lists, and proprietary information before release to prospective buyers.',
    category: 'Buyer Pack',
    fields: [
      { key: 'prospect_name', label: 'Prospect Full Legal Name', type: 'text', required: true },
      { key: 'prospect_entity', label: 'Prospect Entity / Company', type: 'text', required: false },
      { key: 'business_name', label: 'Business Name', type: 'text', required: true },
      { key: 'buyer_address', label: 'Prospect Address', type: 'text', required: false },
      { key: 'buyer_email', label: 'Prospect Email', type: 'text', required: false },
      { key: 'buyer_phone', label: 'Prospect Phone', type: 'text', required: false },
      { key: 'nda_date', label: 'Date', type: 'date', required: true },
      { key: 'confidentiality_period', label: 'Confidentiality Period (years)', type: 'number', required: false },
      { key: 'agency_name', label: 'Brokerage Name', type: 'text', required: true },
      { key: 'broker_name', label: 'Broker Name', type: 'text', required: true },
    ],
    parties: [
      { key: 'agent', label: 'Broker', role: 'agent' },
      { key: 'buyer', label: 'Prospect', role: 'buyer' },
    ],
    body_template: `{{title}}

CONFIDENTIALITY, NON-DISCLOSURE & REGISTRATION AGREEMENT

This Confidentiality, Non-Disclosure & Registration Agreement (this "Agreement") is entered into as of {{nda_date}}, by and between {{prospect_name}} {{prospect_entity}} ("Recipient") and {{broker_name}} of {{agency_name}} ("Broker"), for the purpose of evaluating the possible acquisition of the business known as {{business_name}} (the "Business").

RECITALS

WHEREAS, the Seller of the Business (the "Seller") has engaged Broker to market the Business; and

WHEREAS, Recipient desires to receive certain confidential information concerning the Business for the sole purpose of evaluating a potential acquisition; and

WHEREAS, Broker is willing to disclose such information subject to the terms of this Agreement.

NOW, THEREFORE, the Parties agree as follows:

1. CONFIDENTIAL INFORMATION. "Confidential Information" means all non-public information concerning the Business, including without limitation financial statements, tax returns, customer lists, supplier relationships, pricing, employee information, operational data, contracts, and business plans, whether disclosed orally, in writing, or by any other means.

2. OBLIGATIONS OF RECIPIENT. Recipient shall: (a) hold all Confidential Information in strict confidence; (b) use Confidential Information solely for the purpose of evaluating a potential acquisition; (c) not disclose Confidential Information to any third party except advisors bound by comparable confidentiality obligations; and (d) not use Confidential Information for any competitive or other purpose.

3. NON-CONTACT. Recipient shall not contact, directly or indirectly, the Seller, the Seller's employees, customers, or suppliers without the prior written consent of Broker. All communications regarding the Business shall be conducted exclusively through Broker.

4. NON-CIRCUMVENTION. Recipient acknowledges that Broker is the procuring cause of Recipient's introduction to the Business and agrees not to circumvent Broker by dealing directly with Seller with respect to the Business. If Recipient acquires the Business or any interest therein, Broker's commission shall be payable in accordance with the Seller's listing agreement.

5. RETURN OF INFORMATION. Upon request, Recipient shall promptly return or destroy all Confidential Information and all copies thereof.

6. NO REPRESENTATION. Broker makes no representation or warranty as to the accuracy or completeness of any Confidential Information. Recipient shall independently verify all information and shall not rely on Broker for legal, tax, financial, or business advice.

7. TERM AND SURVIVAL. The obligations of this Agreement shall survive for a period of {{confidentiality_period}} years from the date hereof. The non-circumvention and non-contact obligations shall survive any termination of this Agreement.

8. GOVERNING LAW. This Agreement shall be governed by the laws of the state in which the Business is located. Venue shall lie exclusively in the courts located therein.

9. REMEDIES. Recipient acknowledges that a breach of this Agreement may cause irreparable harm for which monetary damages are inadequate, and Broker and Seller shall be entitled to injunctive relief in addition to all other remedies available at law or in equity.

10. COUNTERPARTS. This Agreement may be executed in counterparts, each of which shall be deemed an original. Electronic signatures shall be deemed original signatures.

IN WITNESS WHEREOF, the Parties have executed this Agreement as of the date first written above.

RECIPIENT:
Signature: ______________________________
Printed Name: {{prospect_name}}
Date: ___________________________________

BROKER ({{agency_name}}):
Signature: ______________________________
Printed Name: {{broker_name}}
Date: ___________________________________{{LEGAL_FOOTER}}`,
  },
  {
    name: 'Buyer Profile Form',
    description: 'Structured buyer qualification form — background, acquisition criteria, financial capacity, and funding source.',
    category: 'Buyer Pack',
    fields: [
      { key: 'full_name', label: 'Full Legal Name', type: 'text', required: true },
      { key: 'email', label: 'Email', type: 'text', required: true },
      { key: 'phone', label: 'Phone', type: 'text', required: false },
      { key: 'address', label: 'Address', type: 'text', required: false },
      { key: 'desired_business_type', label: 'Type of Business Preferred', type: 'text', required: false },
      { key: 'budget_range', label: 'Budget Range', type: 'text', required: true, placeholder: 'e.g. $500K – $1M' },
      { key: 'funds_available', label: 'Liquid Funds Available ($)', type: 'number', required: true },
      { key: 'down_payment', label: 'Down Payment Available ($)', type: 'number', required: false },
      { key: 'financing_method', label: 'Financing Method', type: 'select', required: false, options: ['Cash', 'SBA Loan', 'Bank Financing', 'Seller Financing', 'Combination', 'Other'] },
      { key: 'experience', label: 'Relevant Experience / Background', type: 'text', required: false },
      { key: 'preferred_location', label: 'Preferred Location', type: 'text', required: false },
      { key: 'timeline', label: 'Target Timeline', type: 'text', required: false },
      { key: 'profile_date', label: 'Date', type: 'date', required: true },
      { key: 'agency_name', label: 'Brokerage Name', type: 'text', required: true },
    ],
    parties: [
      { key: 'agent', label: 'Broker', role: 'agent' },
      { key: 'buyer', label: 'Buyer', role: 'buyer' },
    ],
    body_template: `{{title}}

BUYER PROFILE & REGISTRATION FORM

This Buyer Profile Form is submitted by the undersigned prospective purchaser ("Buyer") to {{agency_name}} ("Broker") in connection with Buyer's interest in acquiring a business. The information provided herein is for the purpose of qualification and registration.

SECTION 1 — IDENTIFICATION

Full Legal Name: {{full_name}}
Email: {{email}}
Phone: {{phone}}
Address: {{address}}

SECTION 2 — ACQUISITION CRITERIA

Type of Business Preferred: {{desired_business_type}}
Preferred Location: {{preferred_location}}
Target Timeline: {{timeline}}

SECTION 3 — FINANCIAL CAPACITY

Budget Range: {{budget_range}}
Liquid Funds Available: \${{funds_available}}
Down Payment Available: {{down_payment}}
Financing Method: {{financing_method}}

SECTION 4 — BACKGROUND

Relevant Experience: {{experience}}

CERTIFICATION

Buyer certifies that the information provided herein is true, accurate, and complete to the best of Buyer's knowledge. Buyer understands that the provision of false or misleading information may result in termination of Buyer's registration and potential legal liability. Buyer acknowledges that registration does not constitute an offer, acceptance, or binding commitment to purchase any business, and that all transactions remain subject to the execution of definitive agreements.

Buyer further acknowledges that all financial information provided may be verified, and that Broker may require additional documentation, including proof of funds, prior to the release of confidential business information.

BUYER'S SIGNATURE:
Signature: ______________________________
Printed Name: {{full_name}}
Date: {{profile_date}}

BROKER ({{agency_name}}):
Signature: ______________________________
Printed Name: __________________________
Date: ___________________________________{{LEGAL_FOOTER}}`,
  },
  {
    name: 'Seller Interview Form',
    description: 'Comprehensive seller intake — business profile, operations, employees, assets, liabilities, and sale motivation. Feeds the BLI and CIM.',
    category: 'Seller Pack',
    fields: [
      { key: 'business_name', label: 'Business Name', type: 'text', required: true },
      { key: 'legal_entity', label: 'Legal Entity Name', type: 'text', required: false },
      { key: 'seller_name', label: 'Principal / Owner Name', type: 'text', required: true },
      { key: 'business_address', label: 'Business Address', type: 'text', required: false },
      { key: 'phone', label: 'Business Phone', type: 'text', required: false },
      { key: 'website', label: 'Website', type: 'text', required: false },
      { key: 'industry', label: 'Business Category / Industry', type: 'text', required: true },
      { key: 'sub_industry', label: 'Sub-Category / Detail', type: 'text', required: false },
      { key: 'years_established', label: 'Years Established', type: 'number', required: false },
      { key: 'employees_ft', label: 'Full-Time Employees', type: 'number', required: false },
      { key: 'employees_pt', label: 'Part-Time Employees', type: 'number', required: false },
      { key: 'annual_revenue', label: 'Annual Revenue ($)', type: 'number', required: true },
      { key: 'sde', label: 'SDE ($)', type: 'number', required: false },
      { key: 'ebitda', label: 'EBITDA ($)', type: 'number', required: false },
      { key: 'inventory_value', label: 'Inventory Value ($)', type: 'number', required: false },
      { key: 'ffe_value', label: 'FF&E Value ($)', type: 'number', required: false },
      { key: 'real_estate', label: 'Real Estate Included?', type: 'select', required: false, options: ['Yes', 'No'] },
      { key: 'lease_monthly', label: 'Monthly Lease ($)', type: 'number', required: false },
      { key: 'lease_expiration', label: 'Lease Expiration', type: 'text', required: false },
      { key: 'reason_for_sale', label: 'Reason for Sale', type: 'text', required: true },
      { key: 'growth_opportunities', label: 'Growth Opportunities', type: 'text', required: false },
      { key: 'competitive_advantages', label: 'Competitive Advantages', type: 'text', required: false },
      { key: 'seller_financing', label: 'Seller Financing Available?', type: 'select', required: false, options: ['Yes', 'No'] },
      { key: 'interview_date', label: 'Interview Date', type: 'date', required: true },
      { key: 'agency_name', label: 'Brokerage Name', type: 'text', required: true },
      { key: 'broker_name', label: 'Broker Name', type: 'text', required: true },
    ],
    parties: [
      { key: 'agent', label: 'Broker', role: 'agent' },
      { key: 'seller', label: 'Seller', role: 'seller' },
    ],
    body_template: `{{title}}

SELLER INTERVIEW FORM

This Seller Interview Form is completed by the undersigned owner ("Seller") of {{business_name}} (the "Business") in connection with the engagement of {{broker_name}} of {{agency_name}} ("Broker") to market the Business. This information is used exclusively to prepare the Business Listing Information (BLI) and marketing materials and is held in strict confidence.

SECTION 1 — SELLER & BUSINESS IDENTIFICATION

Owner / Principal Name: {{seller_name}}
Business Name: {{business_name}}
Legal Entity Name: {{legal_entity}}
Business Address: {{business_address}}
Business Phone: {{phone}}
Website: {{website}}

SECTION 2 — BUSINESS PROFILE

Business Category: {{industry}}
Sub-Category / Detail: {{sub_industry}}
Years Established: {{years_established}}
Full-Time Employees: {{employees_ft}}
Part-Time Employees: {{employees_pt}}

SECTION 3 — FINANCIAL OVERVIEW

Annual Revenue: \${{annual_revenue}}
SDE (Seller's Discretionary Earnings): \${{sde}}
EBITDA: \${{ebitda}}
Inventory Value: \${{inventory_value}}
FF&E Value: \${{ffe_value}}
Real Estate Included in Sale: {{real_estate}}
Monthly Lease: \${{lease_monthly}}
Lease Expiration: {{lease_expiration}}

SECTION 4 — OPERATIONS & TRANSITION

Reason for Sale: {{reason_for_sale}}
Growth Opportunities: {{growth_opportunities}}
Competitive Advantages: {{competitive_advantages}}
Seller Financing Available: {{seller_financing}}

CERTIFICATION

Seller certifies that the information provided herein is true and correct to the best of Seller's knowledge. Seller acknowledges that Broker will rely on this information in marketing the Business and that Seller shall promptly notify Broker of any material change. Seller understands that providing false or misleading information may result in termination of the engagement and potential legal liability.

SELLER'S SIGNATURE:
Signature: ______________________________
Printed Name: {{seller_name}}
Date: {{interview_date}}

BROKER ({{agency_name}}):
Signature: ______________________________
Printed Name: {{broker_name}}
Date: ___________________________________{{LEGAL_FOOTER}}`,
  },
  {
    name: 'Financial Authorization',
    description: 'Seller authorizes the brokerage to verify business financials directly with the accountant/CPA — P&Ls, tax returns, and bank statements.',
    category: 'Seller Pack',
    fields: [
      { key: 'seller_name', label: 'Seller Name', type: 'text', required: true },
      { key: 'business_name', label: 'Business Name', type: 'text', required: true },
      { key: 'cpa_name', label: 'Accountant / CPA Name', type: 'text', required: true },
      { key: 'cpa_firm', label: 'Accountant Firm', type: 'text', required: false },
      { key: 'cpa_email', label: 'Accountant Email', type: 'text', required: false },
      { key: 'cpa_phone', label: 'Accountant Phone', type: 'text', required: false },
      { key: 'effective_date', label: 'Effective Date', type: 'date', required: true },
      { key: 'agency_name', label: 'Brokerage Name', type: 'text', required: true },
      { key: 'broker_name', label: 'Broker Name', type: 'text', required: true },
    ],
    parties: [
      { key: 'agent', label: 'Broker', role: 'agent' },
      { key: 'seller', label: 'Seller', role: 'seller' },
    ],
    body_template: `{{title}}

FINANCIAL INFORMATION AUTHORIZATION

I, {{seller_name}}, as the owner of {{business_name}} (the "Business"), hereby authorize {{broker_name}} of {{agency_name}} ("Broker") to contact and obtain financial records directly from my accountant {{cpa_name}} ({{cpa_firm}}) for the purpose of preparing a normalized financial statement, valuation, and marketing materials for the sale of the Business.

AUTHORIZED RECORDS. Authorized records include, but are not limited to: profit and loss statements, income tax returns (federal and state), bank statements, balance sheets, and supporting schedules for the most recent three (3) fiscal years and the current year-to-date period.

ACCOUNTANT CONTACT: {{cpa_email}} · {{cpa_phone}}

This authorization is given freely and voluntarily. Broker may rely on this authorization until the engagement concludes or this authorization is revoked in writing. I acknowledge that the information obtained will be held in confidence and used solely in connection with the sale of the Business.

SELLER'S SIGNATURE:
Signature: ______________________________
Printed Name: {{seller_name}}
Date: {{effective_date}}

BROKER ({{agency_name}}):
Signature: ______________________________
Printed Name: {{broker_name}}
Date: ___________________________________{{LEGAL_FOOTER}}`,
  },
  {
    name: 'Proof of Funds',
    description: 'Buyer documents liquid assets available for the acquisition — the qualification gate that separates serious buyers from tire-kickers.',
    category: 'Buyer Pack',
    fields: [
      { key: 'buyer_name', label: 'Buyer Name', type: 'text', required: true },
      { key: 'buyer_email', label: 'Buyer Email', type: 'text', required: true },
      { key: 'bank_name', label: 'Financial Institution', type: 'text', required: true },
      { key: 'account_type', label: 'Account Type', type: 'select', required: true, options: ['Checking', 'Savings', 'Money Market', 'Investment / Brokerage', 'Retirement (non-pledged)', 'Other'] },
      { key: 'liquid_assets', label: 'Liquid Assets Available ($)', type: 'number', required: true, placeholder: 'e.g. 250000' },
      { key: 'pof_date', label: 'Date', type: 'date', required: true },
      { key: 'agency_name', label: 'Brokerage Name', type: 'text', required: true },
      { key: 'broker_name', label: 'Broker Name', type: 'text', required: true },
    ],
    parties: [
      { key: 'agent', label: 'Broker', role: 'agent' },
      { key: 'buyer', label: 'Buyer', role: 'buyer' },
    ],
    body_template: `{{title}}

PROOF OF FUNDS

I, {{buyer_name}} ({{buyer_email}}), hereby confirm and represent that I have liquid assets of approximately \${{liquid_assets}} available for the acquisition of a business, held at {{bank_name}} ({{account_type}}).

I understand that the broker may request a bank statement or a letter from the financial institution to verify these funds before full financials are shared. I further understand that this representation is made in good faith for the purpose of qualifying my interest and may be relied upon by the Seller and the Broker.

BUYER'S SIGNATURE:
Signature: ______________________________
Printed Name: {{buyer_name}}
Date: {{pof_date}}

BROKER ({{agency_name}}):
Signature: ______________________________
Printed Name: {{broker_name}}
Date: ___________________________________{{LEGAL_FOOTER}}`,
  },
  {
    name: 'Letter of Intent (LOI)',
    description: 'Non-binding offer to purchase — price, structure, due diligence, financing contingency, and timeline. The professional opener to every deal.',
    category: 'Buyer Pack',
    fields: [
      { key: 'buyer_name', label: 'Buyer Name', type: 'text', required: true },
      { key: 'buyer_entity', label: 'Buyer Entity (if any)', type: 'text', required: false },
      { key: 'seller_name', label: 'Seller Name', type: 'text', required: true },
      { key: 'business_name', label: 'Business Name', type: 'text', required: true },
      { key: 'purchase_price', label: 'Purchase Price ($)', type: 'number', required: true },
      { key: 'structure', label: 'Transaction Structure', type: 'select', required: true, options: ['Asset Purchase', 'Stock / Membership Purchase', 'To Be Determined'] },
      { key: 'earnest_money', label: 'Earnest Money Deposit ($)', type: 'number', required: false },
      { key: 'due_diligence_days', label: 'Due Diligence Period (days)', type: 'number', required: true },
      { key: 'closing_date', label: 'Target Closing Date', type: 'date', required: false },
      { key: 'financing_contingency', label: 'Financing Contingency', type: 'select', required: false, options: ['Yes — SBA / Bank Financing', 'Yes — Seller Financing', 'No — Cash / Verified Funds'] },
      { key: 'loi_date', label: 'Date of LOI', type: 'date', required: true },
      { key: 'agency_name', label: 'Brokerage Name', type: 'text', required: true },
      { key: 'broker_name', label: 'Broker Name', type: 'text', required: true },
    ],
    parties: [
      { key: 'agent', label: 'Broker', role: 'agent' },
      { key: 'buyer', label: 'Buyer', role: 'buyer' },
      { key: 'seller', label: 'Seller', role: 'seller' },
    ],
    body_template: `{{title}}

LETTER OF INTENT

Date: {{loi_date}}

To: {{seller_name}}, Seller of {{business_name}}
From: {{buyer_name}} {{buyer_entity}}

This Letter of Intent (this "LOI") sets forth the principal terms and conditions under which {{buyer_name}} ("Buyer") proposes to acquire the business known as {{business_name}} (the "Business") from {{seller_name}} ("Seller").

IMPORTANT NOTICE: THIS LOI IS NON-BINDING, except for the provisions set forth in Sections titled "Exclusivity" and "Confidentiality" below. No binding obligation with respect to the transaction shall arise until a definitive Asset Purchase Agreement or Stock Purchase Agreement (the "Purchase Agreement") has been executed by all parties.

1. PURCHASE PRICE. Buyer proposes to acquire the Business for a total purchase price of \${{purchase_price}}, subject to adjustment as set forth in the Purchase Agreement.

2. STRUCTURE. The transaction is proposed as a(n) {{structure}} transaction.

3. EARNEST MONEY. {{earnest_money}}

4. DUE DILIGENCE. Buyer shall have a period of {{due_diligence_days}} days from the date of execution of the Purchase Agreement to conduct due diligence, including review of financial statements, tax returns, contracts, leases, and operations.

5. FINANCING. {{financing_contingency}}

6. CLOSING. {{closing_date}}

7. EXCLUSIVITY (BINDING). In consideration of Seller providing due diligence access, Seller agrees that during the term of this LOI and for a period of thirty (30) days following its expiration or termination, Seller shall not solicit, negotiate, or accept any other offer for the Business. This exclusivity provision is a binding obligation.

8. CONFIDENTIALITY (BINDING). The terms of this LOI and all information disclosed in connection with the proposed transaction shall be held in strict confidence by both parties. This provision is a binding obligation.

9. GOVERNING LAW. This LOI shall be governed by the laws of the state in which the Business is located.

10. EXPENSES. Each party shall bear its own legal, accounting, and other expenses incurred in connection with this LOI and the proposed transaction.

Accepted and agreed:

BUYER:
Signature: ______________________________
Printed Name: {{buyer_name}}
Date: {{loi_date}}

SELLER:
Signature: ______________________________
Printed Name: {{seller_name}}
Date: ___________________________________

Broker: {{broker_name}} ({{agency_name}}) — this LOI has been facilitated through Broker as the procuring cause.{{LEGAL_FOOTER}}`,
  },
  {
    name: 'Marketing Agreement',
    description: 'The engagement agreement used to list and market the business — deal terms at a glance plus the legal terms, modeled on the broker\'s standard form.',
    category: 'Seller Pack',
    fields: [
      { key: 'business_name', label: 'Business Name', type: 'text', required: true },
      { key: 'legal_entity', label: 'Legal Entity Name', type: 'text', required: false },
      { key: 'business_address', label: 'Business Address', type: 'text', required: false },
      { key: 'city', label: 'City', type: 'text', required: false },
      { key: 'state', label: 'State', type: 'text', required: false },
      { key: 'zip', label: 'ZIP', type: 'text', required: false },
      { key: 'owner_names', label: 'Owner(s) / Principal(s)', type: 'text', required: true },
      { key: 'asking_price', label: 'Asking Price ($)', type: 'number', required: true },
      { key: 'annual_sales', label: 'Annual Sales ($)', type: 'number', required: false },
      { key: 'sde', label: 'SDE / Owner Benefit ($)', type: 'number', required: false },
      { key: 'ebitda', label: 'EBITDA ($)', type: 'number', required: false },
      { key: 'inventory_value', label: 'Inventory Included ($)', type: 'number', required: false },
      { key: 'ffe_value', label: 'FF&E Included ($)', type: 'number', required: false },
      { key: 'real_estate', label: 'Real Estate Included', type: 'select', required: false, options: ['Yes', 'No', 'Not Applicable'] },
      { key: 'commission_rate', label: 'Commission Rate (%)', type: 'number', required: true, default: 10 },
      { key: 'minimum_commission', label: 'Minimum Commission ($)', type: 'number', required: false, default: 10000 },
      { key: 'term_months', label: 'Listing Term (months)', type: 'number', required: false, default: 6 },
      { key: 'tail_period', label: 'Tail / Protection (months)', type: 'number', required: false, default: 12 },
      { key: 'non_compete_radius', label: 'Non-Compete Radius (miles)', type: 'number', required: false, default: 30 },
      { key: 'training_weeks', label: 'Training Period (weeks)', type: 'number', required: false, default: 2 },
      { key: 'agreement_date', label: 'Date', type: 'date', required: true },
      { key: 'agency_name', label: 'Brokerage Name', type: 'text', required: true },
      { key: 'broker_name', label: 'Broker Name', type: 'text', required: true },
    ],
    parties: [
      { key: 'agent', label: 'Broker', role: 'agent' },
      { key: 'seller', label: 'Seller', role: 'seller' },
    ],
    body_template: `{{title}}

MARKETING AGREEMENT

This Marketing Agreement (this "Agreement") is entered into on {{agreement_date}} (the "Effective Date"), by and between {{owner_names}} ("Seller"), owner of {{business_name}} ({{legal_entity}}) located at {{business_address}}, {{city}}, {{state}} {{zip}} (the "Business"), and {{broker_name}} of {{agency_name}} ("Broker").

DEAL TERMS AT A GLANCE

Asking Price: \${{asking_price}}
Annual Sales: \${{annual_sales}}
SDE / Owner Benefit: \${{sde}}
EBITDA: \${{ebitda}}
Inventory Included: \${{inventory_value}}
FF&E Included: \${{ffe_value}}
Real Estate Included: {{real_estate}}

TERMS OF ENGAGEMENT

1. EXCLUSIVE RIGHT TO MARKET. Seller grants Broker the exclusive right to market, advertise, and solicit purchasers for the Business during the Term, and to negotiate on Seller's behalf.

2. COMMISSION. In consideration of Broker's services, Seller agrees to pay Broker a commission of {{commission_rate}}% of the final purchase price, payable at closing, and in no event less than \${{minimum_commission}}. The Commission is earned if the Business is sold, transferred, or otherwise disposed of during the Term or within {{tail_period}} months thereafter (the "Tail Period") to any purchaser introduced by Broker.

3. LISTING TERM. This Agreement shall remain in effect for {{term_months}} months from the Effective Date (the "Term").

4. NON-CIRCUMVENTION. Seller shall route all inquiries through Broker and shall not circumvent Broker by dealing directly with any purchaser introduced by Broker.

5. SELLER REPRESENTATIONS. Seller represents that all information provided is true and correct, that Seller has full authority to sell the Business, and that Seller will promptly notify Broker of any material change. Seller agrees to provide financial statements, tax returns, and other documentation reasonably requested for due diligence.

6. COOPERATION. Seller agrees to make the Business available for inspection by qualified purchasers and to cooperate with Broker's marketing efforts, including providing a training period of {{training_weeks}} weeks to the purchaser after closing.

7. NON-COMPETE. Seller agrees not to compete with the Business within a radius of {{non_compete_radius}} miles for a reasonable period after closing, as further set forth in the purchase agreement.

8. INDEMNIFICATION. Seller indemnifies Broker against claims arising from Seller's misrepresentations or breach of this Agreement, except to the extent caused by Broker's gross negligence or willful misconduct.

9. GOVERNING LAW. This Agreement is governed by the laws of the state in which the Business is located.

IN WITNESS WHEREOF, the parties have executed this Agreement as of the Effective Date.

SELLER:
Signature: ______________________________
Printed Name: {{owner_names}}
Date: {{agreement_date}}

BROKER ({{agency_name}}):
Signature: ______________________________
Printed Name: {{broker_name}}
Date: ___________________________________{{LEGAL_FOOTER}}`,
  },
  {
    name: 'Mutual NDA & Co-Brokerage Agreement',
    description: 'Mutual confidentiality + co-brokerage terms for sharing a deal with another brokerage — fee split, non-circumvention, and cooperation.',
    category: 'Co-Broker Pack',
    fields: [
      { key: 'primary_broker', label: 'Primary Broker Name', type: 'text', required: true },
      { key: 'primary_firm', label: 'Primary Brokerage', type: 'text', required: true },
      { key: 'co_broker', label: 'Co-Broker Name', type: 'text', required: true },
      { key: 'co_firm', label: 'Co-Brokerage Firm', type: 'text', required: true },
      { key: 'business_name', label: 'Business Name', type: 'text', required: true },
      { key: 'seller_name', label: 'Seller Name', type: 'text', required: true },
      { key: 'fee_split', label: 'Commission Split', type: 'select', required: true, options: ['50 / 50', '60 / 40 (Primary 60)', '70 / 30 (Primary 70)', 'Other'] },
      { key: 'split_other', label: 'Split Detail (if Other)', type: 'text', required: false },
      { key: 'coop_date', label: 'Date', type: 'date', required: true },
    ],
    parties: [
      { key: 'agent', label: 'Broker', role: 'agent' },
      { key: 'seller', label: 'Seller', role: 'seller' },
    ],
    body_template: `{{title}}

MUTUAL NON-DISCLOSURE & CO-BROKERAGE AGREEMENT

This Mutual Non-Disclosure & Co-Brokerage Agreement (this "Agreement") is entered into on {{coop_date}}, by and between {{primary_broker}} of {{primary_firm}} ("Primary Broker") and {{co_broker}} of {{co_firm}} ("Co-Broker"), regarding the sale of {{business_name}} (the "Business") owned by {{seller_name}} ("Seller").

1. CONFIDENTIALITY. Each party agrees to hold all non-public information concerning the Business and the other party's clients in strict confidence, and to use such information solely for the purpose of completing a sale of the Business. Neither party shall disclose such information to any third party without the other party's prior written consent.

2. CO-BROKERAGE. The parties agree to cooperate in the marketing and sale of the Business. Co-Broker shall introduce qualified purchasers to Primary Broker, and all communications with Seller shall be coordinated through Primary Broker unless otherwise agreed.

3. COMMISSION SPLIT. Any commission earned from the sale of the Business shall be split between the parties as follows: {{fee_split}}. Each party is responsible for its own expenses.

4. NON-CIRCUMVENTION. Neither party shall circumvent the other by dealing directly with the other party's clients or purchasers introduced through this cooperation. This obligation survives the termination of this Agreement for a period of twelve (12) months.

5. INDEPENDENT CONTRACTORS. Each party is an independent contractor. Nothing herein creates a partnership, joint venture, or agency relationship between the parties.

6. GOVERNING LAW. This Agreement shall be governed by the laws of the state in which the Business is located.

IN WITNESS WHEREOF, the parties have executed this Agreement as of the date above.

PRIMARY BROKER:
Signature: ______________________________
Printed Name: {{primary_broker}}
Firm: {{primary_firm}}
Date: {{coop_date}}

CO-BROKER:
Signature: ______________________________
Printed Name: {{co_broker}}
Firm: {{co_firm}}
Date: ___________________________________{{LEGAL_FOOTER}}`,
  },
  {
    name: 'Referral Fee Agreement',
    description: 'Pays a referral partner a flat fee or percentage when a referred client closes — without the partner touching the deal.',
    category: 'Co-Broker Pack',
    fields: [
      { key: 'referring_broker', label: 'Referring Broker', type: 'text', required: true },
      { key: 'referring_firm', label: 'Referring Firm', type: 'text', required: true },
      { key: 'receiving_broker', label: 'Receiving Broker', type: 'text', required: true },
      { key: 'receiving_firm', label: 'Receiving Firm', type: 'text', required: true },
      { key: 'business_name', label: 'Business Name', type: 'text', required: true },
      { key: 'fee_type', label: 'Fee Type', type: 'select', required: true, options: ['Percentage of Commission', 'Flat Fee', 'Other'] },
      { key: 'fee_amount', label: 'Fee Amount (% or $)', type: 'text', required: true, placeholder: 'e.g. 25% or $5,000' },
      { key: 'referral_date', label: 'Date', type: 'date', required: true },
    ],
    parties: [
      { key: 'agent', label: 'Broker', role: 'agent' },
      { key: 'seller', label: 'Seller', role: 'seller' },
    ],
    body_template: `{{title}}

REFERRAL FEE AGREEMENT

This Referral Fee Agreement (this "Agreement") is entered into on {{referral_date}}, by and between {{referring_broker}} of {{referring_firm}} ("Referring Broker") and {{receiving_broker}} of {{receiving_firm}} ("Receiving Broker"), regarding the referral of a client interested in {{business_name}} (the "Transaction").

1. REFERRAL. Referring Broker has introduced or will introduce a client to Receiving Broker in connection with the Transaction. Receiving Broker accepts the referral and agrees to work directly with the referred client.

2. REFERRAL FEE. In consideration of the referral, Receiving Broker agrees to pay Referring Broker a referral fee of {{fee_amount}} of any commission actually received by Receiving Broker from the Transaction, payable within fourteen (14) days after Receiving Broker receives such commission.

3. NO CLIENT CONTACT. Referring Broker shall not contact the referred client or the Seller regarding the Transaction, and shall refer all inquiries to Receiving Broker. Receiving Broker is solely responsible for the client relationship and the sale.

4. INDEPENDENT CONTRACTORS. Each party is an independent contractor. Nothing herein creates a partnership, joint venture, or employment relationship.

5. GOVERNING LAW. This Agreement shall be governed by the laws of the state in which the Business is located.

IN WITNESS WHEREOF, the parties have executed this Agreement as of the date above.

REFERRING BROKER:
Signature: ______________________________
Printed Name: {{referring_broker}}
Firm: {{referring_firm}}
Date: {{referral_date}}

RECEIVING BROKER:
Signature: ______________________________
Printed Name: {{receiving_broker}}
Firm: {{receiving_firm}}
Date: ___________________________________{{LEGAL_FOOTER}}`,
  },
  {
    name: 'Bill of Sale & Assignment',
    description: 'Transfers the business\'s assets at closing — equipment, inventory, goodwill, and contracts — with warranties and assignment of leases.',
    category: 'Deal Structure',
    fields: [
      { key: 'seller_name', label: 'Seller Name', type: 'text', required: true },
      { key: 'buyer_name', label: 'Buyer Name', type: 'text', required: true },
      { key: 'business_name', label: 'Business Name', type: 'text', required: true },
      { key: 'sale_date', label: 'Closing / Effective Date', type: 'date', required: true },
      { key: 'purchase_price', label: 'Total Purchase Price ($)', type: 'number', required: true },
      { key: 'assets_description', label: 'Assets Sold (description)', type: 'text', required: true, placeholder: 'e.g. All FF&E, inventory, goodwill, and contracts' },
      { key: 'excluded_assets', label: 'Excluded Assets', type: 'text', required: false },
      { key: 'liabilities', label: 'Liabilities Assumed by Buyer', type: 'text', required: false },
    ],
    parties: [
      { key: 'agent', label: 'Broker', role: 'agent' },
      { key: 'seller', label: 'Seller', role: 'seller' },
      { key: 'buyer', label: 'Buyer', role: 'buyer' },
    ],
    body_template: `{{title}}

BILL OF SALE & ASSIGNMENT

This Bill of Sale & Assignment (this "Bill of Sale") is entered into on {{sale_date}}, by and between {{seller_name}} ("Seller") and {{buyer_name}} ("Buyer"), for the transfer of the assets of {{business_name}} (the "Business").

1. ASSETS SOLD. Seller sells, assigns, and transfers to Buyer all right, title, and interest in the following assets: {{assets_description}}. {{excluded_assets}}

2. PURCHASE PRICE. The total purchase price for the assets is \${{purchase_price}}, paid in accordance with the Purchase Agreement. {{liabilities}}

3. TITLE & WARRANTY. Seller warrants that Seller owns the assets free and clear of all liens and encumbrances, and that Seller has the full right and authority to sell the assets.

4. ASSIGNMENT OF CONTRACTS. Seller assigns to Buyer all assignable contracts, leases, and agreements associated with the assets, subject to any required third-party consents.

5. GOODWILL. Seller transfers to Buyer all goodwill associated with the Business and the right to use the Business name.

6. GOVERNING LAW. This Bill of Sale shall be governed by the laws of the state in which the Business is located.

IN WITNESS WHEREOF, the parties have executed this Bill of Sale as of the date above.

SELLER:
Signature: ______________________________
Printed Name: {{seller_name}}
Date: {{sale_date}}

BUYER:
Signature: ______________________________
Printed Name: {{buyer_name}}
Date: {{sale_date}}

WITNESSED BY (Broker):
Signature: ______________________________
Printed Name: __________________________
Firm: ___________________________________{{LEGAL_FOOTER}}`,
  },
  {
    name: 'Promissory Note & Security Agreement',
    description: 'Seller-financing note — principal, interest, payment schedule, and security interest in the sold assets.',
    category: 'Deal Structure',
    fields: [
      { key: 'lender_name', label: 'Lender (Seller) Name', type: 'text', required: true },
      { key: 'borrower_name', label: 'Borrower (Buyer) Name', type: 'text', required: true },
      { key: 'business_name', label: 'Business Name', type: 'text', required: true },
      { key: 'principal_amount', label: 'Principal Amount ($)', type: 'number', required: true },
      { key: 'interest_rate', label: 'Interest Rate (%)', type: 'number', required: true, default: 8 },
      { key: 'term_months', label: 'Term (months)', type: 'number', required: true, default: 60 },
      { key: 'monthly_payment', label: 'Monthly Payment ($)', type: 'number', required: true },
      { key: 'note_date', label: 'Date', type: 'date', required: true },
      { key: 'maturity_date', label: 'Maturity Date', type: 'date', required: false },
      { key: 'collateral', label: 'Collateral (assets secured)', type: 'text', required: false },
    ],
    parties: [
      { key: 'agent', label: 'Broker', role: 'agent' },
      { key: 'seller', label: 'Lender (Seller)', role: 'seller' },
      { key: 'buyer', label: 'Borrower (Buyer)', role: 'buyer' },
    ],
    body_template: `{{title}}

PROMISSORY NOTE & SECURITY AGREEMENT

FOR VALUE RECEIVED, {{borrower_name}} ("Borrower") promises to pay to the order of {{lender_name}} ("Lender") the principal sum of \${{principal_amount}}, together with interest on the unpaid principal balance at the rate of {{interest_rate}}% per annum, in connection with Borrower's purchase of {{business_name}} (the "Business").

1. PAYMENTS. Borrower shall pay Lender monthly payments of \${{monthly_payment}}, commencing one (1) month after the date of this Note, until the principal and accrued interest are paid in full. {{maturity_date}}

2. PREPAYMENT. Borrower may prepay all or part of the outstanding balance at any time without penalty.

3. DEFAULT. The following events constitute default: (a) failure to make any payment when due; (b) Borrower's bankruptcy or insolvency; or (c) any material misrepresentation by Borrower. Upon default, the entire unpaid balance shall become immediately due and payable.

4. SECURITY INTEREST. As security for this Note, Borrower grants Lender a security interest in the assets of the Business, specifically: {{collateral}}. Lender may perfect this security interest by filing a UCC-1 financing statement.

5. LATE PAYMENTS. Any payment more than ten (10) days late shall incur a late fee of five percent (5%) of the payment amount.

6. GOVERNING LAW. This Note shall be governed by the laws of the state in which the Business is located.

IN WITNESS WHEREOF, Borrower has executed this Note as of {{note_date}}.

BORROWER ({{borrower_name}}):
Signature: ______________________________
Printed Name: {{borrower_name}}
Date: {{note_date}}

LENDER ({{lender_name}}):
Signature: ______________________________
Printed Name: {{lender_name}}
Date: {{note_date}}

WITNESSED BY (Broker):
Signature: ______________________________
Printed Name: __________________________
Firm: ___________________________________{{LEGAL_FOOTER}}`,
  },
  {
    name: 'Lease Assignment & Landlord Consent',
    description: 'Assigns the business lease to the buyer at closing, with landlord consent and guaranty terms.',
    category: 'Deal Structure',
    fields: [
      { key: 'landlord_name', label: 'Landlord Name', type: 'text', required: true },
      { key: 'seller_name', label: 'Tenant / Seller Name', type: 'text', required: true },
      { key: 'buyer_name', label: 'Buyer / Assignee Name', type: 'text', required: true },
      { key: 'business_name', label: 'Business Name', type: 'text', required: true },
      { key: 'premises_address', label: 'Premises Address', type: 'text', required: true },
      { key: 'lease_date', label: 'Original Lease Date', type: 'date', required: false },
      { key: 'assignment_date', label: 'Assignment / Closing Date', type: 'date', required: true },
      { key: 'lease_expiration', label: 'Lease Expiration', type: 'text', required: false },
    ],
    parties: [
      { key: 'agent', label: 'Broker', role: 'agent' },
      { key: 'seller', label: 'Tenant / Seller', role: 'seller' },
      { key: 'buyer', label: 'Buyer', role: 'buyer' },
    ],
    body_template: `{{title}}

LEASE ASSIGNMENT & LANDLORD CONSENT

This Lease Assignment & Landlord Consent (this "Assignment") is entered into on {{assignment_date}}, by and among {{landlord_name}} ("Landlord"), {{seller_name}} ("Tenant"), and {{buyer_name}} ("Assignee"), regarding the lease for the premises located at {{premises_address}} (the "Premises"), occupied by {{business_name}} (the "Business").

1. ASSIGNMENT. Tenant hereby assigns to Assignee all of Tenant's right, title, and interest in and to the lease for the Premises (the "Lease"), effective as of {{assignment_date}}.

2. ASSUMPTION. Assignee assumes and agrees to perform all of Tenant's obligations under the Lease from the effective date forward, including payment of rent and compliance with all terms.

3. LANDLORD CONSENT. Landlord consents to the assignment of the Lease to Assignee, subject to Assignee's assumption of obligations. {{lease_expiration}}

4. RELEASE. Upon Assignee's assumption of the Lease, Tenant shall be released from obligations accruing after the effective date, provided no default then exists.

5. GOVERNING LAW. This Assignment shall be governed by the laws of the state in which the Premises are located.

IN WITNESS WHEREOF, the parties have executed this Assignment as of the date above.

LANDLORD:
Signature: ______________________________
Printed Name: {{landlord_name}}
Date: {{assignment_date}}

TENANT ({{seller_name}}):
Signature: ______________________________
Printed Name: {{seller_name}}
Date: {{assignment_date}}

ASSIGNEE ({{buyer_name}}):
Signature: ______________________________
Printed Name: {{buyer_name}}
Date: {{assignment_date}}

WITNESSED BY (Broker):
Signature: ______________________________
Printed Name: __________________________
Firm: ___________________________________{{LEGAL_FOOTER}}`,
  },
  {
    name: 'Earnest Money Receipt & Escrow Instructions',
    description: 'Receipt and handling instructions for the buyer\'s earnest money deposit — holder, release conditions, and refund terms.',
    category: 'Deal Structure',
    fields: [
      { key: 'buyer_name', label: 'Buyer Name', type: 'text', required: true },
      { key: 'seller_name', label: 'Seller Name', type: 'text', required: true },
      { key: 'business_name', label: 'Business Name', type: 'text', required: true },
      { key: 'deposit_amount', label: 'Deposit Amount ($)', type: 'number', required: true },
      { key: 'deposit_method', label: 'Deposit Method', type: 'select', required: true, options: ['Wire Transfer', 'Bank Check', 'Personal Check', 'ACH', 'Other'] },
      { key: 'escrow_holder', label: 'Escrow / Deposit Holder', type: 'text', required: true },
      { key: 'deposit_date', label: 'Deposit Date', type: 'date', required: true },
      { key: 'release_condition', label: 'Release Condition', type: 'select', required: false, options: ['Upon execution of Purchase Agreement', 'Upon successful closing', 'Upon removal of due-diligence contingency', 'Other'] },
    ],
    parties: [
      { key: 'agent', label: 'Broker', role: 'agent' },
      { key: 'seller', label: 'Seller', role: 'seller' },
      { key: 'buyer', label: 'Buyer', role: 'buyer' },
    ],
    body_template: `{{title}}

EARNEST MONEY RECEIPT & ESCROW INSTRUCTIONS

This Earnest Money Receipt & Escrow Instructions (this "Receipt") is entered into on {{deposit_date}}, by and between {{buyer_name}} ("Buyer") and {{seller_name}} ("Seller"), regarding the purchase of {{business_name}} (the "Business").

1. RECEIPT OF DEPOSIT. Buyer has deposited the sum of \${{deposit_amount}} via {{deposit_method}} (the "Deposit") with {{escrow_holder}} (the "Holder"), to be held in escrow in accordance with this Receipt.

2. HOLDING. The Holder shall hold the Deposit in a segregated account and shall not release or invest the Deposit except as set forth herein.

3. RELEASE. The Deposit shall be released: (a) to Seller upon {{release_condition}}; or (b) to Buyer upon termination of the transaction for any reason other than Buyer's default.

4. DEFAULT. If Buyer defaults under the Purchase Agreement, Seller may claim the Deposit as liquidated damages, subject to applicable law. If Seller defaults, the Deposit shall be returned to Buyer in full.

5. DISPUTES. If the parties dispute the disposition of the Deposit, the Holder may retain the Deposit until the dispute is resolved by agreement or a court of competent jurisdiction.

6. GOVERNING LAW. This Receipt shall be governed by the laws of the state in which the Business is located.

IN WITNESS WHEREOF, the parties have executed this Receipt as of the date above.

BUYER:
Signature: ______________________________
Printed Name: {{buyer_name}}
Date: {{deposit_date}}

SELLER:
Signature: ______________________________
Printed Name: {{seller_name}}
Date: {{deposit_date}}

HOLDER ({{escrow_holder}}):
Signature: ______________________________
Printed Name: __________________________
Date: {{deposit_date}}

WITNESSED BY (Broker):
Signature: ______________________________
Printed Name: __________________________
Firm: ___________________________________{{LEGAL_FOOTER}}`,
  },
  {
    name: 'Mutual Termination & Release of Listing Agreement',
    description: 'Clean exit when a listing ends — mutual release, confidentiality survival, and commission protection.',
    category: 'Seller Pack',
    fields: [
      { key: 'business_name', label: 'Business Name', type: 'text', required: true },
      { key: 'seller_name', label: 'Seller Name', type: 'text', required: true },
      { key: 'listing_date', label: 'Original Listing Date', type: 'date', required: true },
      { key: 'termination_date', label: 'Termination Date', type: 'date', required: true },
      { key: 'reason', label: 'Reason for Termination', type: 'text', required: true },
      { key: 'agency_name', label: 'Brokerage Name', type: 'text', required: true },
      { key: 'broker_name', label: 'Broker Name', type: 'text', required: true },
    ],
    parties: [
      { key: 'agent', label: 'Broker', role: 'agent' },
      { key: 'seller', label: 'Seller', role: 'seller' },
    ],
    body_template: `{{title}}

MUTUAL TERMINATION & RELEASE OF LISTING AGREEMENT

This Mutual Termination & Release (this "Termination") is entered into on {{termination_date}}, by and between {{seller_name}} ("Seller") and {{broker_name}} of {{agency_name}} ("Broker"), regarding the Exclusive Listing Agreement dated {{listing_date}} for the business known as {{business_name}} (the "Listing Agreement").

1. TERMINATION. The Parties mutually agree to terminate the Listing Agreement effective {{termination_date}}. Reason: {{reason}}

2. MUTUAL RELEASE. Each Party releases the other from all claims, demands, and liabilities arising out of the Listing Agreement, except as set forth herein.

3. COMMISSION PROTECTION. The Parties agree that Broker shall remain entitled to a commission if the Business is sold within six (6) months after the termination date to any purchaser who was introduced by Broker prior to termination and with whom substantive negotiations occurred.

4. CONFIDENTIALITY. The confidentiality obligations of the Listing Agreement shall survive this Termination and remain in full force.

5. RETURN OF MATERIALS. Each Party shall return or destroy all confidential materials received from the other Party.

6. GOVERNING LAW. This Termination shall be governed by the laws of the state in which the Business is located.

IN WITNESS WHEREOF, the Parties have executed this Termination as of the date above.

SELLER:
Signature: ______________________________
Printed Name: {{seller_name}}
Date: {{termination_date}}

BROKER ({{agency_name}}):
Signature: ______________________________
Printed Name: {{broker_name}}
Date: ___________________________________{{LEGAL_FOOTER}}`,
  },
  {
    name: 'Listing Amendment / Price Reduction',
    description: 'Formal amendment to change listing terms mid-engagement — price, commission, term, or other provisions.',
    category: 'Seller Pack',
    fields: [
      { key: 'business_name', label: 'Business Name', type: 'text', required: true },
      { key: 'seller_name', label: 'Seller Name', type: 'text', required: true },
      { key: 'listing_date', label: 'Original Listing Date', type: 'date', required: true },
      { key: 'amendment_date', label: 'Amendment Date', type: 'date', required: true },
      { key: 'amended_field', label: 'Provision Amended', type: 'select', required: true, options: ['Asking Price', 'Commission Rate', 'Listing Term', 'Tail Period', 'Other'] },
      { key: 'previous_value', label: 'Previous Value', type: 'text', required: true },
      { key: 'new_value', label: 'New Value', type: 'text', required: true },
      { key: 'agency_name', label: 'Brokerage Name', type: 'text', required: true },
      { key: 'broker_name', label: 'Broker Name', type: 'text', required: true },
    ],
    parties: [
      { key: 'agent', label: 'Broker', role: 'agent' },
      { key: 'seller', label: 'Seller', role: 'seller' },
    ],
    body_template: `{{title}}

AMENDMENT TO EXCLUSIVE LISTING AGREEMENT

This Amendment (this "Amendment") is entered into on {{amendment_date}}, by and between {{seller_name}} ("Seller") and {{broker_name}} of {{agency_name}} ("Broker"), amending the Exclusive Listing Agreement dated {{listing_date}} for {{business_name}} (the "Listing Agreement").

1. AMENDMENT. The following provision of the Listing Agreement is hereby amended:

   Provision: {{amended_field}}
   Previous Value: {{previous_value}}
   New Value: {{new_value}}

2. EFFECT. This Amendment shall be effective as of {{amendment_date}}. All other terms and conditions of the Listing Agreement remain in full force and effect.

3. ENTIRE AGREEMENT. The Listing Agreement, as amended by this Amendment, constitutes the entire agreement of the Parties.

4. GOVERNING LAW. This Amendment shall be governed by the laws of the state in which the Business is located.

IN WITNESS WHEREOF, the Parties have executed this Amendment as of the date above.

SELLER:
Signature: ______________________________
Printed Name: {{seller_name}}
Date: {{amendment_date}}

BROKER ({{agency_name}}):
Signature: ______________________________
Printed Name: {{broker_name}}
Date: ___________________________________{{LEGAL_FOOTER}}`,
  },
  {
    name: 'Seller Business Disclosure Statement',
    description: 'Seller attests to the true condition of the business — pending litigation, tax liens, environmental issues, and liabilities.',
    category: 'Seller Pack',
    fields: [
      { key: 'seller_name', label: 'Seller Name', type: 'text', required: true },
      { key: 'business_name', label: 'Business Name', type: 'text', required: true },
      { key: 'litigation', label: 'Pending / Threatened Litigation', type: 'select', required: true, options: ['None', 'Pending', 'Threatened'] },
      { key: 'litigation_details', label: 'Litigation Details', type: 'text', required: false },
      { key: 'tax_liens', label: 'Tax Liens', type: 'select', required: true, options: ['None', 'Yes'] },
      { key: 'tax_lien_details', label: 'Tax Lien Details', type: 'text', required: false },
      { key: 'environmental', label: 'Environmental Issues', type: 'select', required: true, options: ['None', 'Yes'] },
      { key: 'environmental_details', label: 'Environmental Details', type: 'text', required: false },
      { key: 'undisclosed_liabilities', label: 'Undisclosed Liabilities / Judgments', type: 'select', required: true, options: ['None', 'Yes'] },
      { key: 'liability_details', label: 'Liability Details', type: 'text', required: false },
      { key: 'disclosure_date', label: 'Date', type: 'date', required: true },
    ],
    parties: [
      { key: 'agent', label: 'Broker', role: 'agent' },
      { key: 'seller', label: 'Seller', role: 'seller' },
    ],
    body_template: `{{title}}

SELLER BUSINESS DISCLOSURE STATEMENT

This Seller Business Disclosure Statement (this "Disclosure") is made on {{disclosure_date}} by {{seller_name}} ("Seller"), regarding the business known as {{business_name}} (the "Business"), for the purpose of informing prospective purchasers and the Broker of the true condition of the Business.

DISCLOSURES

1. LITIGATION. {{litigation}}. {{litigation_details}}

2. TAX LIENS. {{tax_liens}}. {{tax_lien_details}}

3. ENVIRONMENTAL. {{environmental}}. {{environmental_details}}

4. UNDISCLOSED LIABILITIES. {{undisclosed_liabilities}}. {{liability_details}}

CERTIFICATION

Seller certifies that the disclosures set forth above are true, accurate, and complete to the best of Seller's knowledge, information, and belief. Seller acknowledges that Broker and prospective purchasers will rely on this Disclosure in evaluating the Business, and that the failure to disclose a material fact may constitute fraud or a material misrepresentation giving rise to legal liability.

Seller further agrees to promptly supplement this Disclosure in writing if any information herein becomes inaccurate or if material new information arises prior to closing.

SELLER'S SIGNATURE:
Signature: ______________________________
Printed Name: {{seller_name}}
Date: {{disclosure_date}}

ACKNOWLEDGED BY BROKER:
Signature: ______________________________
Printed Name: __________________________
Date: ___________________________________{{LEGAL_FOOTER}}`,
  },
  {
    name: 'Transition / Consulting Agreement',
    description: 'Seller stays on after closing — consulting services, training, non-compete, and handover milestones.',
    category: 'Seller Pack',
    fields: [
      { key: 'seller_name', label: 'Seller / Consultant Name', type: 'text', required: true },
      { key: 'buyer_name', label: 'Buyer Name', type: 'text', required: true },
      { key: 'business_name', label: 'Business Name', type: 'text', required: true },
      { key: 'start_date', label: 'Start Date', type: 'date', required: true },
      { key: 'duration_weeks', label: 'Duration (weeks)', type: 'number', required: true, default: 4 },
      { key: 'hours_per_week', label: 'Hours per Week', type: 'number', required: false, default: 20 },
      { key: 'fee', label: 'Consulting Fee ($ / total)', type: 'number', required: false },
      { key: 'non_compete_months', label: 'Non-Compete Period (months)', type: 'number', required: false, default: 24 },
      { key: 'agency_name', label: 'Brokerage Name', type: 'text', required: true },
      { key: 'broker_name', label: 'Broker Name', type: 'text', required: true },
    ],
    parties: [
      { key: 'agent', label: 'Broker', role: 'agent' },
      { key: 'seller', label: 'Seller / Consultant', role: 'seller' },
      { key: 'buyer', label: 'Buyer', role: 'buyer' },
    ],
    body_template: `{{title}}

TRANSITION / CONSULTING AGREEMENT

This Transition / Consulting Agreement (this "Agreement") is entered into on {{start_date}}, by and between {{seller_name}} ("Consultant") and {{buyer_name}} ("Buyer"), regarding the post-closing transition of {{business_name}} (the "Business").

1. SERVICES. Consultant agrees to provide transition and consulting services to Buyer for a period of {{duration_weeks}} weeks following closing, including: (a) introduction to customers, suppliers, and employees; (b) training on day-to-day operations; (c) assistance with operational and administrative matters; and (d) such other reasonable assistance as Buyer may request.

2. TIME COMMITMENT. Consultant shall make himself/herself available up to {{hours_per_week}} hours per week during the transition period.

3. COMPENSATION. {{fee}}

4. NON-COMPETE. During the transition period and for {{non_compete_months}} months thereafter, Consultant shall not, directly or indirectly, engage in or assist any business that competes with the Business within the area in which the Business operates.

5. CONFIDENTIALITY. Consultant shall keep all non-public information concerning the Business confidential, including customer lists, pricing, and financial data.

6. INDEPENDENT CONTRACTOR. Consultant is an independent contractor and not an employee of Buyer.

7. GOVERNING LAW. This Agreement shall be governed by the laws of the state in which the Business is located.

IN WITNESS WHEREOF, the parties have executed this Agreement as of the date above.

CONSULTANT ({{seller_name}}):
Signature: ______________________________
Printed Name: {{seller_name}}
Date: {{start_date}}

BUYER ({{buyer_name}}):
Signature: ______________________________
Printed Name: {{buyer_name}}
Date: {{start_date}}

BROKER ({{agency_name}}):
Signature: ______________________________
Printed Name: {{broker_name}}
Date: ___________________________________{{LEGAL_FOOTER}}`,
  },
  {
    name: 'Buyer Representation Agreement',
    description: 'Engages the broker to represent a buyer — services, exclusivity, and compensation terms.',
    category: 'Buyer Pack',
    fields: [
      { key: 'buyer_name', label: 'Buyer Name', type: 'text', required: true },
      { key: 'buyer_email', label: 'Buyer Email', type: 'text', required: false },
      { key: 'agency_name', label: 'Brokerage Name', type: 'text', required: true },
      { key: 'broker_name', label: 'Broker Name', type: 'text', required: true },
      { key: 'engagement_date', label: 'Engagement Date', type: 'date', required: true },
      { key: 'term_months', label: 'Term (months)', type: 'number', required: false, default: 6 },
      { key: 'target_criteria', label: 'Target Acquisition Criteria', type: 'text', required: true },
      { key: 'compensation', label: 'Compensation', type: 'select', required: true, options: ['Broker fee paid by Seller (commission)', 'Buyer pays fee', 'To be agreed per transaction'] },
    ],
    parties: [
      { key: 'agent', label: 'Broker', role: 'agent' },
      { key: 'buyer', label: 'Buyer', role: 'buyer' },
    ],
    body_template: `{{title}}

BUYER REPRESENTATION AGREEMENT

This Buyer Representation Agreement (this "Agreement") is entered into on {{engagement_date}}, by and between {{buyer_name}} ({{buyer_email}}) ("Buyer") and {{broker_name}} of {{agency_name}} ("Broker").

1. ENGAGEMENT. Buyer engages Broker to identify, evaluate, and negotiate the acquisition of a business meeting the following criteria: {{target_criteria}}.

2. TERM. This Agreement shall remain in effect for {{term_months}} months from the Engagement Date (the "Term").

3. BROKER SERVICES. Broker shall: (a) identify potential acquisition targets; (b) conduct initial due diligence; (c) facilitate introductions and negotiations; (d) coordinate confidentiality agreements and information exchange; and (e) assist Buyer through closing.

4. COMPENSATION. {{compensation}}. Buyer acknowledges that Broker may also receive a commission from the Seller in connection with any transaction.

5. EXCLUSIVITY. During the Term, Buyer shall not engage another broker or advisor for the same purpose without Broker's prior written consent.

6. NON-CIRCUMVENTION. Buyer shall not circumvent Broker by directly contacting any business or seller introduced by Broker, and acknowledges Broker as the procuring cause of any transaction.

7. GOVERNING LAW. This Agreement shall be governed by the laws of the state in which Buyer resides or the Business is located.

IN WITNESS WHEREOF, the parties have executed this Agreement as of the date above.

BUYER:
Signature: ______________________________
Printed Name: {{buyer_name}}
Date: {{engagement_date}}

BROKER ({{agency_name}}):
Signature: ______________________________
Printed Name: {{broker_name}}
Date: ___________________________________{{LEGAL_FOOTER}}`,
  },
  {
    name: 'AML / KYC Buyer Verification',
    description: 'Anti-money-laundering / know-your-customer verification for buyer identity and source of funds — the compliance gate.',
    category: 'Buyer Pack',
    fields: [
      { key: 'buyer_name', label: 'Full Legal Name', type: 'text', required: true },
      { key: 'buyer_email', label: 'Email', type: 'text', required: false },
      { key: 'date_of_birth', label: 'Date of Birth', type: 'date', required: true },
      { key: 'id_type', label: 'ID Type', type: 'select', required: true, options: ['Driver\'s License', 'Passport', 'State ID', 'Other'] },
      { key: 'id_number', label: 'ID Number', type: 'text', required: true },
      { key: 'id_state', label: 'Issuing State / Country', type: 'text', required: false },
      { key: 'address', label: 'Current Address', type: 'text', required: true },
      { key: 'source_of_funds', label: 'Source of Funds', type: 'text', required: true, placeholder: 'e.g. savings, business sale proceeds, investment liquidation' },
      { key: 'verification_date', label: 'Verification Date', type: 'date', required: true },
      { key: 'agency_name', label: 'Brokerage Name', type: 'text', required: true },
    ],
    parties: [
      { key: 'agent', label: 'Broker', role: 'agent' },
      { key: 'buyer', label: 'Buyer', role: 'buyer' },
    ],
    body_template: `{{title}}

AML / KYC BUYER VERIFICATION

This Anti-Money-Laundering / Know-Your-Customer Verification (this "Verification") is completed on {{verification_date}} by {{agency_name}} ("Broker") regarding {{buyer_name}} ("Buyer"), in accordance with applicable anti-money-laundering and customer due-diligence obligations.

1. IDENTITY VERIFICATION. Buyer has provided the following identification:
   Full Legal Name: {{buyer_name}}
   Date of Birth: {{date_of_birth}}
   ID Type: {{id_type}}
   ID Number: {{id_number}}
   Issuing State / Country: {{id_state}}
   Current Address: {{address}}

2. SOURCE OF FUNDS. Buyer has represented that the funds to be used for the acquisition originate from: {{source_of_funds}}. Broker has no reason to believe the funds are derived from illegal activity.

3. VERIFICATION. Broker has verified Buyer's identity by reviewing the identification above and confirming the information against available records.

4. RECORD KEEPING. This Verification and copies of Buyer's identification shall be retained in accordance with applicable record-keeping requirements.

5. CERTIFICATION. Buyer certifies that the information provided herein is true and accurate, and that Buyer is not subject to any sanctions, is not a politically exposed person, and is not acting on behalf of any undisclosed third party.

BUYER'S SIGNATURE:
Signature: ______________________________
Printed Name: {{buyer_name}}
Date: {{verification_date}}

BROKER ({{agency_name}}):
Signature: ______________________________
Printed Name: __________________________
Date: ___________________________________{{LEGAL_FOOTER}}`,
  },
  {
    name: 'Tax Return & Bank Verification Authorization',
    description: '4506-T-style authorization — buyer/seller authorizes the broker to verify tax returns and bank statements directly with the source.',
    category: 'Buyer Pack',
    fields: [
      { key: 'taxpayer_name', label: 'Taxpayer Name', type: 'text', required: true },
      { key: 'business_name', label: 'Business Name', type: 'text', required: true },
      { key: 'accountant_name', label: 'Accountant / CPA Name', type: 'text', required: false },
      { key: 'accountant_firm', label: 'Accountant Firm', type: 'text', required: false },
      { key: 'bank_name', label: 'Bank Name', type: 'text', required: false },
      { key: 'bank_contact', label: 'Bank Contact / Branch', type: 'text', required: false },
      { key: 'years_requested', label: 'Years Requested', type: 'text', required: true, placeholder: 'e.g. 2023–2025' },
      { key: 'auth_date', label: 'Date', type: 'date', required: true },
      { key: 'agency_name', label: 'Brokerage Name', type: 'text', required: true },
      { key: 'broker_name', label: 'Broker Name', type: 'text', required: true },
    ],
    parties: [
      { key: 'agent', label: 'Broker', role: 'agent' },
      { key: 'buyer', label: 'Buyer / Taxpayer', role: 'buyer' },
    ],
    body_template: `{{title}}

TAX RETURN & BANK VERIFICATION AUTHORIZATION

I, {{taxpayer_name}}, as the owner of {{business_name}} (the "Business"), hereby authorize {{broker_name}} of {{agency_name}} ("Broker") to obtain and verify the following records for the purpose of evaluating and closing a transaction involving the Business:

1. TAX RETURNS. Federal and state income tax returns for the following years: {{years_requested}}, to be obtained from {{accountant_name}} ({{accountant_firm}}) or directly from the applicable tax authority.

2. BANK STATEMENTS. Bank statements for the Business and related accounts held at {{bank_name}} ({{bank_contact}}), for the same period.

3. USE OF INFORMATION. The records obtained shall be used solely for the purpose of verifying financial representations made in connection with the transaction and shall be held in confidence.

4. EFFECTIVE PERIOD. This authorization remains in effect until the transaction closes, terminates, or this authorization is revoked in writing.

SIGNATURE:
Signature: ______________________________
Printed Name: {{taxpayer_name}}
Date: {{auth_date}}

BROKER ({{agency_name}}):
Signature: ______________________________
Printed Name: {{broker_name}}
Date: ___________________________________{{LEGAL_FOOTER}}`,
  },
  {
    name: 'Transaction Brokerage Disclosure',
    description: 'The mandatory disclosure that the broker acts as a transaction broker / intermediary — not the agent of either party.',
    category: 'Compliance',
    fields: [
      { key: 'client_name', label: 'Client Name', type: 'text', required: true },
      { key: 'client_role', label: 'Client Role', type: 'select', required: true, options: ['Seller', 'Buyer', 'Both'] },
      { key: 'business_name', label: 'Business / Transaction', type: 'text', required: true },
      { key: 'agency_name', label: 'Brokerage Name', type: 'text', required: true },
      { key: 'broker_name', label: 'Broker Name', type: 'text', required: true },
      { key: 'disclosure_date', label: 'Date', type: 'date', required: true },
    ],
    parties: [
      { key: 'agent', label: 'Broker', role: 'agent' },
      { key: 'seller', label: 'Seller', role: 'seller' },
      { key: 'buyer', label: 'Buyer', role: 'buyer' },
    ],
    body_template: `{{title}}

TRANSACTION BROKERAGE DISCLOSURE

This Transaction Brokerage Disclosure (this "Disclosure") is provided on {{disclosure_date}} by {{broker_name}} of {{agency_name}} ("Broker") to {{client_name}} ("Client"), in connection with {{business_name}} (the "Transaction").

1. ROLE OF BROKER. Broker is acting as a TRANSACTION BROKER / INTERMEDIARY in the Transaction. In this capacity, Broker is NOT the agent or fiduciary of either party, does not represent either party's interests exclusively, and owes no fiduciary duties to either party except as expressly required by law.

2. NATURE OF SERVICES. Broker's role is limited to facilitating the Transaction, including marketing, introductions, negotiation assistance, and coordination of due diligence and closing.

3. NO LEGAL / TAX / FINANCIAL ADVICE. Broker does not provide legal, tax, accounting, or financial advice. Each party is strongly encouraged to consult with qualified professionals of their own choosing.

4. ACKNOWLEDGMENT. Client acknowledges receipt of this Disclosure and understands the limited role of Broker in the Transaction.

CLIENT'S SIGNATURE:
Signature: ______________________________
Printed Name: {{client_name}}
Role in Transaction: {{client_role}}
Date: {{disclosure_date}}

BROKER ({{agency_name}}):
Signature: ______________________________
Printed Name: {{broker_name}}
Date: ___________________________________{{LEGAL_FOOTER}}`,
  },
  {
    name: 'Record Retention & Privacy Policy',
    description: 'The firm\'s policy for retaining client records, protecting confidential information, and safeguarding personal data.',
    category: 'Compliance',
    fields: [
      { key: 'firm_name', label: 'Firm Name', type: 'text', required: true },
      { key: 'effective_date', label: 'Effective Date', type: 'date', required: true },
      { key: 'retention_years', label: 'Record Retention Period (years)', type: 'number', required: true, default: 7 },
      { key: 'privacy_contact', label: 'Privacy Contact', type: 'text', required: false },
    ],
    parties: [
      { key: 'agent', label: 'Broker', role: 'agent' },
    ],
    body_template: `{{title}}

RECORD RETENTION & PRIVACY POLICY

This Record Retention & Privacy Policy (this "Policy") is adopted by {{firm_name}} (the "Firm"), effective {{effective_date}}.

1. PURPOSE. This Policy establishes the Firm\'s standards for retaining records, protecting confidential client information, and safeguarding personal data in accordance with applicable law and professional standards.

2. RECORD RETENTION. The Firm shall retain the following records for a period of {{retention_years}} years: (a) listing agreements and engagement letters; (b) transaction documents, including purchase agreements, NDAs, and closing statements; (c) client financial information and verification records; (d) correspondence related to transactions; and (e) commission and compensation records.

3. CONFIDENTIALITY. All client information, including business financials, customer lists, and personal data, shall be held in strict confidence and disclosed only on a need-to-know basis or as required by law.

4. DATA SECURITY. The Firm shall maintain reasonable administrative, technical, and physical safeguards to protect client information from unauthorized access, use, or disclosure.

5. CLIENT ACCESS. Upon written request, clients may access and correct their personal information held by the Firm, subject to applicable law.

6. DISPOSAL. Records beyond the retention period shall be securely destroyed to prevent unauthorized access.

7. COMPLIANCE. All personnel of the Firm are required to comply with this Policy. Violations shall result in appropriate disciplinary action.

ADOPTED BY:
Signature: ______________________________
Printed Name: __________________________
Title: __________________________________
Date: {{effective_date}}{{LEGAL_FOOTER}}`,
  },
  {
    name: 'Corporate Authorization Resolution',
    description: 'Board resolution authorizing the sale — corporate authority for officers to execute the listing and sale documents.',
    category: 'Seller Pack',
    fields: [
      { key: 'corporation_name', label: 'Corporation Full Legal Name', type: 'text', required: true },
      { key: 'state_incorporation', label: 'State of Incorporation', type: 'text', required: true },
      { key: 'officer_name', label: 'Authorized Officer Name', type: 'text', required: true },
      { key: 'officer_title', label: 'Officer Title', type: 'text', required: true, placeholder: 'e.g. President' },
      { key: 'authorized_agent', label: 'Person Authorized to Act (if different)', type: 'text', required: false },
      { key: 'business_name', label: 'Business to Be Sold', type: 'text', required: true },
      { key: 'meeting_date', label: 'Meeting / Consent Date', type: 'date', required: true },
      { key: 'resolution_date', label: 'Resolution Date', type: 'date', required: true },
    ],
    parties: [
      { key: 'agent', label: 'Broker', role: 'agent' },
      { key: 'seller', label: 'Corporation / Officer', role: 'seller' },
    ],
    body_template: `{{title}}

CORPORATE AUTHORIZATION RESOLUTION

RESOLUTION OF THE BOARD OF DIRECTORS OF {{corporation_name}}

The undersigned, being all of the directors of {{corporation_name}}, a corporation organized under the laws of {{state_incorporation}} (the "Corporation"), hereby adopt the following resolutions at a meeting duly called and held on {{meeting_date}}, or by unanimous written consent:

WHEREAS, the Corporation owns or operates the business known as {{business_name}} (the "Business"); and

WHEREAS, the Board has determined that it is in the best interests of the Corporation to sell, transfer, or otherwise dispose of the Business;

NOW, THEREFORE, BE IT RESOLVED, that:

1. SALE AUTHORIZED. The Corporation is hereby authorized to sell, transfer, and convey any or all assets, real and personal, of the Business, upon such terms as may be determined.

2. OFFICER AUTHORITY. {{officer_name}}, in the capacity of {{officer_title}}, is hereby authorized and directed to: (a) execute the Exclusive Listing Agreement and any amendments; (b) negotiate and execute the purchase agreement, bill of sale, and all closing documents; (c) execute and deliver all agreements, deeds, and instruments necessary to complete the transaction; and (d) take all other actions reasonably necessary to consummate the sale.

3. BROKER ENGAGEMENT. The Corporation ratifies the engagement of the broker and the payment of any commission due in connection with the sale.

4. EFFECTIVE PERIOD. This authorization shall remain in full force and effect until the transaction closes or is terminated, and may not be revoked without the prior written consent of the broker during such period, to the extent permitted by applicable law.

CERTIFICATION

The undersigned certifies that the foregoing resolutions were duly adopted and are in full force and effect as of {{resolution_date}}.

CORPORATION:
{{corporation_name}}

Signature: ______________________________
Printed Name: {{officer_name}}
Title: {{officer_title}}
Date: {{resolution_date}}

ATTEST / WITNESS:
Signature: ______________________________
Printed Name: __________________________
Date: ___________________________________{{LEGAL_FOOTER}}`,
  },
  {
    name: 'LLC Authorization Resolution',
    description: 'Member/manager resolution authorizing the sale — LLC authority for the managing member to execute listing and sale documents.',
    category: 'Seller Pack',
    fields: [
      { key: 'llc_name', label: 'LLC Full Legal Name', type: 'text', required: true },
      { key: 'state_organization', label: 'State of Organization', type: 'text', required: true },
      { key: 'manager_name', label: 'Managing Member / Manager Name', type: 'text', required: true },
      { key: 'manager_title', label: 'Title', type: 'text', required: true, placeholder: 'e.g. Managing Member' },
      { key: 'authorized_agent', label: 'Person Authorized to Act (if different)', type: 'text', required: false },
      { key: 'business_name', label: 'Business to Be Sold', type: 'text', required: true },
      { key: 'meeting_date', label: 'Meeting / Consent Date', type: 'date', required: true },
      { key: 'resolution_date', label: 'Resolution Date', type: 'date', required: true },
    ],
    parties: [
      { key: 'agent', label: 'Broker', role: 'agent' },
      { key: 'seller', label: 'LLC / Managing Member', role: 'seller' },
    ],
    body_template: `{{title}}

LLC AUTHORIZATION RESOLUTION

RESOLUTION OF THE MEMBERS / MANAGERS OF {{llc_name}}

The undersigned, being the members/managers of {{llc_name}}, a limited liability company organized under the laws of {{state_organization}} (the "Company"), hereby adopt the following resolutions as of {{meeting_date}}, by consent of the members/managers in accordance with the Company's Operating Agreement and applicable law:

WHEREAS, the Company owns or operates the business known as {{business_name}} (the "Business"); and

WHEREAS, the members/managers have determined that it is in the best interests of the Company to sell, transfer, or otherwise dispose of the Business;

NOW, THEREFORE, BE IT RESOLVED, that:

1. SALE AUTHORIZED. The Company is hereby authorized to sell, transfer, and convey any or all assets, real and personal, of the Business, upon such terms as may be determined.

2. MANAGER AUTHORITY. {{manager_name}}, in the capacity of {{manager_title}}, is hereby authorized and directed to: (a) execute the Exclusive Listing Agreement and any amendments; (b) negotiate and execute the purchase agreement, bill of sale, and all closing documents; (c) execute and deliver all agreements, deeds, and instruments necessary to complete the transaction; and (d) take all other actions reasonably necessary to consummate the sale.

3. BROKER ENGAGEMENT. The Company ratifies the engagement of the broker and the payment of any commission due in connection with the sale.

4. EFFECTIVE PERIOD. This authorization shall remain in full force and effect until the transaction closes or is terminated, and may not be revoked without the prior written consent of the broker during such period, to the extent permitted by applicable law.

CERTIFICATION

The undersigned certifies that the foregoing resolutions were duly adopted and are in full force and effect as of {{resolution_date}}.

COMPANY:
{{llc_name}}

Signature: ______________________________
Printed Name: {{manager_name}}
Title: {{manager_title}}
Date: {{resolution_date}}

ATTEST / WITNESS:
Signature: ______________________________
Printed Name: __________________________
Date: ___________________________________{{LEGAL_FOOTER}}`,
  },
]

/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// MASTER AGENCY SERVICE AGREEMENT — the platform's own contract template.
// -----------------------------------------------------------------------------
// This is the master template the AI sales agent drafts FROM when a prospective
// agency wants to subscribe (Professional/Enterprise) or license the CRM
// (white-label). It is intentionally a FULL top-firm-style contract:
// cancel-anytime clause, standard pricing terms pulled from lib/pricing.ts
// constants (rendered at draft time, never hardcoded here), trial, fees,
// confidentiality, IP, warranties, indemnification, liability limits,
// governing law, counterparts, and signature blocks.
//
// GATE: drafting is automatic — SENDING this for signature is admin-approve
// ONLY. The template itself must be reviewed and approved by the owner
// before the agent is allowed to draft from it.
//
// NOTE: Standard form, not legal advice. Footer directs review by counsel.
// =============================================================================

import type { PackTemplateSeed } from '@/lib/legalPackTemplates'

export const AGENCY_SERVICE_AGREEMENT: PackTemplateSeed = {
  name: 'Agency Service Agreement',
  description:
    'Master agreement between Concord (EZ Business Advisors LLC) and a subscribing/licensing agency — CRM subscription (Professional/Enterprise) or white-label license, cancel-anytime, standard pricing terms.',
  category: 'Platform Contracts',
  fields: [
    { key: 'agency_name', label: 'Agency Legal Name', type: 'text', required: true },
    { key: 'agency_entity_type', label: 'Agency Entity Type', type: 'select', required: true, options: ['Individual', 'Corporation', 'LLC', 'Partnership', 'Trust', 'Other'] },
    { key: 'agency_address', label: 'Agency Address', type: 'text', required: true },
    { key: 'contact_email', label: 'Agency Billing/Admin Email', type: 'email', required: true },
    { key: 'plan_tier', label: 'Plan', type: 'select', required: true, options: ['Professional', 'Enterprise', 'White-Label License'] },
    { key: 'billing_cycle', label: 'Billing Cycle', type: 'select', required: true, options: ['Monthly', 'Annual'] },
    { key: 'seat_count', label: 'Seats Included/Ordered', type: 'number', required: true, placeholder: 'e.g. 5' },
    { key: 'start_date', label: 'Start Date', type: 'date', required: true },
    { key: 'signer_name', label: 'Agency Signer Name', type: 'text', required: true },
    { key: 'signer_title', label: 'Agency Signer Title', type: 'text', required: true },
  ],
  parties: [
    { key: 'agency', label: 'Agency', role: 'customer' },
    { key: 'provider', label: 'Concord (EZ Business Advisors LLC)', role: 'provider' },
  ],
  body_template: `{{title}}

AGENCY SERVICE AGREEMENT

This Agency Service Agreement (this "Agreement") is entered into as of {{start_date}} (the "Effective Date"), by and between {{agency_name}}, a {{agency_entity_type}} with its principal address at {{agency_address}} ("Agency"), and EZ Business Advisors LLC, d/b/a Concord, with an address of Harrisburg, Pennsylvania ("Provider"). Agency and Provider are each a "Party" and collectively the "Parties."

RECITALS

WHEREAS, Provider operates the Concord business-brokerage platform (the "Platform"), which includes the CRM system, deal pipeline, lead management, document and financial tools, AI agents, buyer portal, and related services; and

WHEREAS, Agency desires to subscribe to the Platform (or, for the White-Label License, to license and operate the Platform on its own domain) on the terms set forth herein, and Provider desires to provide such services to Agency.

NOW, THEREFORE, in consideration of the mutual covenants contained herein and other good and valuable consideration, the receipt and sufficiency of which are hereby acknowledged, the Parties agree as follows:

1. SERVICES. Provider shall provide Agency with access to the Platform in accordance with the plan selected by Agency (the "Plan"):
   (a) Professional — the professional brokerage tier, including deal pipeline, lead management, CIM/BOV generation, and email support;
   (b) Enterprise — all Professional features plus multi-board pipeline, the financial recasting engine, and priority support; or
   (c) White-Label License — a one-time licensed deployment of the Platform on Agency's own domain, with Agency's own branding, isolated marketplace, and its own infrastructure and API credentials, subject to the platform fee set forth below.
   Provider may update Platform features from time to time; material reductions in core functionality require prior written notice.

2. FEES AND PAYMENT. Agency shall pay Provider the fees for the selected Plan (the "Fees"), at Provider's then-standard rates:
   (a) Professional: $499 per month, or $4,790 if billed annually;
   (b) Enterprise: $899 per month, or $8,630 if billed annually;
   (c) White-Label License: a one-time setup fee of $4,999 plus a recurring platform fee of $499 per month.
   Fees are exclusive of taxes, which Agency shall pay. Fees are due in advance and payable by the payment method Agency authorizes. Late payments may, after 10 days' written notice, suspend Platform access until paid in full.

3. TRIAL. Agency may begin with a free trial of the Platform (the "Trial"). No Fees are charged during the Trial. Unless Agency cancels before the Trial ends, the Trial converts to a paid subscription at the Fees for the selected Plan, and Agency authorizes Provider to begin charging the Fees thereafter. Nothing in this Section obligates Agency to continue beyond the Trial.

4. TERM AND CANCEL-ANYTIME. This Agreement begins on the Effective Date and continues on a month-to-month (or, if billed annually, an annual) basis until terminated (the "Term"). Either Party may terminate this Agreement for any reason or no reason, at any time, effective immediately upon written notice to the other Party (for the White-Label License, the license remains effective through the end of the then-current prepaid platform-fee period). Upon termination, Agency's access to the Platform ceases at the end of the notice period (or prepaid period, for the License), Agency may export its data during such period, and no further Fees accrue. This cancel-anytime right is a material term of this Agreement.

5. REFUNDS. Fees for the current billing period are non-refundable except (a) as required by applicable law, or (b) where Provider materially fails to provide the Platform and does not cure within 15 days of written notice, in which case Agency is entitled to a pro-rata refund of prepaid Fees for the unused portion of the period. The one-time White-Label License setup fee is refundable only if Provider fails to deliver the licensed deployment.

6. AGENCY DATA. Agency owns all data, listings, leads, and content Agency submits to the Platform ("Agency Data"). Provider may use Agency Data solely to provide, maintain, and improve the Platform and as otherwise permitted by Provider's privacy policy. Upon termination, Provider shall make Agency Data available for export for 30 days, after which Provider may delete it.

7. CONFIDENTIALITY. Each Party shall hold the other's non-public information in confidence and use it only to perform this Agreement, and shall not disclose it except to its personnel and advisors bound by like obligations, or as required by law. Confidential information excludes information that is public, independently developed, or rightfully received from a third party.

8. INTELLECTUAL PROPERTY. As between the Parties, Provider owns all right, title, and interest in and to the Platform and its software, design, content, and documentation (the "Provider IP"). This Agreement grants Agency a limited, non-exclusive, non-transferable right to use the Provider IP solely to access the Platform during the Term. Agency retains all rights in Agency Data and Agency's own trademarks and branding.

9. REPRESENTATIONS AND WARRANTIES. Each Party represents that it has full authority to enter this Agreement and that its performance will comply with applicable law. Provider warrants that the Platform will perform materially in accordance with its documentation under normal use. EXCEPT AS EXPRESSLY SET FORTH HEREIN, THE PLATFORM IS PROVIDED "AS IS" AND PROVIDER DISCLAIMS ALL OTHER WARRANTIES, EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.

10. INDEMNIFICATION. Provider shall indemnify Agency from third-party claims alleging that the Platform infringes intellectual-property rights, provided Agency promptly notifies Provider and cooperates in the defense. Agency shall indemnify Provider from claims arising out of Agency's breach of this Agreement, Agency's misuse of the Platform, or Agency's inaccurate or unlawful data. Neither Party is liable for claims arising from the other Party's unauthorized modification or combination of its materials.

11. LIMITATION OF LIABILITY. TO THE MAXIMUM EXTENT PERMITTED BY LAW, NEITHER PARTY SHALL BE LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR FOR LOST PROFITS, REVENUE, OR DATA, ARISING OUT OF THIS AGREEMENT. EACH PARTY'S TOTAL AGGREGATE LIABILITY UNDER THIS AGREEMENT SHALL NOT EXCEED THE AMOUNTS PAID OR PAYABLE BY AGENCY TO PROVIDER DURING THE TWELVE (12) MONTHS PRECEDING THE CLAIM. THIS SECTION DOES NOT LIMIT EITHER PARTY'S INDEMNIFICATION OBLIGATIONS OR LIABILITY FOR FRAUD, GROSS NEGLIGENCE, OR WILLFUL MISCONDUCT.

12. INDEPENDENT CONTRACTOR. Provider and Agency are independent contractors. Nothing herein creates an employment, partnership, joint venture, or agency relationship between the Parties. Neither Party is authorized to bind the other.

13. GOVERNING LAW. This Agreement shall be governed by and construed in accordance with the laws of the Commonwealth of Pennsylvania, without regard to conflict-of-law principles. The Parties consent to the exclusive jurisdiction of the state and federal courts located in Dauphin County, Pennsylvania, for any dispute arising under this Agreement, except that either Party may seek injunctive relief in any court of competent jurisdiction.

14. ENTIRE AGREEMENT; AMENDMENTS. This Agreement constitutes the entire understanding of the Parties and supersedes all prior agreements, whether written or oral. No amendment shall be effective unless in writing and signed by both Parties. Provider may update pricing or standard terms prospectively upon 30 days' written notice; Agency may cancel under Section 4 rather than accept such changes.

15. COUNTERPARTS; ELECTRONIC SIGNATURE. This Agreement may be executed in counterparts, each deemed an original, and all of which together constitute one instrument. Signatures transmitted electronically (including via the Platform's e-sign tools or email) shall be deemed original signatures.

IN WITNESS WHEREOF, the Parties have executed this Agreement as of the Effective Date.

AGENCY ({{agency_name}}):
Signature: ______________________________
Printed Name: {{signer_name}}
Title: {{signer_title}}
Date: ___________________________________

PROVIDER — EZ Business Advisors LLC d/b/a Concord:
Signature: ______________________________
Printed Name: __________________________
Title: Authorized Representative
Date: ___________________________________{{LEGAL_FOOTER}}`,
}

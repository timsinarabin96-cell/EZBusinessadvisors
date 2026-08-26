/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import LegalDocument from '@/components/legal/LegalDocument'

// =============================================================================
// Broker Services Agreement — original template written for Concord Deal
// Platform. Modeled on standard industry practice (agency + commission
// structure) but drafted fresh. EDUCATIONAL TEMPLATE — have a licensed
// attorney in your state review and finalize before use with real clients.
// =============================================================================

export default function BrokerAgreementPage() {
  return (
    <LegalDocument title="Broker Services Agreement (Template)" updated="August 26, 2026">
      <div style={{ padding: 14, borderRadius: 10, background: '#fef2f2', border: '1px solid #fecaca', fontSize: 13, color: '#991b1b', marginBottom: 20 }}>
        <strong>⚠️ Template — not legal advice.</strong> This document is an educational template prepared for Concord
        Deal Platform. Contract terms are state-specific and must be reviewed and finalized by a licensed attorney in the
        state where the transaction occurs before use with any client.
      </div>

      <h2>BROKER SERVICES AGREEMENT</h2>
      <p><strong>This Broker Services Agreement</strong> (the &quot;Agreement&quot;) is entered into as of the date of
      the last signature below (the &quot;Effective Date&quot;), by and between:</p>
      <p><strong>Seller:</strong> ____________________________________ (the &quot;Seller&quot;), and</p>
      <p><strong>Broker:</strong> ____________________________________, a licensed business broker operating through the
      Concord Deal Platform (the &quot;Broker&quot;). The Seller and the Broker are each a &quot;Party&quot; and together the
      &quot;Parties.&quot;</p>

      <h2>1. Engagement &amp; Authority</h2>
      <p>1.1. The Seller engages the Broker, on an <strong>exclusive right-to-sell basis</strong> for the term set forth in
      Section 4, to market and sell the business described in Schedule A (the &quot;Business&quot;).</p>
      <p>1.2. The Seller represents that the Seller owns the Business and has full authority to sell it, and that no other
      agreement conflicts with this engagement.</p>

      <h2>2. Agency Relationship &amp; Disclosure</h2>
      <p>2.1. The Parties acknowledge that the Broker acts as the Seller&apos;s agent and owes the Seller the fiduciary duties
      of loyalty, confidentiality, disclosure, and good faith to the extent required by the law of the state in which the
      Business is located.</p>
      <p>2.2. The Broker may, with the Seller&apos;s written consent, act as a dual or transaction broker where permitted by
      applicable law, and may represent prospective buyers under separate buyer-representation agreements.</p>
      <p>2.3. The Seller acknowledges that the Broker&apos;s role does not include providing legal, tax, accounting, or
      investment advice, and the Seller has been advised to obtain independent professional advice.</p>

      <h2>3. Broker&apos;s Services</h2>
      <p>The Broker shall use commercially reasonable efforts to:</p>
      <ul>
        <li>3.1. Market the Business confidentially without disclosing the Seller&apos;s identity except to qualified buyers under a signed non-disclosure agreement;</li>
        <li>3.2. Screen and qualify prospective buyers;</li>
        <li>3.3. Facilitate inspections, negotiations, and the exchange of due-diligence materials;</li>
        <li>3.4. Prepare or coordinate a business valuation and marketing materials;</li>
        <li>3.5. Manage the transaction through letter of intent, due diligence, financing, and closing, subject to the involvement of the Seller&apos;s legal counsel.</li>
      </ul>

      <h2>4. Term &amp; Termination</h2>
      <p>4.1. This Agreement commences on the Effective Date and continues for a period of <strong>_____ months</strong> (the
      &quot;Term&quot;), unless earlier terminated as provided below.</p>
      <p>4.2. Either Party may terminate this Agreement with <strong>_____ days&apos; written notice</strong>; however, the
      Seller&apos;s obligation to pay the Commission (Section 5) survives termination for any sale or transfer to a buyer
      introduced by the Broker during the Term (a &quot;Protected Buyer&quot;), for a period of <strong>_____ months</strong> after
      termination.</p>
      <p>4.3. Upon termination, the Seller must promptly return all confidential materials provided by the Broker.</p>

      <h2>5. Commission</h2>
      <p>5.1. In consideration of the Broker&apos;s services, the Seller agrees to pay the Broker a commission (the
      &quot;Commission&quot;) equal to <strong>_____ % of the total consideration</strong> for the sale, transfer, or lease of the
      Business (including cash, notes, assumed liabilities, and the value of any non-cash consideration), subject to the
      minimum fee of <strong>$________</strong>.</p>
      <p>5.2. The Commission is earned and due upon the closing of any sale to a Protected Buyer, and is payable from the
      proceeds of the sale at closing. If the sale does not close due to the Seller&apos;s default, the Commission remains due
      and payable.</p>
      <p>5.3. Where the Broker engages one or more associate brokers or independent contractor agents to perform services
      under this Agreement, any internal commission split among such persons is solely between the Broker and such persons
      and does not affect the Commission owed by the Seller.</p>
      <p>5.4. The Parties acknowledge that commission structures vary by transaction and that the amounts in Section 5.1
      may be adjusted by written amendment.</p>

      <h2>6. Seller&apos;s Representations &amp; Cooperation</h2>
      <p>The Seller agrees to:</p>
      <ul>
        <li>6.1. Provide accurate and complete information about the Business, including financial statements, and to update such information as necessary;</li>
        <li>6.2. Cooperate with reasonable buyer qualification and due-diligence requests;</li>
        <li>6.3. Not negotiate directly with prospective buyers introduced by the Broker without the Broker&apos;s participation.</li>
      </ul>

      <h2>7. Confidentiality</h2>
      <p>7.1. Each Party agrees to hold the other&apos;s confidential information in confidence and to use it solely for the
      purpose of the transaction. This obligation survives termination of this Agreement.</p>
      <p>7.2. The Broker may disclose the Business to prospective buyers only under a written non-disclosure agreement
      signed by the buyer.</p>

      <h2>8. Disclaimer of Warranties &amp; Limitation of Liability</h2>
      <p>8.1. The Broker makes no warranty, express or implied, regarding the Business, its financial condition, the
      accuracy of any valuation, or the outcome of any sale.</p>
      <p>8.2. To the maximum extent permitted by law, the Broker&apos;s aggregate liability to the Seller arising out of or
      relating to this Agreement shall not exceed the amount of the Commission actually paid to the Broker under this
      Agreement. Neither Party shall be liable for indirect, incidental, special, or consequential damages.</p>

      <h2>9. Indemnification</h2>
      <p>The Seller agrees to indemnify and hold harmless the Broker, its associates, and their respective officers,
      directors, employees, and agents from and against any claims, losses, damages, liabilities, and reasonable expenses
      (including attorney&apos;s fees) arising out of: (a) the Seller&apos;s breach of this Agreement; (b) any inaccuracy in the
      Seller&apos;s representations; or (c) the condition or operation of the Business prior to closing, except to the extent
      caused by the Broker&apos;s own gross negligence or willful misconduct.</p>

      <h2>10. Independent Contractor</h2>
      <p>If the Broker is an individual independent contractor, the Broker is not an employee of any agency or brokerage
      platform. The Broker retains sole discretion over the manner and means of performing services, is responsible for
      the Broker&apos;s own taxes and licenses, and receives no employee benefits.</p>

      <h2>11. Governing Law &amp; Dispute Resolution</h2>
      <p>11.1. This Agreement is governed by the laws of the State of <strong>__________</strong>, without regard to
      conflict-of-laws principles.</p>
      <p>11.2. The Parties shall attempt to resolve any dispute through good-faith negotiation. Any unresolved dispute
      shall be resolved by binding arbitration administered by <strong>__________</strong>, in accordance with its rules,
      and judgment on the arbitration award may be entered in any court of competent jurisdiction. Each Party waives the
      right to a jury trial and the right to participate in a class action.</p>

      <h2>12. Miscellaneous</h2>
      <p>12.1. This Agreement constitutes the entire agreement between the Parties and may only be amended in writing.</p>
      <p>12.2. If any provision is held unenforceable, the remaining provisions continue in full force.</p>
      <p>12.3. No waiver of any term is effective unless in writing.</p>
      <p>12.4. This Agreement may be executed in counterparts.</p>

      <h2>Signature</h2>
      <p><strong>SELLER:</strong> ______________________________  Date: ____________</p>
      <p><strong>BROKER:</strong> ______________________________  Date: ____________</p>

      <h2>Schedule A — Description of Business</h2>
      <p>Business name: ____________________________________<br />
      Business type: ____________________________________<br />
      Location: ____________________________________<br />
      Asking price: ____________________________________<br />
      SDE/EBITDA: ____________________________________</p>
    </LegalDocument>
  )
}

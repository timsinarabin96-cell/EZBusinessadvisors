import LegalDocument from '@/components/legal/LegalDocument'

// =============================================================================
// Agency Disclosure Form — original template written for Concord Deal
// Platform. Several states (e.g., Maryland) require an agency disclosure at
// first substantive contact. Educational template — attorney review required.
// =============================================================================

export default function AgencyDisclosurePage() {
  return (
    <LegalDocument title="Agency Disclosure Form (Template)" updated="August 26, 2026">
      <div style={{ padding: 14, borderRadius: 10, background: '#fef2f2', border: '1px solid #fecaca', fontSize: 13, color: '#991b1b', marginBottom: 20 }}>
        <strong>⚠️ Template — not legal advice.</strong> Some states require a written agency disclosure at
        first substantive contact. Verify your state&apos;s requirements and have a licensed attorney finalize
        this form before use.
      </div>

      <h2>AGENCY DISCLOSURE</h2>
      <p><strong>This disclosure is being provided to you because state law requires that you be informed of
      the agency relationships available in a business sale transaction.</strong> Read this document carefully
      before proceeding.</p>

      <h2>1. What Is an Agency Relationship?</h2>
      <p>An agency relationship is created when one person (the &quot;agent&quot;) is authorized to act on behalf of
      another (the &quot;principal&quot;). A broker acting as an agent owes the principal fiduciary duties, which may
      include loyalty, confidentiality, disclosure, obedience, and reasonable care, to the extent required by
      the law of the state where the transaction occurs.</p>

      <h2>2. Types of Agency Relationships Available</h2>
      <p><strong>Seller&apos;s Agent (Listing Broker).</strong> Represents the seller and owes the seller fiduciary
      duties. The seller&apos;s agent must treat the buyer honestly but is not the buyer&apos;s agent.</p>
      <p><strong>Buyer&apos;s Agent (Buyer Representation).</strong> Represents the buyer and owes the buyer fiduciary
      duties, including loyalty and confidentiality.</p>
      <p><strong>Transaction Broker / Facilitator.</strong> Represents neither party as an agent. A transaction
      broker facilitates the transaction and deals with both parties on the same level of trust but owes no
      fiduciary duties, only honesty, fairness, and disclosure of material facts required by law.</p>
      <p><strong>Dual Agency.</strong> Occurs when the same brokerage represents both the buyer and the seller.
      Dual agency requires the informed written consent of both parties, and the broker may not act adversely
      to either party.</p>

      <h2>3. Disclosure of Agency Relationship</h2>
      <p>The undersigned parties acknowledge and agree that the broker named below is acting in the following
      capacity in this transaction (check one):</p>
      <p>☐ As the <strong>Seller&apos;s Agent</strong>, representing the Seller exclusively</p>
      <p>☐ As the <strong>Buyer&apos;s Agent</strong>, representing the Buyer exclusively</p>
      <p>☐ As a <strong>Transaction Broker / Facilitator</strong>, representing neither party</p>
      <p>☐ As a <strong>Dual Agent</strong>, representing both Seller and Buyer with the written consent of both
      parties</p>

      <h2>4. Acknowledgment</h2>
      <p>I/We acknowledge that:</p>
      <ul>
        <li>4.1. I/we have read and understand the types of agency relationships described above;</li>
        <li>4.2. I/we understand the capacity in which the broker is acting, as indicated above;</li>
        <li>4.3. I/we understand that the broker&apos;s role does not include providing legal, tax, or investment
        advice, and that we have been encouraged to seek independent professional counsel;</li>
        <li>4.4. I/we consent to the agency relationship disclosed above;</li>
        <li>4.5. This disclosure does not create a contractual obligation to buy or sell any business.</li>
      </ul>

      <h2>5. Signatures</h2>
      <p><strong>SELLER:</strong> ______________________________  Date: ____________</p>
      <p><strong>BUYER:</strong> ______________________________  Date: ____________</p>
      <p><strong>BROKER:</strong> ______________________________  Date: ____________</p>
      <p>Broker license number: ____________________________________</p>
      <p>State(s) of licensure: ____________________________________</p>

      <div style={{ marginTop: 20, padding: 14, borderRadius: 10, background: '#faf9f4', border: '1px solid #ece8dc', fontSize: 12.5, color: '#666', lineHeight: 1.7 }}>
        <strong>Note:</strong> This form is a template. State-specific disclosure requirements, formats, and
        timing vary. Confirm the applicable form with your state&apos;s real-estate commission or licensing
        authority before use.
      </div>
    </LegalDocument>
  )
}

import LegalDocument from '@/components/legal/LegalDocument'

// =============================================================================
// Buyer Representation Agreement — original template written for Concord Deal
// Platform. Educational template — have a licensed attorney in your state
// review and finalize before use with real clients.
// =============================================================================

export default function BuyerAgreementPage() {
  return (
    <LegalDocument title="Buyer Representation Agreement (Template)" updated="August 26, 2026">
      <div style={{ padding: 14, borderRadius: 10, background: '#fef2f2', border: '1px solid #fecaca', fontSize: 13, color: '#991b1b', marginBottom: 20 }}>
        <strong>⚠️ Template — not legal advice.</strong> Educational template prepared for Concord Deal
        Platform. Buyer-representation terms are state-specific and must be reviewed by a licensed
        attorney before use.
      </div>

      <h2>BUYER REPRESENTATION AGREEMENT</h2>
      <p><strong>Buyer:</strong> ____________________________________ (the &quot;Buyer&quot;)</p>
      <p><strong>Broker:</strong> ____________________________________, a licensed business broker operating
      through the Concord Deal Platform (the &quot;Broker&quot;).</p>

      <h2>1. Engagement</h2>
      <p>1.1. The Buyer engages the Broker to assist the Buyer in identifying, evaluating, and acquiring a
      business, for the term set forth in Section 5.</p>
      <p>1.2. This engagement is <strong>non-exclusive</strong> (or, if checked, <strong>exclusive</strong>:
      ☐), meaning the Buyer may work with other brokers unless an exclusive box is checked and agreed.</p>

      <h2>2. Agency &amp; Disclosure</h2>
      <p>2.1. The Broker acts as the Buyer&apos;s agent and owes the Buyer fiduciary duties of loyalty,
      confidentiality, and disclosure to the extent required by applicable state law.</p>
      <p>2.2. The Buyer acknowledges that the Broker may also represent sellers of businesses the Buyer
      wishes to acquire, and that in such transactions the Broker may act as a dual agent or transaction
      broker with the written consent of all parties, as permitted by law.</p>

      <h2>3. Broker&apos;s Services</h2>
      <ul>
        <li>3.1. Identify businesses matching the Buyer&apos;s criteria (subject to confidentiality restrictions);</li>
        <li>3.2. Coordinate property tours, management meetings, and due-diligence access;</li>
        <li>3.3. Assist with offer preparation, negotiation, and the letter-of-intent process;</li>
        <li>3.4. Coordinate with the Buyer&apos;s legal, tax, and lending professionals.</li>
      </ul>

      <h2>4. Fees &amp; Compensation</h2>
      <p>4.1. The Broker&apos;s compensation for buyer-representation services shall be <strong>______</strong>.</p>
      <p>4.2. Compensation may be paid by the seller or the seller&apos;s broker (a &quot;co-op&quot; commission), by the
      Buyer as a retainer or flat fee, or a combination, as agreed in writing. The Buyer is not obligated to
      pay any fee unless agreed in writing in this Section.</p>
      <p>4.3. If the Broker introduces a business to the Buyer and the Buyer acquires it during the Term or
      within <strong>______ months</strong> after termination, the Broker&apos;s fee is earned and payable.</p>

      <h2>5. Term &amp; Termination</h2>
      <p>This Agreement begins on the Effective Date and continues for <strong>______ months</strong>, or until a
      purchase closes, whichever is earlier. Either Party may terminate with <strong>______ days&apos; written
      notice</strong>, subject to Section 4.3.</p>

      <h2>6. Confidentiality</h2>
      <p>The Buyer agrees to keep all confidential business information disclosed during the search and
      diligence process confidential and to use it solely to evaluate an acquisition. The Buyer agrees not
      to contact sellers or their employees directly without the Broker&apos;s involvement during the Term.</p>

      <h2>7. Due Diligence &amp; No Guarantee</h2>
      <p>7.1. The Buyer is responsible for conducting its own independent due diligence on any business,
      including financial, legal, tax, and environmental review.</p>
      <p>7.2. The Broker makes no warranty about the accuracy of seller-provided information or the
      suitability of any business. Financial data is provided by sellers and is not independently verified
      unless expressly stated.</p>

      <h2>8. Limitation of Liability</h2>
      <p>To the maximum extent permitted by law, the Broker&apos;s aggregate liability under this Agreement shall
      not exceed the fees actually paid by the Buyer to the Broker. Neither Party is liable for indirect,
      incidental, special, or consequential damages.</p>

      <h2>9. Indemnification</h2>
      <p>The Buyer indemnifies the Broker against claims arising from the Buyer&apos;s breach of this Agreement,
      the Buyer&apos;s failure to perform due diligence, or the Buyer&apos;s conduct after closing, except where caused
      by the Broker&apos;s gross negligence or willful misconduct.</p>

      <h2>10. Governing Law &amp; Dispute Resolution</h2>
      <p>10.1. Governed by the laws of the State of <strong>__________</strong>.</p>
      <p>10.2. Disputes shall first be resolved through good-faith negotiation, then binding arbitration
      before <strong>__________</strong>, with each Party waiving jury trial and class-action participation
      to the extent permitted by law.</p>

      <h2>11. Entire Agreement</h2>
      <p>This Agreement is the entire agreement between the Parties and may only be amended in writing.
      If any provision is unenforceable, the rest remains in force.</p>

      <h2>Signature</h2>
      <p><strong>BUYER:</strong> ______________________________  Date: ____________</p>
      <p><strong>BROKER:</strong> ______________________________  Date: ____________</p>
    </LegalDocument>
  )
}

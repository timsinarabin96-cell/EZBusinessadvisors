/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import LegalDocument from '@/components/legal/LegalDocument'

// =============================================================================
// Ownership & Copyright — declares Rabin Timsina as sole legal owner of the
// Concord Deal Platform codebase, brand, and content. Original text.
// =============================================================================

export default function OwnershipPage() {
  return (
    <LegalDocument title="Ownership & Copyright" updated="August 26, 2026">
      <h2>1. Legal Owner</h2>
      <p>
        The Concord Deal Platform (including its source code, database schema, design, brand assets,
        documentation, and all original content — collectively the &quot;Platform&quot;) is the exclusive
        property of <strong>Rabin Timsina</strong>, operating as EZ Business Advisors. Rabin Timsina
        is the sole legal owner of the Platform.
      </p>

      <h2>2. Copyright</h2>
      <p>
        Copyright © 2026 Rabin Timsina. All rights reserved. The Platform and every original element
        of it are protected by United States copyright law (Title 17, U.S. Code) and international
        copyright treaties. Unauthorized reproduction, distribution, display, or creation of
        derivative works is prohibited.
      </p>

      <h2>3. What Is Protected</h2>
      <ul>
        <li>The source code, scripts, and database design;</li>
        <li>The user interface, layout, and visual design;</li>
        <li>The &quot;Concord Deal Platform&quot; and &quot;EZ Business Advisors&quot; names and any logos or marks;</li>
        <li>All written content, templates, and documentation;</li>
        <li>The proprietary data models, algorithms, and business logic.</li>
      </ul>

      <h2>4. No License Granted</h2>
      <p>
        Nothing on the Platform or in its repository grants any license, express or implied, to use,
        copy, modify, or redistribute the Platform or any part of it. The full terms are set out in
        the <a href="/license">LICENSE</a> file and the <a href="/legal/terms">Terms of Service</a>.
      </p>

      <h2>5. What Is Not Protected (Public Domain Facts)</h2>
      <p>
        For clarity, the Platform does not claim ownership of facts, industry-standard practices,
        generic interface patterns, or information already in the public domain. This page protects
        the Platform&apos;s <em>original expression</em> — not ideas, facts, or standard industry
        concepts.
      </p>

      <h2>6. Third-Party Components</h2>
      <p>
        Open-source libraries used by the Platform remain under their respective licenses. This
        copyright notice covers only the original work of the Owner.
      </p>

      <h2>7. Infringement</h2>
      <p>
        Unauthorized copying or use of the Platform may result in civil liability and criminal
        penalties under U.S. and international copyright law. The Owner reserves all rights and
        remedies available at law and in equity, including injunctive relief and damages.
      </p>

      <h2>8. Contact</h2>
      <p>
        Licensing inquiries and permission requests should be directed to the Owner through the
        contact information on the Platform.
      </p>
    </LegalDocument>
  )
}

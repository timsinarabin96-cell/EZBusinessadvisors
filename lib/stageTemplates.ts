/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Stage Templates — pre-built message templates with merge fields.
// -----------------------------------------------------------------------------
// Every template uses {deal}, {buyer}, {seller}, {dates}, {price}, {link}
// variables. fillTemplate() substitutes known values and leaves unknown ones
// visible for manual edit — the broker never writes from a blank page.
// Pure functions — unit-tested.
// =============================================================================

export interface TemplateVars {
  deal?: string | null
  buyer?: string | null
  seller?: string | null
  price?: string | null
  dates?: string | null
  link?: string | null
  agency?: string | null
}

export interface StageTemplate {
  key: string
  stage: string
  channel: 'email' | 'sms' | 'both'
  subject?: string
  body: string
}

export const STAGE_TEMPLATES: StageTemplate[] = [
  {
    key: 'nda_cover',
    stage: 'NDA sent',
    channel: 'email',
    subject: 'Confidentiality agreement — {deal}',
    body: `Hi {buyer},

Thanks for your interest in {deal}. Before we share the confidential details, please sign the one-page NDA at {link}.

It takes about 2 minutes and unlocks the full profile — financials, operations, and the data room.

{agency}
Reply with any questions.`,
  },
  {
    key: 'data_room_invite',
    stage: 'Data room',
    channel: 'email',
    subject: 'Your data room for {deal} is ready',
    body: `Hi {buyer},

The data room for {deal} is open. You'll find the recast financials, BOV, and supporting documents at {link}.

Diligence window: {dates}. Let me know if anything is missing.

{agency}`,
  },
  {
    key: 'offer_ack',
    stage: 'Offer',
    channel: 'email',
    subject: 'Offer received — {deal}',
    body: `Hi {buyer},

We received your offer on {deal}. The seller will review it and we'll get back to you by {dates}.

If you'd like to strengthen the offer (cash at close or fewer contingencies), now is the time.

{agency}`,
  },
  {
    key: 'loi_cover',
    stage: 'LOI',
    channel: 'email',
    subject: 'Letter of intent — {deal}',
    body: `Hi {buyer},

Great progress — here's the Letter of Intent for {deal} at {price}. Please review and sign at {link}.

Once signed, we'll move into diligence and the purchase agreement. Target close: {dates}.

{agency}`,
  },
  {
    key: 'closing_prep',
    stage: 'Closing',
    channel: 'email',
    subject: 'Closing prep — {deal}',
    body: `Hi {buyer},

We're close. Here's the closing checklist for {deal}:

• Purchase agreement signed
• Escrow funded
• Inventory valuation final
• Training schedule set

Target close: {dates}. All documents at {link}.

{agency}`,
  },
  {
    key: 'post_close_checkin',
    stage: 'Post-close',
    channel: 'email',
    subject: 'Checking in — {deal}',
    body: `Hi {seller},

It's been {dates} since we closed {deal}. How is the transition going?

If you know anyone thinking of selling, we'd love an introduction — referrals are the highest compliment.

{agency}`,
  },
  {
    key: 'referral_ask',
    stage: 'Post-close',
    channel: 'email',
    subject: 'One ask — referrals',
    body: `Hi {seller},

We hope {deal} is going great. Quick ask: do you know 2-3 owners who might be considering a sale? We'd happily give them the same white-glove service you received.

{agency}`,
  },
  {
    key: 'breakup_final',
    stage: 'Lost / cold',
    channel: 'email',
    subject: 'Closing the loop — {deal}',
    body: `Hi {buyer},

We haven't heard back, so we'll close this out for now. If {deal} (or any future opportunity) is right for you, reach out any time — we'll keep you on our buyer list.

{agency}`,
  },
]

/** Substitute known merge fields; unknown ones stay visible for manual edits. */
export function fillTemplate(template: StageTemplate, vars: TemplateVars): { subject: string; body: string } {
  const sub = (template.subject || '').replace(/\{(\w+)\}/g, (m, k: string) => {
    const v = (vars as Record<string, string | null | undefined>)[k]
    return v && String(v).trim() ? String(v) : m
  })
  const body = template.body.replace(/\{(\w+)\}/g, (m, k: string) => {
    const v = (vars as Record<string, string | null | undefined>)[k]
    return v && String(v).trim() ? String(v) : m
  })
  return { subject: sub, body }
}

/** Pick the template for a pipeline stage (falls back to the first match). */
export function templateForStage(stage: string, channel: 'email' | 'sms' = 'email'): StageTemplate | null {
  const candidates = STAGE_TEMPLATES.filter((t) => t.stage.toLowerCase() === stage.toLowerCase() && (t.channel === channel || t.channel === 'both'))
  return candidates[0] || null
}

/** List unique stage names that have templates (for pickers). */
export function templateStages(): string[] {
  return [...new Set(STAGE_TEMPLATES.map((t) => t.stage))]
}

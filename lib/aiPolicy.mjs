/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

const AUTOMATIC_ACTIONS = new Set([
  'contact.lookup',
  'lead.create',
  'lead.update',
  'listing_intake.create',
  'listing_intake.update',
  'appointment.create',
  'appointment.reschedule_draft',
  'task.create',
  'note.create',
  'call.transcript_append',
  'call.summary_create',
  'document.draft_create',
  'marketing.draft_create',
  'deal_passport.analyze',
  'buyer_engagement.score',
  'offer.compare_draft',
  'transition.task_create',
  'value_growth.recommendation_create',
])

const APPROVAL_ACTIONS = new Map([
  ['email.send', 'high'],
  ['sms.send', 'high'],
  ['appointment.cancel', 'medium'],
  ['record.delete', 'critical'],
  ['document.publish', 'high'],
  ['marketing.publish', 'high'],
  ['payment.charge', 'critical'],
  ['agreement.execute', 'critical'],
  ['financial.override', 'critical'],
  ['deal_fact.verify', 'high'],
  ['exchange.publish', 'high'],
  ['buyer.disclosure_expand', 'high'],
  ['offer.accept', 'critical'],
  ['relationship.introduction_send', 'high'],
])

export function getAiActionPolicy(actionType) {
  if (AUTOMATIC_ACTIONS.has(actionType)) {
    return { riskLevel: 'low', approvalRequired: false, allowed: true }
  }

  const approvalRisk = APPROVAL_ACTIONS.get(actionType)
  if (approvalRisk) {
    return { riskLevel: approvalRisk, approvalRequired: true, allowed: true }
  }

  return { riskLevel: 'critical', approvalRequired: true, allowed: false }
}

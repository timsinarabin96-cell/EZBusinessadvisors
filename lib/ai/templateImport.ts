/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// lib/ai/templateImport.ts — AI document → fillable template conversion.
// -----------------------------------------------------------------------------
// SERVER-ONLY. Upload your brokerage's ORIGINAL legal document (listing
// agreement, NDA, LOI…). We extract the text, ask DeepSeek to find every
// blank (party names, business name, price, dates, commission, signatures),
// and it returns a ready-made template: fields[], parties[], and a
// body_template with {{placeholders}} in place of each blank. The template
// then auto-fills from listing/deal data through the normal DocumentBuilder +
// eSign pipeline. Per-agency: agency_id scopes it (NULL = platform default).
// =============================================================================

import { complete } from '@/lib/claude/client'
import type { AgentContextPayload } from '@/types/ai'
import type { FieldType } from '@/lib/documentBuilder'

export interface AiInferredTemplate {
  name: string
  category: string
  description?: string | null
  fields: { key: string; label: string; type: FieldType; required: boolean; options?: string[]; placeholder?: string }[]
  parties: { key: string; label: string; role: 'agent' | 'seller' | 'buyer' | 'custom' }[]
  body_template: string
}

const CATEGORIES = [
  'Listing Agreement', 'NDA', 'Purchase Agreement', 'Seller Documents',
  'Buyer Documents', 'Marketing Agreement', 'Corporate Documents', 'LOI', 'Other',
]

const FIELD_TYPES: FieldType[] = ['text', 'number', 'date', 'select', 'textarea', 'signature']
const PARTY_ROLES = ['agent', 'seller', 'buyer', 'custom'] as const

/** Hard requirement: an inferred template must expose at least one field. */
function sanitizeInferred(raw: Record<string, unknown>, fileName: string): AiInferredTemplate {
  const fields = Array.isArray(raw.fields)
    ? (raw.fields as Record<string, unknown>[]).map((f) => ({
        key: String(f.key || '').trim().replace(/[^a-zA-Z0-9_]/g, '_'),
        label: String(f.label || '').trim(),
        type: (FIELD_TYPES.includes(f.type as FieldType) ? f.type : 'text') as FieldType,
        required: f.required !== false,
        options: Array.isArray(f.options) ? (f.options as string[]).map(String).filter(Boolean) : undefined,
        placeholder: f.placeholder ? String(f.placeholder) : undefined,
      })).filter((f) => f.key && f.label)
    : []

  const parties = Array.isArray(raw.parties)
    ? (raw.parties as Record<string, unknown>[]).map((p) => ({
        key: String(p.key || '').trim().replace(/[^a-zA-Z0-9_]/g, '_'),
        label: String(p.label || '').trim(),
        role: (PARTY_ROLES.includes(p.role as any) ? p.role : 'custom') as 'agent' | 'seller' | 'buyer' | 'custom',
      })).filter((p) => p.key && p.label)
    : []

  const body = String(raw.body_template || raw.body || '').trim()
  const name = String(raw.name || '').trim().slice(0, 160) || fileName.replace(/\.[^.]+$/, '').slice(0, 160)
  const category = CATEGORIES.includes(String(raw.category || '')) ? String(raw.category) : 'Other'

  return { name, category, description: raw.description ? String(raw.description).slice(0, 300) : null, fields, parties, body_template: body }
}

/**
 * Convert extracted document text into a fillable template via DeepSeek.
 * Returns a sanitized AiInferredTemplate (never throws on shape issues —
 * throws only if the AI is unavailable).
 */
export async function inferTemplateFromText(input: {
  fileName: string
  text: string
  agencyName?: string | null
}): Promise<AiInferredTemplate> {
  const context: AgentContextPayload = {
    kind: 'listing',
    text: [
      `Document file: ${input.fileName}`,
      input.agencyName ? `Brokerage: ${input.agencyName}` : '',
      '',
      '--- DOCUMENT TEXT ---',
      input.text.slice(0, 18_000),
    ].join('\n'),
  }

  const system = [
    'You convert a legal/business document into a FILLABLE template for a business-brokerage platform.',
    'Read the document text carefully. Identify EVERY blank that must be filled per deal:',
    '- Party names (seller, buyer, broker/agent, agency), business name, addresses',
    '- Monetary amounts (asking price, purchase price, deposit, commission %, fees)',
    '- Dates (agreement date, closing date, deadlines), durations/terms',
    '- Signature lines (seller, buyer, broker) — these are "signature" type fields',
    '- Any other deal-specific blank (SDE, revenue, lease terms, etc.)',
    'Return a JSON object with EXACTLY this shape:',
    '{ "name": string, "category": one of ' + JSON.stringify(CATEGORIES) + ', "description": string|null,',
    '  "fields": [{ "key": "snake_case_id", "label": "Human label", "type": "text|number|date|select|textarea|signature", "required": boolean, "options": string[]|null, "placeholder": string|null }],',
    '  "parties": [{ "key": "seller|buyer|agent|custom_id", "label": "Seller", "role": "agent|seller|buyer|custom" }],',
    '  "body_template": "the full document text with {{key}} placeholders inserted where each blank was" }',
    'Rules:',
    '- field.key must be snake_case; signature fields for each party are REQUIRED.',
    '- Keep ALL original legal language verbatim in body_template — only replace blanks with {{key}}.',
    '- Use {{party.key}} style tokens (e.g. {{seller_name}}, {{asking_price}}, {{agreement_date}}).',
    '- Prefer keys that match listing data when obvious: business_name, asking_price, annual_revenue, sde, seller_name, seller_email, buyer_name, agreement_date, closing_date, commission_pct, agency_name.',
  ].join('\n')

  const res = await complete({
    context,
    system,
    message: 'Convert the document text into the fillable-template JSON. Preserve all legal language; only insert {{placeholders}} for blanks.',
    jsonMode: true,
    maxTokens: 3200,
  })

  if (!res.data) {
    // Try to salvage a JSON object out of the raw text (AI sometimes wraps it).
    try {
      const cleaned = (res.text || '').replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim()
      const parsed = JSON.parse(cleaned)
      return sanitizeInferred(parsed, input.fileName)
    } catch {
      throw new Error('AI returned no usable template structure')
    }
  }

  return sanitizeInferred(res.data, input.fileName)
}

/** Map a template's field keys onto listing/deal data for auto-fill. */
export function autoFillFromListing(
  template: AiInferredTemplate | { fields: { key: string }[] },
  listing: Record<string, unknown>,
): Record<string, unknown> {
  const map: Record<string, (l: Record<string, unknown>) => unknown> = {
    business_name: (l) => l.business_name,
    asking_price: (l) => l.asking_price,
    annual_revenue: (l) => l.annual_revenue,
    sde: (l) => l.sde,
    ebitda: (l) => l.ebitda,
    seller_name: (l) => l.seller_name ?? l.owner_name,
    seller_email: (l) => l.seller_email ?? l.owner_email,
    industry: (l) => l.industry,
    location_general: (l) => l.location_general,
    description: (l) => l.description,
    commission_pct: () => 10,
    agency_name: () => null, // filled at render time
  }
  const filled: Record<string, unknown> = {}
  for (const f of template.fields) {
    const fn = map[f.key]
    if (fn) {
      const v = fn(listing)
      if (v != null) filled[f.key] = v
    }
  }
  return filled
}

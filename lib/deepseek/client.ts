import type { AgentContextPayload } from '@/types/ai'
import type { InternalMessage } from '@/lib/claude/client'

export class DeepSeekConfigError extends Error {
  constructor() {
    super('DEEPSEEK_API_KEY is not configured on the server.')
    this.name = 'DeepSeekConfigError'
  }
}

export function isDeepSeekConfigured(): boolean {
  return Boolean(process.env.DEEPSEEK_API_KEY)
}

export async function completeWithDeepSeek({
  context,
  history = [],
  message,
  system,
  jsonMode = false,
  maxTokens = 1024,
}: {
  context: AgentContextPayload
  history?: InternalMessage[]
  message: string
  system: string
  jsonMode?: boolean
  maxTokens?: number
}): Promise<{ text: string; data?: Record<string, unknown>; usage?: { input: number; output: number } }> {
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) throw new DeepSeekConfigError()

  const response = await fetch(`${process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com'}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: process.env.DEEPSEEK_DEFAULT_MODEL || 'deepseek-v4-flash',
      messages: [
        { role: 'system', content: `${system}\n\n${jsonMode ? 'Return only a valid JSON object.' : 'Respond concisely and directly.'}` },
        { role: 'user', content: `[Verified CRM context]\n${context.text}` },
        ...history.slice(-12),
        { role: 'user', content: message },
      ],
      thinking: { type: 'disabled' },
      max_tokens: maxTokens,
      response_format: jsonMode ? { type: 'json_object' } : { type: 'text' },
      stream: false,
    }),
    signal: AbortSignal.timeout(45_000),
  })

  if (!response.ok) throw new Error(`DeepSeek request failed with status ${response.status}`)
  const payload = await response.json() as {
    choices?: Array<{ message?: { content?: string | null } }>
    usage?: { prompt_tokens?: number; completion_tokens?: number }
  }
  const text = payload.choices?.[0]?.message?.content?.trim() || ''
  let data: Record<string, unknown> | undefined
  if (jsonMode && text) {
    try { data = JSON.parse(text) as Record<string, unknown> } catch {}
  }
  return {
    text,
    data,
    usage: payload.usage ? { input: payload.usage.prompt_tokens || 0, output: payload.usage.completion_tokens || 0 } : undefined,
  }
}

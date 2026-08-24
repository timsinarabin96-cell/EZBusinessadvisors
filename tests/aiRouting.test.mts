import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('all AI agents route to DeepSeek (primary provider)', () => {
  const route = readFileSync('app/api/ai/chat/route.ts', 'utf8')
  assert.match(route, /completeWithDeepSeek/)
  assert.match(route, /useClaude = false/)
  assert.match(route, /provider: useClaude \? 'anthropic' : 'deepseek'/)
})

test('per-tenant AI credentials resolve from agency settings', () => {
  const tenant = readFileSync('lib/tenantAi.ts', 'utf8')
  assert.match(tenant, /resolveTenantAiConfig/)
  assert.match(tenant, /agency_settings/)
  assert.match(tenant, /deepseek_api_key/)
})

test('AI chat sends the live user message to the provider', () => {
  const claude = readFileSync('lib/claude/client.ts', 'utf8')
  const deepseek = readFileSync('lib/deepseek/client.ts', 'utf8')
  assert.match(claude, /content: message/)
  assert.match(deepseek, /content: message/)
})

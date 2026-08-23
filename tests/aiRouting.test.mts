import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('routine AI routes to DeepSeek and document polish routes to Claude', () => {
  const route = readFileSync('app/api/ai/chat/route.ts', 'utf8')
  assert.match(route, /agent === 'document' && isClaudeConfigured\(\)/)
  assert.match(route, /completeWithDeepSeek/)
  assert.match(route, /provider: useClaude \? 'anthropic' : 'deepseek'/)
})

test('AI chat sends the live user message to the provider', () => {
  const claude = readFileSync('lib/claude/client.ts', 'utf8')
  const deepseek = readFileSync('lib/deepseek/client.ts', 'utf8')
  assert.match(claude, /content: message/)
  assert.match(deepseek, /content: message/)
})

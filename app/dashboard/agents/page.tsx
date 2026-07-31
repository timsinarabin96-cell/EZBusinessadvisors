'use client'

import { Card, CardHeader, Badge } from '@/components/ui'
import ChatInterface from '@/components/ai/ChatInterface'

// Planned AI agents. These are placeholders — the actual AI backend + chat UI
// is a pending workstream (Claude integration + agent service layer).
const AGENTS = [
  {
    icon: '🎯',
    name: 'Lead Agent',
    desc: 'Scores and qualifies inbound buyer/seller leads, drafts follow-ups, and flags high-intent opportunities for you to pursue.',
    status: 'Coming soon',
    accent: '#22c55e',
  },
  {
    icon: '📘',
    name: 'Training Agent',
    desc: 'Answers brokerage questions from your training library and recommends modules based on your progress and gaps.',
    status: 'Coming soon',
    accent: '#c9a84c',
  },
  {
    icon: '📁',
    name: 'Document Agent',
    desc: 'Summarizes CIMs, BOVs, recasts, and seller financials; extracts key numbers and flags documents needing attention.',
    status: 'Coming soon',
    accent: '#8b5cf6',
  },
  {
    icon: '🛟',
    name: 'Support Agent',
    desc: 'Guides you through the platform — where to find things, how a feature works, and quick answers to common questions.',
    status: 'Coming soon',
    accent: '#0ea5e9',
  },
]

export default function AgentsPage() {
  return (
    <div>
      <ChatInterface />
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 26 }}>AI Agents</h1>
        <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: 14 }}>
          Your AI team — assisting with leads, training, documents, and support.
        </p>
      </header>

      <Card style={{ marginBottom: 24, borderLeft: '4px solid var(--gold)' }}>
        <div style={{ padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 34 }}>🤖</div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <Badge color="#22c55e">Chat UI Live</Badge>
            <div style={{ marginTop: 6, fontWeight: 700, color: 'var(--navy)', fontFamily: 'Georgia, serif' }}>
              Chat with your AI agents — use the 🤖 bubble at the bottom-right
            </div>
            <div style={{ marginTop: 4, fontSize: 13, color: 'var(--muted)' }}>
              Add an ANTHROPIC_API_KEY to .env.local to go live with Claude.
            </div>
          </div>
        </div>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
        {AGENTS.map((agent) => (
          <Card key={agent.name} style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '20px', flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                <div style={{ fontSize: 34 }}>{agent.icon}</div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 17, color: 'var(--navy)', fontFamily: 'Georgia, serif' }}>
                    {agent.name}
                  </div>
                  <Badge color={agent.accent}>{agent.status}</Badge>
                </div>
              </div>
              <p style={{ margin: 0, color: 'var(--muted)', fontSize: 13.5, lineHeight: 1.5 }}>{agent.desc}</p>
            </div>
          </Card>
        ))}
      </div>

      <Card style={{ marginTop: 24 }}>
        <CardHeader title="Setup" subtitle="To enable these agents (Claude backend)" />
        <div style={{ padding: '20px' }}>
          <p style={{ margin: 0, color: 'var(--muted)', fontSize: 14, lineHeight: 1.6 }}>
            The chat UI and API route are built. To go live: add your{' '}
            <code style={{ background: 'var(--line)', padding: '2px 6px', borderRadius: 4, fontSize: 13 }}>ANTHROPIC_API_KEY</code>{' '}
            to <code style={{ background: 'var(--line)', padding: '2px 6px', borderRadius: 4, fontSize: 13 }}>.env.local</code>{' '}
            (server-side) and restart the dev server.
          </p>
        </div>
      </Card>
    </div>
  )
}

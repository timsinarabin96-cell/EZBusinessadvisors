/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import type { Metadata } from 'next'
import Link from 'next/link'

// =============================================================================
// /brokerai — the AI deal assistant, packaged as a product (Flippa-style).
// Sells the intelligence stack we already built (Deal Twin, data room Q&A,
// call summaries, red flags, autopilot) as a named, credible product.
// =============================================================================

export const metadata: Metadata = {
  title: 'BrokerAI — The AI Deal Assistant That Closes While You Sleep | Concord',
  description: 'BrokerAI builds your CIM, scores inbound buyers, and manages your data room overnight. Every morning, your deal has moved. Powered by the Concord Deal Platform.',
  alternates: { canonical: '/brokerai' },
  openGraph: {
    title: 'BrokerAI — Your deal, moved overnight',
    description: 'AI-built CIMs, buyer scoring, and data-room management. Your broker arrives every morning with a deal that moved while they slept.',
    url: '/brokerai',
    type: 'website',
  },
}

const capabilities = [
  ['📄', 'CIM Generator', 'Upload the numbers — BrokerAI drafts a complete Confidential Information Memorandum with the financial narrative, growth story, and deal structure.'],
  ['🎯', 'Buyer Scoring', 'Every inbound inquiry is scored against the seller\'s criteria: funds, timeline, industry fit, location. Your broker only talks to serious buyers.'],
  ['📁', 'Data Room Management', 'BrokerAI curates the data room, answers buyer questions in real time, and flags missing documents before diligence stalls.'],
  ['💠', 'Deal Twin', 'A live simulation of your deal — structure scenarios, seller-financing mixes, and tax outcomes before you present an offer.'],
  ['🎧', 'Call Summaries', 'Every call transcribed and summarized automatically. Action items extracted and pushed to the pipeline. No notes, no drops.'],
  ['🔎', 'Red Flags', 'BrokerAI scans financials and documents for inconsistencies, anomalies, and risk patterns before they become deal-killers.'],
  ['✨', 'Deal Autopilot', 'Follow-up sequences, nurture drips, and timing nudges run themselves. No lead goes cold because someone forgot.'],
  ['👀', 'Visitor Intent', 'See which buyers are looking at which listings and what they engage with — before they even reach out.'],
]

const steps = [
  ['1', 'Connect your deals', 'Your pipeline, listings, and documents sync into BrokerAI from your existing Concord workspace.'],
  ['2', 'Let it work overnight', 'BrokerAI drafts the CIM, scores new inquiries, answers data-room questions, and updates the pipeline.'],
  ['3', 'Arrive to momentum', 'Every morning starts with a briefing: who moved, what\'s hot, what needs your judgment. You close, it runs.'],
]

export default function BrokerAiPage() {
  return (
    <main style={{ background: '#f4f7fb', minHeight: '100vh' }}>
      {/* Hero */}
      <section style={{ background: 'linear-gradient(135deg,#071827 0%,#0f3460 60%,#153e5c 100%)', color: '#fff', padding: '88px 24px 72px' }}>
        <div style={{ maxWidth: 960, margin: '0 auto', textAlign: 'center' }}>
          <div style={{ display: 'inline-block', padding: '7px 16px', borderRadius: 99, background: 'rgba(201,168,76,0.15)', border: '1px solid rgba(201,168,76,0.45)', color: '#c9a84c', fontSize: 12.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            ✨ Powered by the Concord Deal Platform
          </div>
          <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 52, lineHeight: 1.12, margin: '26px 0 18px' }}>
            Your deal, <span style={{ color: '#c9a84c' }}>moved overnight.</span>
          </h1>
          <p style={{ fontSize: 17, color: 'rgba(255,255,255,0.82)', lineHeight: 1.7, maxWidth: 640, margin: '0 auto 34px' }}>
            BrokerAI builds your CIM, scores inbound buyers, and manages the data room while you sleep.
            Your broker arrives every morning with a deal that moved.
          </p>
          <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/marketplace/sell" style={{ background: '#c9a84c', color: '#102a43', padding: '15px 34px', borderRadius: 10, textDecoration: 'none', fontWeight: 800, fontSize: 15.5 }}>
              Get your free valuation →
            </Link>
            <Link href="/contact" style={{ border: '1.5px solid rgba(255,255,255,0.4)', color: '#fff', padding: '15px 34px', borderRadius: 10, textDecoration: 'none', fontWeight: 700, fontSize: 15.5 }}>
              Talk to a broker
            </Link>
          </div>
        </div>
      </section>

      {/* Capabilities */}
      <section style={{ padding: '72px 24px' }}>
        <div style={{ maxWidth: 1080, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 44 }}>
            <div style={{ color: '#0e7490', fontSize: 13, letterSpacing: '0.18em', textTransform: 'uppercase', fontWeight: 800 }}>The full intelligence stack</div>
            <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 34, color: '#102a43', margin: '10px 0 0' }}>Eight systems. One assistant.</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 20 }}>
            {capabilities.map(([icon, title, body]) => (
              <div key={title} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 24 }}>
                <div style={{ fontSize: 30, marginBottom: 10 }}>{icon}</div>
                <div style={{ fontSize: 17, fontWeight: 800, color: '#102a43', fontFamily: 'Georgia, serif' }}>{title}</div>
                <div style={{ fontSize: 13.5, color: '#64748b', lineHeight: 1.6, marginTop: 8 }}>{body}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section style={{ background: '#fff', padding: '72px 24px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 44 }}>
            <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 34, color: '#102a43', margin: 0 }}>How BrokerAI works</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20 }}>
            {steps.map(([n, title, body]) => (
              <div key={n} style={{ textAlign: 'center', padding: '26px 20px' }}>
                <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#102a43', color: '#c9a84c', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 18, margin: '0 auto 14px' }}>{n}</div>
                <div style={{ fontSize: 17, fontWeight: 800, color: '#102a43' }}>{title}</div>
                <div style={{ fontSize: 13.5, color: '#64748b', lineHeight: 1.6, marginTop: 8 }}>{body}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ background: 'linear-gradient(135deg,#102a43,#0f3460)', color: '#fff', padding: '64px 24px', textAlign: 'center' }}>
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 32, margin: '0 0 12px' }}>Close more deals with fewer hours.</h2>
          <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 15.5, lineHeight: 1.7, margin: '0 0 28px' }}>
            BrokerAI is included with every Concord agency workspace. Launch your branded brokerage today.
          </p>
          <Link href="/signup/agency" style={{ display: 'inline-block', background: '#c9a84c', color: '#102a43', padding: '15px 38px', borderRadius: 10, textDecoration: 'none', fontWeight: 800, fontSize: 15.5 }}>
            Launch your brokerage →
          </Link>
        </div>
      </section>
    </main>
  )
}

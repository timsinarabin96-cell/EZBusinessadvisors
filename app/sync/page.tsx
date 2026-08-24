'use client'

import AppShell from '@/components/layout/AppShell'
import { ToastProvider } from '@/components/ui/Toast'

// ---------------------------------------------------------------------------
// /sync — Syndication: other sources + manual entry.
// The platform does NOT auto-push listings anywhere. Agents choose their own
// sources (BizBuySell, LoopNet, DealStream, local classifieds, social, etc.)
// and enter each listing manually from their own accounts. This page is the
// manual checklist + source guide.
// ---------------------------------------------------------------------------

const OTHER_SOURCES = [
  { name: 'BizBuySell', url: 'https://www.bizbuysell.com', note: 'Enter the listing manually from your own seller account.' },
  { name: 'LoopNet', url: 'https://www.loopnet.com', note: 'Manual post — commercial real estate + business listings.' },
  { name: 'DealStream', url: 'https://www.dealstream.com', note: 'Manual post — businesses, deals, and capital.' },
  { name: 'BizQuest', url: 'https://www.bizquest.com', note: 'Manual post — businesses for sale.' },
  { name: 'BusinessesForSale.com', url: 'https://www.businessesforsale.com', note: 'Manual post.' },
  { name: 'Facebook Marketplace / Groups', url: 'https://www.facebook.com/marketplace', note: 'Local business-for-sale groups reach nearby buyers.' },
  { name: 'LinkedIn', url: 'https://www.linkedin.com', note: 'Post teasers to your network + industry groups.' },
  { name: 'Local newspaper / classifieds', url: '', note: 'Weekly paper, industry magazines, local chambers.' },
]

const CHECKLIST = [
  'Public title set — headline buyers would search',
  'Public summary written (2–4 sentences, no confidential info)',
  'Highlights added (3–6 bullet points)',
  'Gallery images uploaded (cover + 2–5 more)',
  'Financials verified / SDE or EBITDA entered',
  'Status Active → live on the website',
  'Manually entered on each external source you use',
]

export default function SyncPage() {
  return (
    <AppShell active="Syndication">
      <ToastProvider>
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '20px 16px 60px' }}>
          <div style={{ marginBottom: 18 }}>
            <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 26, color: 'var(--navy)', margin: '0 0 6px' }}>🔗 Syndication — Other Sources</h1>
            <p style={{ color: 'var(--muted)', fontSize: 14, margin: 0 }}>
              The platform never auto-pushes listings anywhere. You pick the sources that work for your market and enter each
              listing manually — full control over where your deals appear.
            </p>
          </div>

          {/* Checklist */}
          <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: 20, marginBottom: 18 }}>
            <div style={{ fontWeight: 800, marginBottom: 10, color: 'var(--navy)' }}>Before you syndicate</div>
            {CHECKLIST.map((item) => (
              <label key={item} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', fontSize: 14, color: 'var(--ink)', cursor: 'pointer' }}>
                <input type="checkbox" style={{ width: 15, height: 15 }} /> {item}
              </label>
            ))}
          </div>

          {/* Source guide */}
          <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: 20 }}>
            <div style={{ fontWeight: 800, marginBottom: 4, color: 'var(--navy)' }}>Source guide</div>
            <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 12 }}>Open each source and enter the listing manually from your account. No API keys, no sync.</div>
            <div style={{ display: 'grid', gap: 10 }}>
              {OTHER_SOURCES.map((source) => (
                <div key={source.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '12px 14px', border: '1px solid var(--line)', borderRadius: 8 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--navy)' }}>{source.name}</div>
                    <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>{source.note}</div>
                  </div>
                  {source.url && (
                    <a href={source.url} target="_blank" rel="noopener noreferrer" style={{ whiteSpace: 'nowrap', fontSize: 13, fontWeight: 700, color: '#0e7490', textDecoration: 'none' }}>
                      Open →
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </ToastProvider>
    </AppShell>
  )
}

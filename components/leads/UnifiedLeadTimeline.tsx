'use client'

// =============================================================================
// UnifiedLeadTimeline — one scrolling timeline per lead.
// Merges communication log (calls / emails / SMS / meetings) + activity notes
// + status changes into a single chronologically-sorted feed with icons,
// direction badges, and relative timestamps. Replaces the two stacked lists.
// =============================================================================

export interface TimelineComm {
  id: string
  channel: string
  direction: string
  outcome: string | null
  summary: string | null
  created_at: string | null
}

export interface TimelineActivity {
  id: string
  type: string
  description: string
  created_at?: string | null
}

export interface UnifiedLeadTimelineProps {
  comms: TimelineComm[]
  activities: TimelineActivity[]
}

const CHANNEL_META: Record<string, { icon: string; color: string; bg: string }> = {
  call:    { icon: '📞', color: '#1d4ed8', bg: 'rgba(59,130,246,0.12)' },
  email:   { icon: '✉️', color: '#7c3aed', bg: 'rgba(139,92,246,0.12)' },
  sms:     { icon: '💬', color: '#15803d', bg: 'rgba(34,197,94,0.12)' },
  meeting: { icon: '📅', color: '#b45309', bg: 'rgba(245,158,11,0.14)' },
  other:   { icon: '📌', color: '#64748b', bg: 'rgba(100,116,139,0.12)' },
}

const ACTIVITY_ICON: Record<string, string> = {
  status: '🔁', note: '📝', call: '📞', email: '✉️', meeting: '📅', conversion: '🎯', created: '✨',
}

const timeAgo = (iso?: string | null) => {
  if (!iso) return '—'
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export default function UnifiedLeadTimeline({ comms, activities }: UnifiedLeadTimelineProps) {
  // Build one sorted feed: comms + activities + status changes.
  type Item = { key: string; at: number; kind: 'comm' | 'activity'; comm?: TimelineComm; activity?: TimelineActivity }
  const items: Item[] = [
    ...comms.map((c) => ({ key: 'c-' + c.id, at: Date.parse(c.created_at || '') || 0, kind: 'comm' as const, comm: c })),
    ...activities.map((a) => ({ key: 'a-' + a.id, at: Date.parse(a.created_at || '') || 0, kind: 'activity' as const, activity: a })),
  ]
    .filter((i) => i.at > 0)
    .sort((a, b) => b.at - a.at)

  if (items.length === 0) {
    return (
      <div style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', padding: 16, border: '2px dashed var(--line)', borderRadius: 8 }}>
        No activity yet — add a note or log a call, email, or meeting to start the timeline.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, position: 'relative', paddingLeft: 4 }}>
      {/* Vertical rail */}
      <div style={{ position: 'absolute', left: 13, top: 8, bottom: 8, width: 2, background: 'var(--line)' }} />
      {items.map((item) => {
        if (item.kind === 'comm' && item.comm) {
          const meta = CHANNEL_META[item.comm.channel] || CHANNEL_META.other
          const inbound = item.comm.direction === 'inbound'
          return (
            <div key={item.key} style={{ display: 'flex', gap: 10, padding: '7px 0', position: 'relative' }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', flex: '0 0 28px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', border: `2px solid ${meta.color}`, fontSize: 13, zIndex: 1 }}>
                {meta.icon}
              </div>
              <div style={{ flex: 1, minWidth: 0, padding: '9px 12px', border: '1px solid var(--line)', borderRadius: 8, background: '#fff' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 3, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: meta.color, background: meta.bg, padding: '2px 8px', borderRadius: 999, textTransform: 'capitalize' }}>
                    {item.comm.channel} · {inbound ? 'incoming' : 'outgoing'}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>{timeAgo(item.comm.created_at)}</span>
                </div>
                <div style={{ fontSize: 13.5, color: 'var(--text)' }}>{item.comm.summary || item.comm.outcome?.replace(/_/g, ' ') || 'Logged communication'}</div>
              </div>
            </div>
          )
        }
        if (item.kind === 'activity' && item.activity) {
          const icon = ACTIVITY_ICON[item.activity.type] || '📌'
          const isStatus = item.activity.type === 'status'
          return (
            <div key={item.key} style={{ display: 'flex', gap: 10, padding: '7px 0', position: 'relative' }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', flex: '0 0 28px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: isStatus ? 'rgba(201,168,76,0.18)' : 'var(--cream)', border: `2px solid ${isStatus ? 'var(--gold)' : 'var(--line)'}`, fontSize: 13, zIndex: 1 }}>
                {icon}
              </div>
              <div style={{ flex: 1, minWidth: 0, padding: '9px 12px', border: '1px solid var(--line)', borderRadius: 8, background: isStatus ? '#fdf9ef' : 'var(--cream)' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 3, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--gold-dark)', background: 'rgba(201,168,76,0.15)', padding: '2px 8px', borderRadius: 999, textTransform: 'capitalize' }}>
                    {item.activity.type}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>{timeAgo(item.activity.created_at)}</span>
                </div>
                <div style={{ fontSize: 13.5, color: 'var(--text)' }}>{item.activity.description}</div>
              </div>
            </div>
          )
        }
        return null
      })}
    </div>
  )
}

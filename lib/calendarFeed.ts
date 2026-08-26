// =============================================================================
// Calendar feed — one source for the unified Deal Time view.
// Merges appointments (time-blocked) + reminders/tasks (due-dated) into a
// single day-grouped timeline so the calendar answers "what do I do today?".
// =============================================================================

import { fetchAppointments, type Appointment } from '@/lib/appointments'
import { getAgencyContext } from '@/lib/agencyContext'
import { getStoredAccessToken } from '@/lib/authToken'

export interface TaskItem {
  id: string
  kind: 'task'
  title: string
  due_at: string
  status: string
  entityLabel: string
  entityIcon: string
  notes: string | null
  reminderKind: string
}

export type TimelineItem = Appointment | TaskItem

export interface TimelineDay {
  key: string
  label: string
  items: TimelineItem[]
}

const KIND_ICONS: Record<string, string> = { call_back: '📞', follow_up: '🔁', task: '✅', meeting: '🤝' }

function entityInfo(r: any): { label: string; icon: string } {
  if (r.listings?.business_name) return { label: `${r.listings.business_name}${r.listings.listing_ref ? ` (${r.listings.listing_ref})` : ''}`, icon: '🏢' }
  if (r.buyer_leads?.full_name) return { label: `Buyer: ${r.buyer_leads.full_name}`, icon: '🤝' }
  if (r.seller_leads?.business_name || r.seller_leads?.full_name) return { label: `Seller: ${r.seller_leads.business_name || r.seller_leads.full_name}`, icon: '🏷️' }
  if (r.deals?.title) return { label: `Deal: ${r.deals.title}`, icon: '💼' }
  return { label: '', icon: '📌' }
}

/** Fetch pending tasks via the reminders API (entity joins included). */
export async function fetchTasks(): Promise<TaskItem[]> {
  const ctx = await getAgencyContext()
  if (!ctx) return []
  const token = getStoredAccessToken()
  const res = await fetch(`/api/reminders?agencyId=${ctx.agencyId}&status=pending`, {
    headers: { authorization: `Bearer ${token}` },
  })
  const data = await res.json().catch(() => ({}))
  const reminders = data.reminders || []
  return reminders.map((r: any) => {
    const info = entityInfo(r)
    return {
      id: r.id,
      kind: 'task' as const,
      title: r.title,
      due_at: r.due_at,
      status: r.status || 'pending',
      entityLabel: info.label,
      entityIcon: info.icon,
      notes: r.notes || null,
      reminderKind: r.kind || 'task',
    }
  })
}

/** Merge appointments + tasks into day buckets (today / tomorrow / week / later). */
export function buildTimeline(appointments: Appointment[], tasks: TaskItem[]): TimelineDay[] {
  const items: TimelineItem[] = [...appointments, ...tasks]

  const startOfDay = (d: Date) => {
    const x = new Date(d)
    x.setHours(0, 0, 0, 0)
    return x
  }

  const today = startOfDay(new Date())
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const weekEnd = new Date(today)
  weekEnd.setDate(weekEnd.getDate() + 7)

  const dayKey = (iso: string) => startOfDay(new Date(iso)).toDateString()

  // Bucket items by calendar day for the current week, plus a "later" bucket.
  const itemTime = (item: TimelineItem) =>
    new Date('appointment_type' in item ? (item as Appointment).starts_at : (item as TaskItem).due_at)

  const buckets = new Map<string, TimelineItem[]>()
  const later: TimelineItem[] = []
  for (const item of items) {
    const day = startOfDay(itemTime(item))
    if (day < tomorrow || day <= weekEnd) {
      const key = day.toDateString()
      const list = buckets.get(key) || []
      list.push(item)
      buckets.set(key, list)
    } else {
      later.push(item)
    }
  }

  const sortedKeys = [...buckets.keys()].sort((a, b) => new Date(a).getTime() - new Date(b).getTime())
  const days: TimelineDay[] = sortedKeys.map((key) => {
    const date = new Date(key)
    const label =
      key === today.toDateString()
        ? 'Today'
        : key === tomorrow.toDateString()
          ? 'Tomorrow'
          : date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
    const list = (buckets.get(key) || []).sort((a, b) => itemTime(a).getTime() - itemTime(b).getTime())
    return { key, label, items: list }
  })

  if (later.length > 0) {
    days.push({
      key: 'later',
      label: 'Later',
      items: later.sort((a, b) => itemTime(a).getTime() - itemTime(b).getTime()),
    })
  }

  return days
}

export { KIND_ICONS, entityInfo }

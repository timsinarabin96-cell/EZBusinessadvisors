'use client'

// =============================================================================
// Calendar & Tasks — the unified Deal Time view.
// Appointments (time-blocked) and reminders/tasks (due-dated) share one
// day-grouped timeline, so the calendar answers "what do I do today?".
// =============================================================================

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { Appointment, AppointmentType, createAppointment, fetchAppointments } from '@/lib/appointments'
import { fetchTasks, buildTimeline, type TaskItem } from '@/lib/calendarFeed'
import { getStoredAccessToken } from '@/lib/authToken'

const TYPE_LABELS: Record<AppointmentType, string> = {
  listing: 'Listing appointment',
  buyer: 'Buyer consultation',
  valuation: 'Valuation review',
  due_diligence: 'Due diligence',
  closing: 'Closing',
  general: 'General meeting',
}

const TYPE_COLORS: Record<AppointmentType, string> = {
  listing: '#3b82f6',
  buyer: '#8b5cf6',
  valuation: '#f59e0b',
  due_diligence: '#06b6d4',
  closing: '#22c55e',
  general: '#64748b',
}

const KIND_ICONS: Record<string, string> = { call_back: '📞', follow_up: '🔁', task: '✅', meeting: '🤝' }

function dateTimeLocalValue(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function formatTime(value: string) {
  return new Date(value).toLocaleString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

function formatClock(value: string) {
  return new Date(value).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

function isOverdue(item: TaskItem) {
  return new Date(item.due_at) < new Date()
}

export default function CalendarDashboard() {
  const defaultStart = useMemo(() => {
    const date = new Date()
    date.setDate(date.getDate() + 1)
    date.setHours(10, 0, 0, 0)
    return date
  }, [])
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [tasks, setTasks] = useState<TaskItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [schemaPending, setSchemaPending] = useState(false)
  const [form, setForm] = useState({
    title: 'Listing consultation',
    appointment_type: 'listing' as AppointmentType,
    starts_at: dateTimeLocalValue(defaultStart),
    attendee_name: '',
    attendee_email: '',
    attendee_phone: '',
    notes: '',
  })
  const [taskForm, setTaskForm] = useState({ title: '', due_at: dateTimeLocalValue(defaultStart) })
  const [taskBusy, setTaskBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const from = new Date()
    from.setHours(0, 0, 0, 0)
    const to = new Date(from)
    to.setDate(to.getDate() + 45)
    try {
      const [rows, taskRows] = await Promise.all([fetchAppointments(from, to), fetchTasks()])
      setAppointments(rows)
      setTasks(taskRows)
      setSchemaPending(false)
    } catch (loadError) {
      const message = (loadError as Error).message
      setSchemaPending(message.toLowerCase().includes('appointments'))
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const start = new Date(form.starts_at)
      const end = new Date(start.getTime() + 60 * 60 * 1000)
      await createAppointment({
        ...form,
        starts_at: start.toISOString(),
        ends_at: end.toISOString(),
        location_type: 'phone',
      })
      setForm((current) => ({ ...current, attendee_name: '', attendee_email: '', attendee_phone: '', notes: '' }))
      await load()
    } catch (saveError) {
      setError((saveError as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const addTask = async () => {
    if (!taskForm.title.trim()) return
    setTaskBusy(true)
    const token = getStoredAccessToken()
    const res = await fetch('/api/reminders', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ title: taskForm.title.trim(), due_at: new Date(taskForm.due_at).toISOString(), kind: 'task', assignToMe: true }),
    })
    const data = await res.json().catch(() => ({}))
    setTaskBusy(false)
    if (!res.ok || !data.ok) { setError(data.error || 'Failed to create task'); return }
    setTaskForm({ title: '', due_at: dateTimeLocalValue(defaultStart) })
    await load()
  }

  const setTaskStatus = async (id: string, status: string) => {
    const token = getStoredAccessToken()
    await fetch('/api/reminders', {
      method: 'PATCH',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ reminderId: id, status }),
    })
    await load()
  }

  const days = useMemo(() => buildTimeline(appointments, tasks), [appointments, tasks])

  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <div>
        <h1 style={{ fontFamily: 'Georgia, serif', color: 'var(--navy)', marginBottom: 6 }}>Calendar & Tasks</h1>
        <p style={{ color: 'var(--muted)', margin: 0 }}>
          Appointments and reminders in one timeline — calls, follow-ups, due diligence, closings, and deadlines.
        </p>
      </div>

      {schemaPending && (
        <div style={{ padding: 16, borderRadius: 10, background: '#fff7ed', border: '1px solid #fed7aa', color: '#9a3412' }}>
          Calendar code is installed. Apply <code>sql/ai_operating_system_schema.sql</code> in Supabase before creating appointments.
        </div>
      )}
      {error && !schemaPending && (
        <div style={{ padding: 14, borderRadius: 10, background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b' }}>{error}</div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.5fr) minmax(300px, 0.8fr)', gap: 22, alignItems: 'start' }}>
        {/* Unified timeline */}
        <section style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 22 }}>
          <h2 style={{ marginTop: 0, color: 'var(--navy)', fontFamily: 'Georgia, serif' }}>Up next</h2>
          {loading ? (
            <p style={{ color: 'var(--muted)' }}>Loading your day…</p>
          ) : days.length === 0 ? (
            <div style={{ padding: '34px 16px', textAlign: 'center', color: 'var(--muted)', background: 'var(--cream)', borderRadius: 10 }}>
              Nothing scheduled. Book an appointment or add a task.
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 20 }}>
              {days.map((day) => (
                <div key={day.key}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--navy)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{day.label}</span>
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>{day.items.length} item{day.items.length === 1 ? '' : 's'}</span>
                    <div style={{ flex: 1, height: 1, background: 'var(--line)' }} />
                  </div>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {day.items.map((item) => {
                      if ('appointment_type' in item) {
                        const appt = item as Appointment
                        const accent = TYPE_COLORS[appt.appointment_type] || '#64748b'
                        return (
                          <article key={appt.id} style={{ padding: 13, border: '1px solid var(--line)', borderRadius: 10, borderLeft: `4px solid ${accent}`, display: 'grid', gap: 4, background: '#fff' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                              <strong style={{ color: 'var(--navy)', fontSize: 14 }}>🗓 {appt.title}</strong>
                              <span style={{ fontSize: 11, color: '#166534', background: '#dcfce7', padding: '2px 8px', borderRadius: 999, whiteSpace: 'nowrap' }}>{appt.status}</span>
                            </div>
                            <span style={{ color: 'var(--gold-dark)', fontWeight: 600, fontSize: 13 }}>{formatClock(appt.starts_at)}</span>
                            <span style={{ color: 'var(--muted)', fontSize: 12.5 }}>
                              <span style={{ color: accent, fontWeight: 700 }}>{TYPE_LABELS[appt.appointment_type]}</span>
                              {appt.attendee_name ? ` · ${appt.attendee_name}` : ''}
                            </span>
                          </article>
                        )
                      }
                      const task = item as TaskItem
                      const overdue = isOverdue(task)
                      return (
                        <article key={task.id} style={{ padding: 13, border: '1px solid var(--line)', borderRadius: 10, borderLeft: `4px solid ${overdue ? '#ef4444' : '#c9a84c'}`, display: 'flex', alignItems: 'center', gap: 12, background: overdue ? '#fef7f7' : '#fff' }}>
                          <span style={{ fontSize: 17 }}>{task.entityIcon}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 700, color: 'var(--navy)', fontSize: 14 }}>
                              {KIND_ICONS[task.reminderKind] || '✅'} {task.title}
                              {overdue && <span style={{ fontSize: 11, color: '#ef4444', fontWeight: 800, marginLeft: 6 }}>OVERDUE</span>}
                            </div>
                            <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>
                              {task.entityLabel ? <><span style={{ fontWeight: 600 }}>{task.entityLabel}</span> · </> : ''}
                              due {formatTime(task.due_at)}
                            </div>
                          </div>
                          <button
                            onClick={() => setTaskStatus(task.id, 'done')}
                            style={{ border: '1px solid var(--line)', background: '#fff', borderRadius: 6, padding: '5px 10px', fontSize: 12, cursor: 'pointer', color: 'var(--navy)', whiteSpace: 'nowrap' }}
                            title="Mark done"
                          >
                            ✓ Done
                          </button>
                        </article>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Quick add — appointment + task */}
        <div style={{ display: 'grid', gap: 16 }}>
          <form onSubmit={handleSubmit} style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 20, display: 'grid', gap: 11 }}>
            <h2 style={{ margin: 0, color: 'var(--navy)', fontFamily: 'Georgia, serif', fontSize: 16 }}>🗓 Book appointment</h2>
            <input required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Appointment title" style={inputStyle} />
            <select value={form.appointment_type} onChange={(event) => setForm({ ...form, appointment_type: event.target.value as AppointmentType })} style={inputStyle}>
              {Object.entries(TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <input required type="datetime-local" value={form.starts_at} onChange={(event) => setForm({ ...form, starts_at: event.target.value })} style={inputStyle} />
            <input value={form.attendee_name} onChange={(event) => setForm({ ...form, attendee_name: event.target.value })} placeholder="Attendee name" style={inputStyle} />
            <input type="email" value={form.attendee_email} onChange={(event) => setForm({ ...form, attendee_email: event.target.value })} placeholder="Email" style={inputStyle} />
            <input value={form.attendee_phone} onChange={(event) => setForm({ ...form, attendee_phone: event.target.value })} placeholder="Phone" style={inputStyle} />
            <textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Preparation notes" rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
            <button disabled={saving || schemaPending} style={{ padding: '10px 14px', borderRadius: 8, border: 0, background: 'var(--navy)', color: '#fff', fontWeight: 700, cursor: 'pointer', opacity: saving || schemaPending ? 0.55 : 1 }}>
              {saving ? 'Booking…' : 'Book appointment'}
            </button>
          </form>

          <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 20, display: 'grid', gap: 11 }}>
            <h2 style={{ margin: 0, color: 'var(--navy)', fontFamily: 'Georgia, serif', fontSize: 16 }}>✅ Quick task</h2>
            <input value={taskForm.title} onChange={(event) => setTaskForm({ ...taskForm, title: event.target.value })} placeholder="e.g. Follow up on offer, chase docs…" style={inputStyle} />
            <input type="datetime-local" value={taskForm.due_at} onChange={(event) => setTaskForm({ ...taskForm, due_at: event.target.value })} style={inputStyle} />
            <button onClick={addTask} disabled={taskBusy || !taskForm.title.trim()} style={{ padding: '10px 14px', borderRadius: 8, border: 0, background: 'var(--gold)', color: '#1a1a2e', fontWeight: 700, cursor: 'pointer', opacity: taskBusy || !taskForm.title.trim() ? 0.55 : 1 }}>
              {taskBusy ? 'Adding…' : '+ Add task'}
            </button>
            <p style={{ fontSize: 11.5, color: 'var(--muted)', margin: 0 }}>
              Deep link from deal tools: Deal Doctor, Call Summaries, and NDA flows can auto-create tasks here.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 11px', border: '1px solid var(--line)', borderRadius: 8, background: '#fff', color: 'var(--navy)', boxSizing: 'border-box', fontSize: 13.5,
}

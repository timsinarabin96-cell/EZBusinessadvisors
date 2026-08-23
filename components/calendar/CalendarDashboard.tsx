'use client'

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { Appointment, AppointmentType, createAppointment, fetchAppointments } from '@/lib/appointments'

const TYPE_LABELS: Record<AppointmentType, string> = {
  listing: 'Listing appointment',
  buyer: 'Buyer consultation',
  valuation: 'Valuation review',
  due_diligence: 'Due diligence',
  closing: 'Closing',
  general: 'General meeting',
}

function dateTimeLocalValue(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function formatAppointmentTime(value: string) {
  return new Date(value).toLocaleString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

export default function CalendarDashboard() {
  const defaultStart = useMemo(() => {
    const date = new Date()
    date.setDate(date.getDate() + 1)
    date.setHours(10, 0, 0, 0)
    return date
  }, [])
  const [appointments, setAppointments] = useState<Appointment[]>([])
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

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const from = new Date()
    from.setHours(0, 0, 0, 0)
    const to = new Date(from)
    to.setDate(to.getDate() + 45)
    try {
      const rows = await fetchAppointments(from, to)
      setAppointments(rows)
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

  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <div>
        <h1 style={{ fontFamily: 'Georgia, serif', color: 'var(--navy)', marginBottom: 6 }}>Calendar & Appointments</h1>
        <p style={{ color: 'var(--muted)', margin: 0 }}>
          One schedule for listing calls, buyer consultations, due diligence, closings, and future AI bookings.
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
        <section style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 22 }}>
          <h2 style={{ marginTop: 0, color: 'var(--navy)', fontFamily: 'Georgia, serif' }}>Next 45 days</h2>
          {loading ? (
            <p style={{ color: 'var(--muted)' }}>Loading appointments…</p>
          ) : appointments.length === 0 ? (
            <div style={{ padding: '34px 16px', textAlign: 'center', color: 'var(--muted)', background: 'var(--cream)', borderRadius: 10 }}>
              No appointments scheduled yet.
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {appointments.map((appointment) => (
                <article key={appointment.id} style={{ padding: 16, border: '1px solid var(--line)', borderRadius: 10, display: 'grid', gap: 5 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <strong style={{ color: 'var(--navy)' }}>{appointment.title}</strong>
                    <span style={{ fontSize: 12, color: '#166534', background: '#dcfce7', padding: '3px 8px', borderRadius: 999 }}>{appointment.status}</span>
                  </div>
                  <span style={{ color: 'var(--gold-dark)', fontWeight: 600 }}>{formatAppointmentTime(appointment.starts_at)}</span>
                  <span style={{ color: 'var(--muted)', fontSize: 13 }}>
                    {TYPE_LABELS[appointment.appointment_type]}{appointment.attendee_name ? ` · ${appointment.attendee_name}` : ''}
                  </span>
                </article>
              ))}
            </div>
          )}
        </section>

        <form onSubmit={handleSubmit} style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 22, display: 'grid', gap: 13 }}>
          <h2 style={{ margin: 0, color: 'var(--navy)', fontFamily: 'Georgia, serif' }}>Book appointment</h2>
          <input required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Appointment title" style={inputStyle} />
          <select value={form.appointment_type} onChange={(event) => setForm({ ...form, appointment_type: event.target.value as AppointmentType })} style={inputStyle}>
            {Object.entries(TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <input required type="datetime-local" value={form.starts_at} onChange={(event) => setForm({ ...form, starts_at: event.target.value })} style={inputStyle} />
          <input value={form.attendee_name} onChange={(event) => setForm({ ...form, attendee_name: event.target.value })} placeholder="Attendee name" style={inputStyle} />
          <input type="email" value={form.attendee_email} onChange={(event) => setForm({ ...form, attendee_email: event.target.value })} placeholder="Email" style={inputStyle} />
          <input value={form.attendee_phone} onChange={(event) => setForm({ ...form, attendee_phone: event.target.value })} placeholder="Phone" style={inputStyle} />
          <textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Preparation notes" rows={4} style={{ ...inputStyle, resize: 'vertical' }} />
          <button disabled={saving || schemaPending} style={{ padding: '11px 14px', borderRadius: 8, border: 0, background: 'var(--navy)', color: '#fff', fontWeight: 700, cursor: 'pointer', opacity: saving || schemaPending ? 0.55 : 1 }}>
            {saving ? 'Booking…' : 'Book appointment'}
          </button>
        </form>
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 11px', border: '1px solid var(--line)', borderRadius: 8, background: '#fff', color: 'var(--navy)', boxSizing: 'border-box',
}

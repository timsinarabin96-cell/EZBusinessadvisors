/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { supabase } from '@/lib/supabase/client'
import { getAgencyContext } from '@/lib/agencyContext'

export type AppointmentStatus = 'tentative' | 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'no_show'
export type AppointmentType = 'listing' | 'buyer' | 'valuation' | 'due_diligence' | 'closing' | 'general'

export interface Appointment {
  id: string
  agency_id: string
  assigned_to: string | null
  created_by: string | null
  title: string
  appointment_type: AppointmentType
  status: AppointmentStatus
  starts_at: string
  ends_at: string
  timezone: string
  location_type: string
  location: string | null
  attendee_name: string | null
  attendee_email: string | null
  attendee_phone: string | null
  notes: string | null
  source: string
  created_at: string
}

export type AppointmentInput = Pick<Appointment, 'title' | 'appointment_type' | 'starts_at' | 'ends_at'> &
  Partial<Pick<Appointment, 'status' | 'timezone' | 'location_type' | 'location' | 'attendee_name' | 'attendee_email' | 'attendee_phone' | 'notes' | 'source'>>

export async function fetchAppointments(from: Date, to: Date): Promise<Appointment[]> {
  const context = await getAgencyContext()
  if (!context) return []

  const { data, error } = await supabase
    .from('appointments')
    .select('*')
    .eq('agency_id', context.agencyId)
    .gte('starts_at', from.toISOString())
    .lt('starts_at', to.toISOString())
    .order('starts_at', { ascending: true })

  if (error) {
    if (error.code === '42P01') return []
    throw new Error(error.message || 'Failed to load appointments')
  }
  return (data as Appointment[]) || []
}

export async function createAppointment(input: AppointmentInput): Promise<Appointment> {
  const context = await getAgencyContext()
  if (!context) throw new Error('An agency membership is required to create appointments')

  const { data, error } = await supabase
    .from('appointments')
    .insert({
      agency_id: context.agencyId,
      assigned_to: context.userId,
      created_by: context.userId,
      title: input.title,
      appointment_type: input.appointment_type,
      status: input.status || 'scheduled',
      starts_at: input.starts_at,
      ends_at: input.ends_at,
      timezone: input.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York',
      location_type: input.location_type || 'phone',
      location: input.location || null,
      attendee_name: input.attendee_name || null,
      attendee_email: input.attendee_email || null,
      attendee_phone: input.attendee_phone || null,
      notes: input.notes || null,
      source: input.source || 'manual',
    })
    .select()
    .single()

  if (error) throw new Error(error.message || 'Failed to create appointment')
  return data as Appointment
}

export async function updateAppointment(id: string, input: AppointmentInput): Promise<Appointment> {
  const { data, error } = await supabase
    .from('appointments')
    .update({
      title: input.title,
      appointment_type: input.appointment_type,
      status: input.status || 'scheduled',
      starts_at: input.starts_at,
      ends_at: input.ends_at,
      attendee_name: input.attendee_name || null,
      attendee_email: input.attendee_email || null,
      attendee_phone: input.attendee_phone || null,
      notes: input.notes || null,
      location_type: input.location_type || 'phone',
    })
    .eq('id', id)
    .select()
    .single()

  if (error) throw new Error(error.message || 'Failed to update appointment')
  return data as Appointment
}



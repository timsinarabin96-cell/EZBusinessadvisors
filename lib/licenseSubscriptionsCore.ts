/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// License subscription CORE — pure math + domain rules (no server imports).
// -----------------------------------------------------------------------------
// Phase 3 (locked 08-31): recurring CRM subscriptions. 3 seats are included in
// the base plan; every seat after that is a $25/seat/mo add-on (annual $250 =
// 2 months free parity). This module is imported by the server lib, API routes,
// the webhook, AND unit tests — one source of truth for seat math, totals, and
// Stripe price lookup keys.
// =============================================================================

import {
  CRM_MONTHLY, CRM_ANNUAL, CRM_ENTERPRISE_MONTHLY, CRM_ENTERPRISE_ANNUAL,
  LICENSE_SEATS_INCLUDED, SEAT_ADDON_MONTHLY, SEAT_ADDON_ANNUAL,
  cents,
} from './pricing.ts'

export type LicensePlanType = 'professional' | 'enterprise'
export type LicenseBillingCycle = 'monthly' | 'annual'
export type LicenseStatus = 'active' | 'past_due' | 'canceled' | 'trialing'

// --- Seat add-on math --------------------------------------------------------
/** Number of PAID add-on seats for a given total seat count (3 included). */
export function seatAddonQty(seats: number): number {
  return Math.max(0, Math.floor(seats) - LICENSE_SEATS_INCLUDED)
}

/** Total seats (included + add-ons) from an add-on quantity. */
export function totalSeatsFromAddon(addonQty: number): number {
  return LICENSE_SEATS_INCLUDED + Math.max(0, Math.floor(addonQty))
}

// --- Totals -------------------------------------------------------------------
export function licenseBaseMonthly(planType: LicensePlanType): number {
  return planType === 'enterprise' ? CRM_ENTERPRISE_MONTHLY : CRM_MONTHLY
}

export function licenseBaseAnnual(planType: LicensePlanType): number {
  return planType === 'enterprise' ? CRM_ENTERPRISE_ANNUAL : CRM_ANNUAL
}

export function licenseBaseCents(planType: LicensePlanType, cycle: LicenseBillingCycle): number {
  return cents(cycle === 'annual' ? licenseBaseAnnual(planType) : licenseBaseMonthly(planType))
}


/** Seat add-on total in dollars for a seat count (already includes the 3-free rule). */
export function licenseSeatAddonDollars(seats: number, cycle: LicenseBillingCycle): number {
  return seatAddonQty(seats) * (cycle === 'annual' ? SEAT_ADDON_ANNUAL : SEAT_ADDON_MONTHLY)
}

/** Full recurring total in cents for a plan + cycle + seats. */
export function licenseTotalCents(planType: LicensePlanType, cycle: LicenseBillingCycle, seats: number): number {
  return licenseBaseCents(planType, cycle) + cents(licenseSeatAddonDollars(seats, cycle))
}

/** Seat add-on price in cents (used to identify the seat item in Stripe). */
export function licenseSeatAddonCents(cycle: LicenseBillingCycle): number {
  return cents(cycle === 'annual' ? SEAT_ADDON_ANNUAL : SEAT_ADDON_MONTHLY)
}

// --- Status mapping (Stripe subscription → licenses.status) ------------------
export function licenseStatusFromStripe(stripeStatus: string | null | undefined): LicenseStatus {
  switch (stripeStatus) {
    case 'active': return 'active'
    case 'trialing': return 'trialing'
    case 'past_due':
    case 'unpaid':
    case 'incomplete': return 'past_due'
    case 'canceled':
    case 'incomplete_expired': return 'canceled'
    default: return 'past_due'
  }
}

/** Does this license status grant the agency full access? */
export function licenseAccessGranted(status: LicenseStatus | string | null | undefined): boolean {
  return status === 'active' || status === 'trialing'
}

// --- Stripe price lookup keys (created idempotently on demand) ---------------
export interface LicensePriceKeys {
  basePriceId: string
  seatPriceId: string
}

export function licenseBaseLookupKey(planType: LicensePlanType, cycle: LicenseBillingCycle): string {
  return `crm_base_${planType}_${cycle}`
}

export function licenseSeatLookupKey(cycle: LicenseBillingCycle): string {
  return `crm_seat_${cycle}`
}

export function licenseBaseProductName(planType: LicensePlanType): string {
  return planType === 'enterprise' ? 'Concord CRM — Enterprise' : 'Concord CRM — Professional'
}

export function licenseSeatProductName(): string {
  return 'Concord CRM — Additional Seat'
}

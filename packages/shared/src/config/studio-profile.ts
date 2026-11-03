/**
 * A studio's business profile: how clients pay and which optional areas it uses.
 * The profile only decides what is ON by default; the studio can switch any of it
 * off, and an operator can override per studio. Core features (clients, payments,
 * refunds, expenses, emails, health declarations, client portal, branding) have no
 * gate and are never switched by the profile.
 *
 * The database is the single source of truth: `feature_definitions.profile_gate`
 * and `get_tenant_features()`. PROFILE_GATES mirrors that seed so the app can
 * preview a profile (for example in the set-up wizard) before it is saved; the
 * test `studio-profile.test.ts` fails if the two ever disagree.
 *
 * Money never reads this: the monthly run, renewal billing and payment recording
 * must keep working whatever is switched off.
 */
import { FEATURES, type FeatureKey } from './feature-registry.js'

export type PaymentFlow = 'recurring' | 'project' | 'both'

export interface StudioProfile {
  paymentFlow: PaymentFlow
  teachesClasses: boolean
  familyAccounts: boolean
  clientBooking: boolean
}

export type ProfileGate = 'recurring' | 'project' | 'teaches_classes' | 'family_accounts' | 'client_booking'

/** A new studio starts general: both payment flows, every switch off. */
export const GENERAL_PROFILE: StudioProfile = {
  paymentFlow: 'both',
  teachesClasses: false,
  familyAccounts: false,
  clientBooking: false,
}

/** Keys that need a profile setting. Anything not listed here is core. */
export const PROFILE_GATES: Partial<Record<FeatureKey, ProfileGate>> = {
  [FEATURES.billing.recurring]: 'recurring',
  [FEATURES.billing.dunning]: 'recurring',
  [FEATURES.billing.quotes]: 'project',
  [FEATURES.billing.gatedDelivery]: 'project',
  [FEATURES.scheduling.clientBooking]: 'client_booking',
  [FEATURES.scheduling.adminBooking]: 'client_booking',
  [FEATURES.scheduling.googleCalendar]: 'client_booking',
  [FEATURES.scheduling.penalties]: 'client_booking',
  [FEATURES.offerings.structure]: 'teaches_classes',
  [FEATURES.offerings.publicBooking]: 'teaches_classes',
  [FEATURES.scheduling.calendarView]: 'teaches_classes',
  [FEATURES.people.families]: 'family_accounts',
}

export function profileHasGate(profile: StudioProfile, gate: ProfileGate): boolean {
  switch (gate) {
    case 'recurring':
      return profile.paymentFlow !== 'project'
    case 'project':
      return profile.paymentFlow !== 'recurring'
    case 'teaches_classes':
      return profile.teachesClasses
    case 'family_accounts':
      return profile.familyAccounts
    case 'client_booking':
      return profile.clientBooking
  }
}

/** Gated features this profile turns on by default (core features are not listed). */
export function defaultFeatureKeys(profile: StudioProfile): FeatureKey[] {
  return (Object.entries(PROFILE_GATES) as [FeatureKey, ProfileGate][])
    .filter(([, gate]) => profileHasGate(profile, gate))
    .map(([key]) => key)
}

/** Map the tenants row (snake_case) to a profile. */
export function profileFromTenant(row: {
  payment_flow: string
  teaches_classes: boolean
  family_accounts: boolean
  client_booking: boolean
}): StudioProfile {
  const flow = row.payment_flow
  return {
    paymentFlow: flow === 'recurring' || flow === 'project' ? flow : 'both',
    teachesClasses: row.teaches_classes,
    familyAccounts: row.family_accounts,
    clientBooking: row.client_booking,
  }
}

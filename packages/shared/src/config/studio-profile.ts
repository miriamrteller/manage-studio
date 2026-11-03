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
import {
  resolveEntityLabels,
  resolveVerticalLabels,
  type EntityLabelLocale,
  type EntityLabels,
  type VerticalId,
} from './tenant-presets.js'

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

/**
 * What a studio that exists today has: everything on. A row without profile fields
 * (an older cached response, a test fixture) reads as this, so nothing changes for it.
 */
export const EXISTING_STUDIO_PROFILE: StudioProfile = {
  paymentFlow: 'both',
  teachesClasses: true,
  familyAccounts: true,
  clientBooking: true,
}

/** Map the tenants row (snake_case) to a profile; a missing field reads as "on". */
export function profileFromTenant(row: {
  payment_flow?: string | null
  teaches_classes?: boolean | null
  family_accounts?: boolean | null
  client_booking?: boolean | null
}): StudioProfile {
  const flow = row.payment_flow
  return {
    paymentFlow: flow === 'recurring' || flow === 'project' ? flow : 'both',
    teachesClasses: row.teaches_classes ?? true,
    familyAccounts: row.family_accounts ?? true,
    clientBooking: row.client_booking ?? true,
  }
}

/**
 * General wording for a studio that does not teach classes: a Client buys a Service
 * and has Projects and Sessions. Nothing here is class vocabulary.
 */
const GENERAL_LABELS: Record<EntityLabelLocale, EntityLabels> = {
  en: {
    contact: { singular: 'Client', plural: 'Clients' },
    account: { singular: 'Client', plural: 'Clients' },
    offering: { singular: 'Service', plural: 'Services' },
    season: { singular: 'Season', plural: 'Seasons' },
    category: { singular: 'Category', plural: 'Categories' },
    staff: { singular: 'Team member', plural: 'Team' },
    engagement: { singular: 'Project', plural: 'Projects' },
    session: { singular: 'Session', plural: 'Sessions' },
  },
  he: {
    contact: { singular: 'לקוח', plural: 'לקוחות' },
    account: { singular: 'לקוח', plural: 'לקוחות' },
    offering: { singular: 'שירות', plural: 'שירותים' },
    season: { singular: 'עונה', plural: 'עונות' },
    category: { singular: 'קטגוריה', plural: 'קטגוריות' },
    staff: { singular: 'איש צוות', plural: 'צוות' },
    engagement: { singular: 'פרויקט', plural: 'פרויקטים' },
    session: { singular: 'מפגש', plural: 'מפגשים' },
  },
}

/**
 * The studio's words. A studio that teaches classes keeps the wording it has today
 * (class vocabulary plus any skin layer). Any other studio starts from the general
 * wording. In both cases the studio's own word overrides win last.
 */
export function resolveStudioLabels(
  profile: StudioProfile,
  overrides: Partial<EntityLabels> = {},
  locale: EntityLabelLocale = 'en',
  vertical: VerticalId = 'generic',
): EntityLabels {
  if (profile.teachesClasses) return resolveEntityLabels('programs', overrides, locale, vertical)
  return { ...GENERAL_LABELS[locale], ...resolveVerticalLabels(vertical, locale), ...overrides }
}

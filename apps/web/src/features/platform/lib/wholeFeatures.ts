import { FEATURES, type FeatureKey, type PaymentFlow, type StudioProfile } from '@shared/index';
import type { FeatureState } from '../types/feature-admin';

/**
 * Platform -> Features: one tick per whole feature (owner, 9 Nov 2026).
 *
 * The four business ticks ARE the studio's "Your business" answers (set_business_profile), so the
 * owner's tick and the studio's answer can never disagree. The others are a per-studio override
 * on one feature key. Every other key in feature_definitions is either core (always on) or not
 * built yet, and is not shown. Superadmin is never a studio feature and is never shown.
 */
export type WholeFeatureId =
  | 'classes'
  | 'families'
  | 'monthly'
  | 'projects'
  | 'booking'
  | 'google_calendar'
  | 'photo_shop'
  | 'takbull_testing';

export interface WholeFeature {
  id: WholeFeatureId;
  /** profile = a "Your business" answer; override = a per-studio override on featureKey. */
  kind: 'profile' | 'override';
  featureKey?: FeatureKey;
  /** Part of another feature: shown under it, only switchable while it is on. */
  partOf?: WholeFeatureId;
  section: 'features' | 'beta' | 'testing';
  /** Only on the dev website (never an option on the live site). */
  devOnly?: boolean;
}

export const WHOLE_FEATURES: readonly WholeFeature[] = [
  { id: 'classes', kind: 'profile', section: 'features' },
  { id: 'families', kind: 'profile', partOf: 'classes', section: 'features' },
  { id: 'monthly', kind: 'profile', section: 'features' },
  { id: 'projects', kind: 'profile', section: 'features' },
  { id: 'booking', kind: 'profile', section: 'features' },
  {
    id: 'google_calendar',
    kind: 'override',
    featureKey: FEATURES.scheduling.googleCalendar,
    partOf: 'booking',
    section: 'features',
  },
  { id: 'photo_shop', kind: 'override', featureKey: FEATURES.billing.photoShop, section: 'beta' },
  {
    id: 'takbull_testing',
    kind: 'override',
    featureKey: FEATURES.billing.takbullTesting,
    section: 'testing',
    devOnly: true,
  },
];

/** The features listed on this site. devSite = the dev website (or a local dev build). */
export function listedFeatures(devSite: boolean): WholeFeature[] {
  return WHOLE_FEATURES.filter((f) => devSite || !f.devOnly);
}

/** Pure: is this whole feature on for the studio now. */
export function isOn(feature: WholeFeature, profile: StudioProfile, states: readonly FeatureState[]): boolean {
  switch (feature.id) {
    case 'classes':
      return profile.teachesClasses;
    case 'families':
      return profile.teachesClasses && profile.familyAccounts;
    case 'monthly':
      return profile.paymentFlow !== 'project';
    case 'projects':
      return profile.paymentFlow !== 'recurring';
    case 'booking':
      return profile.clientBooking;
    default:
      return states.find((s) => s.feature_key === feature.featureKey)?.effective ?? false;
  }
}

/** Pure: the payment flow after ticking monthly or projects. null = would leave no way to charge. */
export function nextPaymentFlow(current: PaymentFlow, id: 'monthly' | 'projects', on: boolean): PaymentFlow | null {
  const monthly = id === 'monthly' ? on : current !== 'project';
  const projects = id === 'projects' ? on : current !== 'recurring';
  if (monthly && projects) return 'both';
  if (monthly) return 'recurring';
  if (projects) return 'project';
  return null;
}

/** Arguments for set_business_profile when a business tick changes (only the changed answers). */
export function profilePatch(
  id: WholeFeatureId,
  on: boolean,
  profile: StudioProfile,
): Record<string, string | boolean> | null {
  switch (id) {
    case 'classes':
      // Families is part of classes: switching classes off switches families off too.
      return on ? { p_teaches_classes: true } : { p_teaches_classes: false, p_family_accounts: false };
    case 'families':
      return { p_family_accounts: on };
    case 'booking':
      return { p_client_booking: on };
    case 'monthly':
    case 'projects': {
      const flow = nextPaymentFlow(profile.paymentFlow, id, on);
      return flow ? { p_payment_flow: flow } : null;
    }
    default:
      return null;
  }
}

/** Pure: why a tick can't be changed right now, or null. */
export function lockReason(
  feature: WholeFeature,
  profile: StudioProfile,
  states: readonly FeatureState[],
): 'needs_parent' | 'last_payment_way' | null {
  if (feature.partOf) {
    const parent = WHOLE_FEATURES.find((f) => f.id === feature.partOf)!;
    if (!isOn(parent, profile, states)) return 'needs_parent';
  }
  if ((feature.id === 'monthly' || feature.id === 'projects') && isOn(feature, profile, states)) {
    if (nextPaymentFlow(profile.paymentFlow, feature.id, false) === null) return 'last_payment_way';
  }
  return null;
}

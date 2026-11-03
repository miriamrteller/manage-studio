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
import { type FeatureKey } from './feature-registry.js';
export type PaymentFlow = 'recurring' | 'project' | 'both';
export interface StudioProfile {
    paymentFlow: PaymentFlow;
    teachesClasses: boolean;
    familyAccounts: boolean;
    clientBooking: boolean;
}
export type ProfileGate = 'recurring' | 'project' | 'teaches_classes' | 'family_accounts' | 'client_booking';
/** A new studio starts general: both payment flows, every switch off. */
export declare const GENERAL_PROFILE: StudioProfile;
/** Keys that need a profile setting. Anything not listed here is core. */
export declare const PROFILE_GATES: Partial<Record<FeatureKey, ProfileGate>>;
export declare function profileHasGate(profile: StudioProfile, gate: ProfileGate): boolean;
/** Gated features this profile turns on by default (core features are not listed). */
export declare function defaultFeatureKeys(profile: StudioProfile): FeatureKey[];
/** Map the tenants row (snake_case) to a profile. */
export declare function profileFromTenant(row: {
    payment_flow: string;
    teaches_classes: boolean;
    family_accounts: boolean;
    client_booking: boolean;
}): StudioProfile;
//# sourceMappingURL=studio-profile.d.ts.map
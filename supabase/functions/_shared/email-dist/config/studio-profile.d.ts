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
import { type EntityLabelLocale, type EntityLabels, type VerticalId } from './tenant-presets.js';
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
/**
 * What a typical studio that exists today has: monthly plans, classes, families and booking on,
 * no projects. A row without profile fields (an older cached response, a test fixture, the
 * moment before the studio loads) reads as this, so the menu does not flicker or change.
 */
export declare const EXISTING_STUDIO_PROFILE: StudioProfile;
/** Map the tenants row (snake_case) to a profile; a missing field reads as an existing studio, an unknown flow as both. */
export declare function profileFromTenant(row: {
    payment_flow?: string | null;
    teaches_classes?: boolean | null;
    family_accounts?: boolean | null;
    client_booking?: boolean | null;
}): StudioProfile;
/**
 * The studio's words. A studio that teaches classes keeps the wording it has today
 * (class vocabulary plus any skin layer). Any other studio starts from the general
 * wording. In both cases the studio's own word overrides win last.
 */
export declare function resolveStudioLabels(profile: StudioProfile, overrides?: Partial<EntityLabels>, locale?: EntityLabelLocale, vertical?: VerticalId, 
/** A data skin's own wording (skinLabelsFor); the studio's own words still win. */
skinLabels?: Partial<EntityLabels>): EntityLabels;
//# sourceMappingURL=studio-profile.d.ts.map
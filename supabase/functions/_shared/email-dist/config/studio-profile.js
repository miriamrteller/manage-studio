/* @ts-self-types="./studio-profile.d.ts" */
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
import { FEATURES } from './feature-registry.js';
import { resolveEntityLabels, resolveVerticalLabels, } from './tenant-presets.js';
/** A new studio starts general: both payment flows, every switch off. */
export const GENERAL_PROFILE = {
    paymentFlow: 'both',
    teachesClasses: false,
    familyAccounts: false,
    clientBooking: false,
};
/** Keys that need a profile setting. Anything not listed here is core. */
export const PROFILE_GATES = {
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
};
export function profileHasGate(profile, gate) {
    switch (gate) {
        case 'recurring':
            return profile.paymentFlow !== 'project';
        case 'project':
            return profile.paymentFlow !== 'recurring';
        case 'teaches_classes':
            return profile.teachesClasses;
        case 'family_accounts':
            return profile.familyAccounts;
        case 'client_booking':
            return profile.clientBooking;
    }
}
/** Gated features this profile turns on by default (core features are not listed). */
export function defaultFeatureKeys(profile) {
    return Object.entries(PROFILE_GATES)
        .filter(([, gate]) => profileHasGate(profile, gate))
        .map(([key]) => key);
}
/**
 * What a studio that exists today has: everything on. A row without profile fields
 * (an older cached response, a test fixture) reads as this, so nothing changes for it.
 */
export const EXISTING_STUDIO_PROFILE = {
    paymentFlow: 'both',
    teachesClasses: true,
    familyAccounts: true,
    clientBooking: true,
};
/** Map the tenants row (snake_case) to a profile; a missing field reads as "on". */
export function profileFromTenant(row) {
    const flow = row.payment_flow;
    return {
        paymentFlow: flow === 'recurring' || flow === 'project' ? flow : 'both',
        teachesClasses: row.teaches_classes ?? true,
        familyAccounts: row.family_accounts ?? true,
        clientBooking: row.client_booking ?? true,
    };
}
/**
 * General wording for a studio that does not teach classes: a Client buys a Service
 * and has Projects and Sessions. Nothing here is class vocabulary.
 */
const GENERAL_LABELS = {
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
};
/**
 * The studio's words. A studio that teaches classes keeps the wording it has today
 * (class vocabulary plus any skin layer). Any other studio starts from the general
 * wording. In both cases the studio's own word overrides win last.
 */
export function resolveStudioLabels(profile, overrides = {}, locale = 'en', vertical = 'generic') {
    if (profile.teachesClasses)
        return resolveEntityLabels('programs', overrides, locale, vertical);
    return { ...GENERAL_LABELS[locale], ...resolveVerticalLabels(vertical, locale), ...overrides };
}

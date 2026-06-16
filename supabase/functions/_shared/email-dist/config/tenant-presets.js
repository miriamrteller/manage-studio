import { z } from 'zod';
const DEFAULT_LABELS = {
    programs: {
        contact: { singular: 'Student', plural: 'Students' },
        account: { singular: 'Family', plural: 'Families' },
        offering: { singular: 'Class', plural: 'Classes' },
        season: { singular: 'Term', plural: 'Terms' },
        category: { singular: 'Level', plural: 'Levels' },
        staff: { singular: 'Teacher', plural: 'Teachers' },
        engagement: { singular: 'Enrolment', plural: 'Enrolments' },
        session: { singular: 'Session', plural: 'Sessions' },
    },
    services: {
        contact: { singular: 'Contact', plural: 'Contacts' },
        account: { singular: 'Client', plural: 'Clients' },
        offering: { singular: 'Service', plural: 'Services' },
        season: { singular: 'Quarter', plural: 'Quarters' },
        category: { singular: 'Category', plural: 'Categories' },
        staff: { singular: 'Team member', plural: 'Team' },
        engagement: { singular: 'Engagement', plural: 'Engagements' },
        session: { singular: 'Session', plural: 'Sessions' },
    },
    catalog: {
        contact: { singular: 'Customer', plural: 'Customers' },
        account: { singular: 'Account', plural: 'Accounts' },
        offering: { singular: 'Product', plural: 'Products' },
        season: { singular: 'Season', plural: 'Seasons' },
        category: { singular: 'Category', plural: 'Categories' },
        staff: { singular: 'Staff', plural: 'Staff' },
        engagement: { singular: 'Order', plural: 'Orders' },
        session: { singular: 'Session', plural: 'Sessions' },
    },
};
const PRESET_MODULES = {
    programs: {
        accounts: true,
        scheduling: true,
        attendance: true,
        waitlist: true,
        consent: true,
        eligibility: true,
        categories: true,
        staff: true,
    },
    services: {
        accounts: true,
        scheduling: false,
        attendance: false,
        waitlist: false,
        consent: false,
        eligibility: false,
        categories: false,
        staff: false,
    },
    catalog: {
        accounts: false,
        scheduling: false,
        attendance: false,
        waitlist: false,
        consent: false,
        eligibility: false,
        categories: true,
        staff: false,
    },
};
const EntityLabelPairSchema = z.object({
    singular: z.string(),
    plural: z.string(),
});
const EntityLabelsOverrideSchema = z
    .object({
    contact: EntityLabelPairSchema.optional(),
    account: EntityLabelPairSchema.optional(),
    offering: EntityLabelPairSchema.optional(),
    season: EntityLabelPairSchema.optional(),
    category: EntityLabelPairSchema.optional(),
    staff: EntityLabelPairSchema.optional(),
    engagement: EntityLabelPairSchema.optional(),
    session: EntityLabelPairSchema.optional(),
})
    .partial();
export function parseEntityLabelOverrides(raw) {
    try {
        const result = EntityLabelsOverrideSchema.safeParse(typeof raw === 'string' ? JSON.parse(raw) : raw);
        return result.success ? result.data : {};
    }
    catch {
        return {};
    }
}
export function safePreset(raw) {
    if (raw === 'programs' || raw === 'services' || raw === 'catalog')
        return raw;
    return 'programs';
}
export function resolvePresetModules(preset) {
    return PRESET_MODULES[preset];
}
export function resolveEntityLabels(preset, overrides = {}) {
    return { ...DEFAULT_LABELS[preset], ...overrides };
}
export function getDefaultRoleForPreset(preset) {
    switch (preset) {
        case 'catalog':
            return 'customer';
        case 'services':
            return 'client';
        default:
            return 'account_holder';
    }
}

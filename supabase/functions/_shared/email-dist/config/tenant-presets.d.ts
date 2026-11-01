export type BusinessPreset = 'programs' | 'services' | 'catalog';
export type EntityKey = 'contact' | 'account' | 'offering' | 'season' | 'category' | 'staff' | 'engagement' | 'session';
export type EntityLabels = Record<EntityKey, {
    singular: string;
    plural: string;
}>;
export type PresetModules = {
    accounts: boolean;
    scheduling: boolean;
    attendance: boolean;
    waitlist: boolean;
    consent: boolean;
    eligibility: boolean;
    categories: boolean;
    staff: boolean;
};
export type EntityLabelLocale = 'en' | 'he';
/**
 * Vertical (tenants.skin / verticals.id). Appointment-based verticals reuse
 * the `services` preset's modules but carry their own vocabulary: a
 * photographer's engagement is a Shoot, their offering a Package.
 */
export type VerticalId = 'photographer' | 'beautician' | 'dance-studio' | 'generic';
export declare const APPOINTMENT_VERTICALS: readonly VerticalId[];
export declare function safeVertical(raw: unknown): VerticalId;
export declare function isAppointmentVertical(vertical: VerticalId): boolean;
export declare function parseEntityLabelOverrides(raw: unknown): Partial<EntityLabels>;
export declare function safePreset(raw: unknown): BusinessPreset;
export declare function resolvePresetModules(preset: BusinessPreset): PresetModules;
export declare function resolveEntityLabels(preset: BusinessPreset, overrides?: Partial<EntityLabels>, locale?: EntityLabelLocale, vertical?: VerticalId): EntityLabels;
export declare function getDefaultRoleForPreset(preset: BusinessPreset): string;
//# sourceMappingURL=tenant-presets.d.ts.map
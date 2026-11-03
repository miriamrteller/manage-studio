import type { EntityKey, EntityLabelLocale, EntityLabels, VerticalId } from './tenant-presets.js';
import type { PaymentFlow, StudioProfile } from './studio-profile.js';
import { type PresetKey } from '../leadForm.js';
/** Any skin id (tenants.skin / verticals.id). Built-in ones are also a VerticalId. */
export type SkinId = string;
export declare const BUILT_IN_SKINS: readonly VerticalId[];
export declare function isBuiltInSkin(id: string | null | undefined): id is VerticalId;
export type SkinStatus = 'draft' | 'live';
/** The existing 07c add-ons a skin can bring. */
export declare const LEGAL_ADDONS: readonly ["photographer", "beautician", "coaching"];
export type LegalAddon = (typeof LEGAL_ADDONS)[number];
/** The main nouns a skin may rename (the same keys as the studio's own wording). */
export declare const SKIN_NOUN_KEYS: readonly EntityKey[];
export declare const SKIN_ID_RE: RegExp;
/** Default switches for NEW studios on this skin. Missing = the general default. */
export interface SkinSwitches {
    paymentFlow?: PaymentFlow;
    teachesClasses?: boolean;
    familyAccounts?: boolean;
    clientBooking?: boolean;
    /** The health-declaration setting (being added in another change); optional until then. */
    healthDeclaration?: boolean;
}
export type SkinLabels = Partial<Record<EntityLabelLocale, Partial<EntityLabels>>>;
export interface Skin {
    id: SkinId;
    nameEn: string;
    nameHe: string;
    hintEn: string;
    hintHe: string;
    status: SkinStatus;
    marketingPages: string[];
    switches: SkinSwitches;
    labels: SkinLabels;
    legalAddon: LegalAddon | null;
    enquiryPresets: PresetKey[];
    colours: {
        primary?: string;
        accent?: string;
    };
    sortOrder: number;
}
/** Columns read from `verticals`. */
export declare const SKIN_COLUMNS = "id, name_en, name_he, hint_en, hint_he, status, marketing_pages, default_switches, label_overrides, legal_addon, enquiry_presets, colours, sort_order";
export declare function parseSkinSwitches(raw: unknown): SkinSwitches;
export declare function parseSkinLabels(raw: unknown): SkinLabels;
export declare function parseSkinRow(row: Record<string, unknown>): Skin;
/** The row written to `verticals` for a skin (empty wording pairs are dropped). */
export declare function toSkinRow(skin: Skin): {
    id: string;
    name_en: string;
    name_he: string;
    hint_en: string;
    hint_he: string;
    status: SkinStatus;
    marketing_pages: string[];
    default_switches: Record<string, unknown>;
    label_overrides: Record<string, Partial<EntityLabels>>;
    legal_addon: "photographer" | "beautician" | "coaching" | null;
    enquiry_presets: PresetKey[];
    colours: {
        primary?: string;
        accent?: string;
    };
    sort_order: number;
};
/** Problems that stop a skin from being saved (keys for the form's messages). */
export declare function skinErrors(skin: Skin): string[];
/** The skin's own main-noun wording. Empty for built-in skins: their code wording stays. */
export declare function skinLabelsFor(skin: Pick<Skin, 'id' | 'labels'> | null | undefined, locale: EntityLabelLocale): Partial<EntityLabels>;
/** The business profile the wizard prefills for a skin; missing switches keep the fallback. */
export declare function profileFromSkin(skin: Pick<Skin, 'switches'>, fallback: StudioProfile): StudioProfile;
/** The live skin a marketing industry page points to (by page slug), if any. */
export declare function skinForMarketingPage<T extends Pick<Skin, 'status' | 'marketingPages'>>(skins: T[], page: string | null | undefined): T | null;
export declare function skinName(skin: Pick<Skin, 'nameEn' | 'nameHe'>, locale: string): string;
export declare function skinHint(skin: Pick<Skin, 'hintEn' | 'hintHe'>, locale: string): string;
/** A blank new skin: draft, general switches, no extras. */
export declare function emptySkin(): Skin;
//# sourceMappingURL=skins.d.ts.map
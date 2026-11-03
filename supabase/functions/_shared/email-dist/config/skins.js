/* @ts-self-types="./skins.d.ts" */
/**
 * Skins as data: one row in `verticals` describes a skin. The platform owner
 * edits them on /platform/skins; the set-up wizard offers the live ones.
 *
 * Built-in skins (dance-studio, photographer, beautician, generic) keep their
 * code overlays (wording, legal variants, menus). For them the data wording is
 * ignored, so studios on a built-in skin never change when a row is edited.
 * A new skin is data only: in code it behaves like `generic` (safeVertical),
 * plus its own wording, switches and choices from the row.
 */
import { z } from 'zod';
import { PRESET_QUESTIONS } from '../leadForm.js';
export const BUILT_IN_SKINS = ['dance-studio', 'photographer', 'beautician', 'generic'];
export function isBuiltInSkin(id) {
    return BUILT_IN_SKINS.includes(id);
}
/** The existing 07c add-ons a skin can bring. */
export const LEGAL_ADDONS = ['photographer', 'beautician', 'coaching'];
/** The main nouns a skin may rename (the same keys as the studio's own wording). */
export const SKIN_NOUN_KEYS = [
    'contact',
    'account',
    'offering',
    'engagement',
    'session',
    'staff',
    'season',
    'category',
];
export const SKIN_ID_RE = /^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$/;
const HEX = /^#[0-9A-Fa-f]{6}$/;
/** Columns read from `verticals`. */
export const SKIN_COLUMNS = 'id, name_en, name_he, hint_en, hint_he, status, marketing_pages, default_switches, label_overrides, legal_addon, enquiry_presets, colours, sort_order';
const Pair = z.object({ singular: z.string().trim().min(1).max(40), plural: z.string().trim().min(1).max(40) });
const LocaleLabels = z.record(z.string(), z.unknown()).transform((raw) => {
    const out = {};
    for (const key of SKIN_NOUN_KEYS) {
        const parsed = Pair.safeParse(raw[key]);
        if (parsed.success)
            out[key] = parsed.data;
    }
    return out;
});
function obj(raw) {
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
}
function bool(raw) {
    return typeof raw === 'boolean' ? raw : undefined;
}
export function parseSkinSwitches(raw) {
    const o = obj(raw);
    const out = {};
    const flow = o.payment_flow;
    if (flow === 'recurring' || flow === 'project' || flow === 'both')
        out.paymentFlow = flow;
    const pairs = [
        ['teachesClasses', 'teaches_classes'],
        ['familyAccounts', 'family_accounts'],
        ['clientBooking', 'client_booking'],
        ['healthDeclaration', 'health_declaration'],
    ];
    for (const [key, col] of pairs) {
        const v = bool(o[col]);
        if (v !== undefined)
            out[key] = v;
    }
    return out;
}
export function parseSkinLabels(raw) {
    const o = obj(raw);
    const out = {};
    for (const locale of ['en', 'he']) {
        const parsed = LocaleLabels.safeParse(obj(o[locale]));
        if (parsed.success && Object.keys(parsed.data).length > 0)
            out[locale] = parsed.data;
    }
    return out;
}
export function parseSkinRow(row) {
    const colours = obj(row.colours);
    const str = (v) => (typeof v === 'string' ? v : '');
    const addon = row.legal_addon;
    return {
        id: str(row.id),
        nameEn: str(row.name_en),
        nameHe: str(row.name_he),
        hintEn: str(row.hint_en),
        hintHe: str(row.hint_he),
        status: row.status === 'live' ? 'live' : 'draft',
        marketingPages: Array.isArray(row.marketing_pages) ? row.marketing_pages.filter((p) => typeof p === 'string') : [],
        switches: parseSkinSwitches(row.default_switches),
        labels: parseSkinLabels(row.label_overrides),
        legalAddon: LEGAL_ADDONS.includes(addon) ? addon : null,
        enquiryPresets: Array.isArray(row.enquiry_presets)
            ? row.enquiry_presets.filter((k) => typeof k === 'string' && k in PRESET_QUESTIONS)
            : [],
        colours: {
            ...(typeof colours.primary === 'string' && HEX.test(colours.primary) ? { primary: colours.primary } : {}),
            ...(typeof colours.accent === 'string' && HEX.test(colours.accent) ? { accent: colours.accent } : {}),
        },
        sortOrder: typeof row.sort_order === 'number' ? row.sort_order : 100,
    };
}
/** The row written to `verticals` for a skin (empty wording pairs are dropped). */
export function toSkinRow(skin) {
    const switches = {};
    if (skin.switches.paymentFlow)
        switches.payment_flow = skin.switches.paymentFlow;
    if (skin.switches.teachesClasses !== undefined)
        switches.teaches_classes = skin.switches.teachesClasses;
    if (skin.switches.familyAccounts !== undefined)
        switches.family_accounts = skin.switches.familyAccounts;
    if (skin.switches.clientBooking !== undefined)
        switches.client_booking = skin.switches.clientBooking;
    if (skin.switches.healthDeclaration !== undefined)
        switches.health_declaration = skin.switches.healthDeclaration;
    const labels = {};
    for (const locale of ['en', 'he']) {
        const cleaned = parseSkinLabels({ [locale]: skin.labels[locale] ?? {} })[locale];
        if (cleaned)
            labels[locale] = cleaned;
    }
    return {
        id: skin.id,
        name_en: skin.nameEn.trim(),
        name_he: skin.nameHe.trim(),
        hint_en: skin.hintEn.trim(),
        hint_he: skin.hintHe.trim(),
        status: skin.status,
        marketing_pages: skin.marketingPages,
        default_switches: switches,
        label_overrides: labels,
        legal_addon: skin.legalAddon,
        enquiry_presets: skin.enquiryPresets,
        colours: skin.colours,
        sort_order: skin.sortOrder,
    };
}
/** Problems that stop a skin from being saved (keys for the form's messages). */
export function skinErrors(skin) {
    const errors = [];
    if (!SKIN_ID_RE.test(skin.id))
        errors.push('id');
    if (!skin.nameEn.trim() || skin.nameEn.trim().length > 80)
        errors.push('name_en');
    if (!skin.nameHe.trim() || skin.nameHe.trim().length > 80)
        errors.push('name_he');
    for (const locale of ['en', 'he']) {
        for (const key of SKIN_NOUN_KEYS) {
            const pair = skin.labels[locale]?.[key];
            if (!pair)
                continue;
            const hasOne = Boolean(pair.singular.trim()) !== Boolean(pair.plural.trim());
            if (hasOne)
                errors.push(`label_${locale}_${key}`);
        }
    }
    return errors;
}
/** The skin's own main-noun wording. Empty for built-in skins: their code wording stays. */
export function skinLabelsFor(skin, locale) {
    if (!skin || isBuiltInSkin(skin.id))
        return {};
    return skin.labels[locale] ?? {};
}
/** The business profile the wizard prefills for a skin; missing switches keep the fallback. */
export function profileFromSkin(skin, fallback) {
    return {
        paymentFlow: skin.switches.paymentFlow ?? fallback.paymentFlow,
        teachesClasses: skin.switches.teachesClasses ?? fallback.teachesClasses,
        familyAccounts: skin.switches.familyAccounts ?? fallback.familyAccounts,
        clientBooking: skin.switches.clientBooking ?? fallback.clientBooking,
    };
}
/** The live skin a marketing industry page points to (by page slug), if any. */
export function skinForMarketingPage(skins, page) {
    const slug = (page ?? '').trim().toLowerCase();
    if (!slug)
        return null;
    return skins.find((s) => s.status === 'live' && s.marketingPages.includes(slug)) ?? null;
}
export function skinName(skin, locale) {
    return locale.startsWith('he') ? skin.nameHe : skin.nameEn;
}
export function skinHint(skin, locale) {
    return locale.startsWith('he') ? skin.hintHe : skin.hintEn;
}
/** A blank new skin: draft, general switches, no extras. */
export function emptySkin() {
    return {
        id: '',
        nameEn: '',
        nameHe: '',
        hintEn: '',
        hintHe: '',
        status: 'draft',
        marketingPages: [],
        switches: { paymentFlow: 'both', teachesClasses: false, familyAccounts: false, clientBooking: false },
        labels: {},
        legalAddon: null,
        enquiryPresets: [],
        colours: {},
        sortOrder: 100,
    };
}

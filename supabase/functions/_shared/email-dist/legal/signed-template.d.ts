import { SIGNED_TEMPLATE_FILES } from './signed-template-sources.js';
export type LegalLang = 'he' | 'en';
/**
 * Drop the drafting frame: the leading "Draft, not legal advice" quote block and
 * the notes after the last `---` (the same rule as the marketing site).
 */
export declare function stripDraftingFrame(raw: string): string;
/**
 * The documents a studio's clients SIGN (consent_templates, shown in the
 * signing step as plain text): built from docs/legal 07b / 07c with the
 * studio's details and sensible defaults, and with no drafting notes.
 */
export type SignedDocId = keyof typeof SIGNED_TEMPLATE_FILES;
export declare const SIGNED_DOC_FILES: Record<SignedDocId, string>;
export type SignedAudience = 'child' | 'adult';
/** One form a studio gets: a document (plus, for agreements, its skin's add-on). */
export interface SignedFormSpec {
    key: string;
    doc: SignedDocId;
    addon?: SignedDocId;
    /** Health declarations: who signs this version (picked by the participant's age). */
    audience?: SignedAudience;
    title: Record<LegalLang, string>;
}
/** The add-on documents a studio's agreement can carry (verticals.legal_addon). */
export declare const ADDON_DOCS: {
    readonly photographer: "addon-photographer";
    readonly beautician: "addon-beautician";
    readonly coaching: "addon-coaching";
};
export type SignedAddon = keyof typeof ADDON_DOCS;
export declare function isSignedAddon(value: unknown): value is SignedAddon;
/** Today's rule, by skin: only dance studios' clients sign a health declaration. */
export declare function defaultHealthDeclarations(vertical: string | null | undefined): boolean;
/** What decides a studio's forms. Anything not given follows its skin, as before. */
export interface SignedFormsScope {
    /** tenants.health_declaration (NULL: from the field). */
    healthDeclarations?: boolean | null;
    /** verticals.legal_addon of the studio's skin; undefined: the built-in skin's own. */
    legalAddon?: SignedAddon | null;
}
/**
 * The forms a studio's clients sign. A health declaration (both ages) when the
 * studio's clients sign one ("Clients sign a health declaration"; dance studios
 * by default). Every studio but a dance studio also has the service agreement,
 * with its field's add-on (photography, treatments, coaching), if any.
 */
export declare function signedFormsFor(vertical: string | null | undefined, scope?: SignedFormsScope): SignedFormSpec[];
/** The forms a studio type signs by default (unknown types: the general studio's). */
export declare function signedFormsForVertical(vertical: string | null | undefined): SignedFormSpec[];
/**
 * Whether the studio's clients sign a health declaration: the studio's setting,
 * or, when it has none, its field's default. Only those studios are asked about insurance.
 */
export declare function hasHealthDeclarations(vertical: string | null | undefined, setting?: boolean | null): boolean;
/**
 * The studio's insurance answer. Optional and never blocking: anything but an
 * explicit "We have insurance" counts as "We don't have insurance" (owner
 * decision), so an unanswered choice is never treated as insured.
 */
export declare function insuranceStatus(profile: Record<string, string | undefined> | null | undefined): 'insured' | 'none';
export interface SignedTemplateContext {
    lang: LegalLang;
    tenantName: string;
    contactEmail: string;
    profile: Record<string, string | undefined>;
    /** tenants.skin (names the service in the agreement). */
    vertical?: string | null;
    /** The agreement's add-on (names the service; its own default numbers). Set by prepareSignedForm. */
    addon?: SignedAddon | null;
}
/** Markdown → the plain text the signing step shows (it renders text, not markdown). */
export declare function markdownToPlainText(md: string): string;
/** The template source for a document and language (bundled from docs/legal). */
export declare function signedTemplateSource(doc: SignedDocId, lang: LegalLang): string;
/** One filled form, ready to store as an active consent template. */
export interface StudioSignedForm {
    key: string;
    name: string;
    content: string;
    audience: SignedAudience | null;
}
/** The forms for a studio, filled: what provisioning stores as its active consent templates. */
export declare function studioSignedForms(vertical: string | null | undefined, ctx: SignedTemplateContext, scope?: SignedFormsScope): StudioSignedForm[];
/** A form's text: the document (and its add-on), filled with the studio's details. */
export declare function prepareSignedForm(form: SignedFormSpec, ctx: SignedTemplateContext): string;
/**
 * "We don't have insurance" (legal_profile.insurance_status other than 'insured'): the
 * health declaration's Declaration list tells the signer so, as part of the
 * text they sign (sealed with it). No extra step. Awaiting lawyer review.
 */
export declare const NO_INSURANCE_DECLARATION: Record<LegalLang, string>;
/** Fill a signed document's placeholders and turn it into plain text. */
export declare function fillSignedText(markdown: string, ctx: SignedTemplateContext): string;
//# sourceMappingURL=signed-template.d.ts.map
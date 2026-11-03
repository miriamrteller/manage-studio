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
/**
 * The forms each studio type (tenants.skin) gets. Class studios with both ages
 * get both health declarations; service businesses the base agreement plus
 * their skin's add-on; a general studio the base agreement only.
 */
export declare const SIGNED_FORMS_BY_SKIN: Record<string, SignedFormSpec[]>;
/** The forms a studio type signs (unknown types: the general studio's). */
export declare function signedFormsForVertical(vertical: string | null | undefined): SignedFormSpec[];
/** Studios whose clients sign a health declaration: the only ones asked about insurance. */
export declare function hasHealthDeclarations(vertical: string | null | undefined): boolean;
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
/** The forms for a studio's type, filled: what provisioning stores as its active consent templates. */
export declare function studioSignedForms(vertical: string | null | undefined, ctx: SignedTemplateContext): StudioSignedForm[];
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
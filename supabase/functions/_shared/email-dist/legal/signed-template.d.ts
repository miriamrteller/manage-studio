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
export type SignedDocId = 'health-declaration' | 'photography-contract';
export declare const SIGNED_DOC_FILES: Record<SignedDocId, string>;
/**
 * Which signed template(s) each studio type (tenants.skin) gets. The ids follow
 * docs/legal; when the templates become generic (base agreement + per-skin
 * add-on, child/adult health declarations), only this map and the sources change.
 */
export declare const SIGNED_TEMPLATES_BY_SKIN: Record<string, SignedDocId[]>;
/** Dance studios: a health declaration. Photographers: the shoot agreement. Others: none. */
export declare function signedDocForVertical(vertical: string | null | undefined): SignedDocId | null;
export declare const SIGNED_DOC_TITLES: Record<SignedDocId, Record<LegalLang, string>>;
export interface SignedTemplateContext {
    lang: LegalLang;
    tenantName: string;
    contactEmail: string;
    profile: Record<string, string | undefined>;
}
/** Markdown → the plain text the signing step shows (it renders text, not markdown). */
export declare function markdownToPlainText(md: string): string;
/** The template source for a document and language (bundled from docs/legal). */
export declare function signedTemplateSource(doc: SignedDocId, lang: LegalLang): string;
/** The studio's form for its type, filled: what provisioning stores as its active consent template. */
export declare function studioSignedTemplate(vertical: string | null | undefined, ctx: SignedTemplateContext): {
    doc: SignedDocId;
    name: string;
    content: string;
} | null;
/** The studio's signed template text, ready to store as its first consent template. */
export declare function prepareSignedTemplate(raw: string, doc: SignedDocId, ctx: SignedTemplateContext): string;
//# sourceMappingURL=signed-template.d.ts.map
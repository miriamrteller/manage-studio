/**
 * Content for sharing a studio's enquiry form (docs/plans/LEADS.md, 2c).
 *
 * Used by the web app (Get leads panel) and by the send-lead-form-link Edge
 * Function (via the email-dist bundle), so the emails are built on the server
 * from fixed templates: an admin never sends free text through the platform.
 * Pure and dependency-free.
 */
export type ShareLang = 'en' | 'he';
export declare const WEBSITE_PLATFORMS: readonly ["wix", "wordpress", "squarespace", "google_sites"];
export type WebsitePlatform = (typeof WEBSITE_PLATFORMS)[number];
export declare const WEBSITE_PLATFORM_NAMES: Record<WebsitePlatform, string>;
/** 3–4 steps per website builder for pasting the embed code. */
export declare const WEBSITE_STEPS: Record<ShareLang, Record<WebsitePlatform, string[]>>;
export declare function escapeHtml(value: string): string;
/** The iframe a studio pastes into its own site (form on the studio's OpalSwift host). */
export declare function embedIframe(formOrigin: string, title: string): string;
export interface BuiltEmail {
    subject: string;
    html: string;
    text: string;
}
/**
 * "<Studio> sent you its enquiry form": the link only. No marketing content,
 * and no consent is implied by receiving it.
 */
export declare function formLinkEmail(input: {
    studio: string;
    recipientName?: string | null;
    formUrl: string;
    lang: ShareLang;
    colour?: string | null;
}): BuiltEmail;
/** "How to add <Studio>'s enquiry form to the website": the code plus steps per builder. */
export declare function websiteInstructionsEmail(input: {
    studio: string;
    formOrigin: string;
    lang: ShareLang;
}): BuiltEmail;
//# sourceMappingURL=leadShare.d.ts.map
import { EMAIL_TEMPLATE_NAMES, type EmailLanguage, type EmailTemplateName } from '../i18n/email.js';
export type { EmailTemplateName, EmailLanguage };
export { EMAIL_TEMPLATE_NAMES };
export declare function isSupportedEmailTemplate(name: string): name is EmailTemplateName;
export interface RenderEmailTemplateInput {
    templateName: EmailTemplateName;
    language: EmailLanguage;
    schoolName: string;
    schoolLogoUrl?: string;
    /** Tenant primary/accent from DB */
    tenantColors?: {
        primary_color?: string | null;
        accent_color?: string | null;
    };
    stringOverrides?: Record<string, unknown> | null;
    /** Template-specific fields (snake_case from edge payloads) */
    variables?: Record<string, unknown>;
    subject?: string;
}
export interface RenderEmailTemplateResult {
    html: string;
    subject: string;
}
/**
 * Render a React Email template to HTML + subject line.
 */
export declare function renderEmailTemplate(input: RenderEmailTemplateInput): Promise<RenderEmailTemplateResult>;
//# sourceMappingURL=render-template.d.ts.map
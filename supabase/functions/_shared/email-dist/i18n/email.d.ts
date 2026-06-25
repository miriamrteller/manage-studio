/**
 * Email i18n Loader
 * Loads email template strings from i18n JSON files
 * Non-async (synchronous) for use in Supabase Edge Functions
 * Adheres to SPEC.md 1.9.1: No hard-coded UI strings
 */
/**
 * Supported template names
 * Aligns with actual email template files in packages/shared/src/email-templates/
 */
export declare const EMAIL_TEMPLATE_NAMES: {
    readonly OTP: "otp";
    readonly MAGIC_LINK: "magic_link";
    readonly WELCOME: "welcome";
    readonly PAYMENT_REMINDER: "payment_reminder";
    readonly CLASS_CANCELLATION: "class_cancellation";
    readonly WAITING_LIST_OFFER: "waiting_list_offer";
    readonly ENROLMENT_CONFIRMATION: "enrolment_confirmation";
    readonly WAIVER_REMINDER: "waiver_reminder";
    readonly WAIVER_CANCELLED: "waiver_cancelled";
    readonly ENROLMENT_AGE_REVIEW_REQUESTED: "enrolment_age_review_requested";
    readonly ENROLMENT_AGE_REVIEW_APPROVED: "enrolment_age_review_approved";
    readonly ENROLMENT_AGE_REVIEW_DECLINED: "enrolment_age_review_declined";
};
export type EmailTemplateName = typeof EMAIL_TEMPLATE_NAMES[keyof typeof EMAIL_TEMPLATE_NAMES];
/**
 * Supported languages for email templates
 */
export declare const SUPPORTED_LANGUAGES: readonly ["en", "he"];
export type EmailLanguage = typeof SUPPORTED_LANGUAGES[number];
/**
 * Get email template strings for a specific template and language
 * @param language - 'en' or 'he'
 * @param templateName - Name of the template (see EMAIL_TEMPLATE_NAMES)
 * @returns Object containing all strings for that template
 * @throws Error if template or language not found
 *
 * Example:
 * const otpStrings = getEmailStrings('he', 'otp');
 * const greeting = otpStrings.greeting_hello; // "שלום,"
 */
export declare function getEmailStrings(language: EmailLanguage, templateName: EmailTemplateName): Record<string, unknown>;
/**
 * Get base footer strings (shared across all templates)
 * @param language - 'en' or 'he'
 * @returns Footer string object
 */
export declare function getEmailFooterStrings(language: EmailLanguage): Record<string, unknown>;
/**
 * Validate that a language code is supported
 * @param language - Language to validate
 * @returns true if language is supported
 */
export declare function isValidEmailLanguage(language: unknown): language is EmailLanguage;
/**
 * Validate that a template name is supported
 * @param templateName - Template name to validate
 * @returns true if template is supported
 */
export declare function isValidTemplateName(templateName: unknown): templateName is EmailTemplateName;
/**
 * Get all available template names
 * @returns Array of valid template names
 */
export declare function getAvailableTemplates(): EmailTemplateName[];
/**
 * Interpolate variables in template strings
 * Replaces {variableName} with corresponding values
 * Example: interpolate("Hello {name}", { name: "Alice" }) → "Hello Alice"
 * @param template - Template string with {variableName} placeholders
 * @param variables - Object with variable values
 * @returns Interpolated string
 */
export declare function interpolateTemplate(template: string, variables: Record<string, string | number>): string;
/**
 * Validate and get email strings with type safety
 * Throws if input is invalid
 */
export declare function getEmailStringsValidated(language: unknown, templateName: unknown): Record<string, unknown>;
//# sourceMappingURL=email.d.ts.map
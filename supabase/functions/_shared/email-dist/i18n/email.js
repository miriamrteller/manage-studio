/**
 * Email i18n Loader
 * Loads email template strings from i18n JSON files
 * Non-async (synchronous) for use in Supabase Edge Functions
 * Adheres to SPEC.md 1.9.1: No hard-coded UI strings
 */
import enTemplates from './email-templates-en.json' with { type: 'json' };
import heTemplates from './email-templates-he.json' with { type: 'json' };
import { z } from 'zod';
/**
 * Supported template names
 * Aligns with actual email template files in packages/shared/src/email-templates/
 */
export const EMAIL_TEMPLATE_NAMES = {
    OTP: 'otp',
    MAGIC_LINK: 'magic_link',
    WELCOME: 'welcome',
    PAYMENT_REMINDER: 'payment_reminder',
    CLASS_CANCELLATION: 'class_cancellation',
    WAITING_LIST_OFFER: 'waiting_list_offer',
    ENROLMENT_CONFIRMATION: 'enrolment_confirmation',
    WAIVER_REMINDER: 'waiver_reminder',
    WAIVER_CANCELLED: 'waiver_cancelled',
    ENROLMENT_AGE_REVIEW_REQUESTED: 'enrolment_age_review_requested',
    ENROLMENT_AGE_REVIEW_APPROVED: 'enrolment_age_review_approved',
    ENROLMENT_AGE_REVIEW_DECLINED: 'enrolment_age_review_declined',
};
/**
 * Supported languages for email templates
 */
export const SUPPORTED_LANGUAGES = ['en', 'he'];
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
export function getEmailStrings(language, templateName) {
    const templates = language === 'he' ? heTemplates : enTemplates;
    const template = templates[templateName];
    if (!template) {
        throw new Error(`Email template not found: ${templateName} in language ${language}`);
    }
    return template;
}
/**
 * Get base footer strings (shared across all templates)
 * @param language - 'en' or 'he'
 * @returns Footer string object
 */
export function getEmailFooterStrings(language) {
    const templates = language === 'he' ? heTemplates : enTemplates;
    const footer = templates.base;
    if (!footer) {
        throw new Error(`Email base strings not found for language ${language}`);
    }
    return footer;
}
/**
 * Validate that a language code is supported
 * @param language - Language to validate
 * @returns true if language is supported
 */
export function isValidEmailLanguage(language) {
    return typeof language === 'string' && SUPPORTED_LANGUAGES.includes(language);
}
/**
 * Validate that a template name is supported
 * @param templateName - Template name to validate
 * @returns true if template is supported
 */
export function isValidTemplateName(templateName) {
    return (typeof templateName === 'string' &&
        Object.values(EMAIL_TEMPLATE_NAMES).includes(templateName));
}
/**
 * Get all available template names
 * @returns Array of valid template names
 */
export function getAvailableTemplates() {
    return Object.values(EMAIL_TEMPLATE_NAMES);
}
/**
 * Interpolate variables in template strings
 * Replaces {variableName} with corresponding values
 * Example: interpolate("Hello {name}", { name: "Alice" }) → "Hello Alice"
 * @param template - Template string with {variableName} placeholders
 * @param variables - Object with variable values
 * @returns Interpolated string
 */
export function interpolateTemplate(template, variables) {
    return template.replace(/{(\w+)}/g, (match, key) => {
        const value = variables[key];
        if (value === undefined) {
            console.warn(`Missing variable in template interpolation: ${key}`);
            return match; // Return original {key} if variable not found
        }
        return String(value);
    });
}
/**
 * Type schema for validating email template names
 */
const TemplateNameSchema = z.enum([
    EMAIL_TEMPLATE_NAMES.OTP,
    EMAIL_TEMPLATE_NAMES.MAGIC_LINK,
    EMAIL_TEMPLATE_NAMES.WELCOME,
    EMAIL_TEMPLATE_NAMES.PAYMENT_REMINDER,
    EMAIL_TEMPLATE_NAMES.CLASS_CANCELLATION,
    EMAIL_TEMPLATE_NAMES.WAITING_LIST_OFFER,
    EMAIL_TEMPLATE_NAMES.ENROLMENT_CONFIRMATION,
    EMAIL_TEMPLATE_NAMES.WAIVER_REMINDER,
    EMAIL_TEMPLATE_NAMES.WAIVER_CANCELLED,
    EMAIL_TEMPLATE_NAMES.ENROLMENT_AGE_REVIEW_REQUESTED,
    EMAIL_TEMPLATE_NAMES.ENROLMENT_AGE_REVIEW_APPROVED,
    EMAIL_TEMPLATE_NAMES.ENROLMENT_AGE_REVIEW_DECLINED,
]);
const LanguageSchema = z.enum(['en', 'he']);
/**
 * Validate and get email strings with type safety
 * Throws if input is invalid
 */
export function getEmailStringsValidated(language, templateName) {
    const validatedLanguage = LanguageSchema.parse(language);
    const validatedTemplate = TemplateNameSchema.parse(templateName);
    return getEmailStrings(validatedLanguage, validatedTemplate);
}

import { type EmailColorConfig } from './BaseEmailTemplate.js';
interface WelcomeEmailProps {
    schoolName: string;
    schoolLogoUrl?: string;
    recipientName: string;
    enrolledClassName: string;
    enrolledTermName: string;
    dashboardUrl: string;
    /**
     * Language (REQUIRED) - For i18n and direction computation
     * Direction computed in BaseEmailTemplate: language === 'he' ? 'rtl' : 'ltr'
     */
    language: 'en' | 'he';
    /**
     * Email color configuration (OPTIONAL)
     * Passed from edge function based on tenant config
     */
    colors?: EmailColorConfig;
    /**
     * Template strings (from i18n + tenant overrides)
     * Schema matches packages/shared/src/i18n/email-templates-*.json
     */
    strings?: {
        preview?: string;
        greeting?: string;
        confirmation?: string;
        class_details_heading?: string;
        class_name_label?: string;
        class_term_label?: string;
        next_steps_heading?: string;
        next_steps_text?: string;
        cta_button?: string;
        contact_notice?: string;
        questions_text?: string;
    };
}
/**
 * Welcome Email Template
 * Sent after successful enrolment to confirm participation
 * Includes link to dashboard/schedule view
 *
 * Adheres to:
 * - SPEC.md 2.1: Direction computed from language in BaseEmailTemplate only
 * - No hardcoded text (uses i18n)
 * - All colors via CSS variables
 */
export default function WelcomeEmail({ schoolName, schoolLogoUrl, recipientName, enrolledClassName, enrolledTermName, dashboardUrl, language, colors, strings, }: WelcomeEmailProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=WelcomeEmail.d.ts.map
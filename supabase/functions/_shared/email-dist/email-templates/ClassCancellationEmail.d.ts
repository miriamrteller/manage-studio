import { type EmailColorConfig } from './BaseEmailTemplate.js';
interface ClassCancellationEmailProps {
    schoolName: string;
    schoolLogoUrl?: string;
    recipientName: string;
    cancelledClassName: string;
    cancelledDate: string;
    cancellationReason?: string;
    makeupCreditAmount?: string;
    rebookUrl?: string;
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
        announcement?: string;
        cancellation_reason_label?: string;
        makeup_credit_heading?: string;
        makeup_credit_text?: string;
        reschedule_instructions?: string;
        cta_button?: string;
        support_text?: string;
    };
}
/**
 * Class Cancellation Email Template
 * Sent when a scheduled class is cancelled
 * Includes makeup credit details and rebooking link
 *
 * Adheres to:
 * - SPEC.md 2.1: Direction computed from language in BaseEmailTemplate only
 * - No hardcoded text (uses i18n)
 * - All colors via CSS variables
 */
export default function ClassCancellationEmail({ schoolName, schoolLogoUrl, recipientName, cancelledClassName, cancelledDate, cancellationReason, makeupCreditAmount, rebookUrl, language, colors, strings, }: ClassCancellationEmailProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=ClassCancellationEmail.d.ts.map
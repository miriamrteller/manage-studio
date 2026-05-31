import { type EmailColorConfig } from './BaseEmailTemplate.js';
interface PaymentReminderEmailProps {
    schoolName: string;
    schoolLogoUrl?: string;
    recipientName: string;
    amountOutstandingFormatted: string;
    enrolledClassName: string;
    dueDate: string;
    paymentUrl: string;
    invoiceId?: string;
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
        intro?: string;
        intro_overdue?: string;
        amount_label?: string;
        due_date_label?: string;
        due_date_value?: string;
        payment_details?: string;
        cta_button?: string;
        late_notice?: string;
        questions_text?: string;
        payment_methods?: string;
    };
    daysSinceOverdue?: number;
}
/**
 * Payment Reminder Email Template
 * Dunning notice for outstanding class payments
 * Includes payment link and invoice reference
 * Escalates in tone if overdue (optional daysSinceOverdue parameter)
 *
 * Adheres to:
 * - SPEC.md 2.1: Direction computed from language in BaseEmailTemplate only
 * - No hardcoded text (uses i18n)
 * - All colors via CSS variables
 */
export default function PaymentReminderEmail({ schoolName, schoolLogoUrl, recipientName, amountOutstandingFormatted, enrolledClassName, dueDate, paymentUrl, invoiceId, language, colors, strings, daysSinceOverdue, }: PaymentReminderEmailProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=PaymentReminderEmail.d.ts.map
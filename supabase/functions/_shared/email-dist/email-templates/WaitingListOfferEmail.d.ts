import { type EmailColorConfig } from './BaseEmailTemplate.js';
interface WaitingListOfferEmailProps {
    schoolName: string;
    schoolLogoUrl?: string;
    recipientName: string;
    className: string;
    availableSlots: number;
    offerExpiryDate: string;
    enrollNowUrl: string;
    termName?: string;
    classDetails?: {
        startDate?: string;
        endDate?: string;
        day?: string;
        time?: string;
        teacher?: string;
    };
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
        heading?: string;
        greeting?: string;
        offer?: string;
        class_details_heading?: string;
        class_label?: string;
        day_label?: string;
        time_label?: string;
        dates_label?: string;
        teacher_label?: string;
        cta_text?: string;
        cta_button?: string;
        expiry_heading?: string;
        expiry_notice?: string;
        support_text?: string;
    };
}
/**
 * Waiting List Offer Email Template
 * Sent when a space opens up in a class that user was waitlisted for
 * Time-limited offer with CTA to enroll
 *
 * Adheres to:
 * - SPEC.md 2.1: Direction computed from language in BaseEmailTemplate only
 * - No hardcoded text (uses i18n)
 * - All colors via CSS variables
 */
export default function WaitingListOfferEmail({ schoolName, schoolLogoUrl, recipientName, className, availableSlots, offerExpiryDate, enrollNowUrl, termName, classDetails, language, colors, strings, }: WaitingListOfferEmailProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=WaitingListOfferEmail.d.ts.map
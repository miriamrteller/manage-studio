import { type EmailColorConfig, type EmailFooterStrings } from './BaseEmailTemplate.js';
interface EnrolmentConfirmationEmailProps {
    schoolName: string;
    schoolLogoUrl?: string;
    language: 'en' | 'he';
    colors?: EmailColorConfig;
    footerStrings?: EmailFooterStrings;
    strings?: {
        subject?: string;
        preview?: string;
        greeting?: string;
        enrollment_confirmed?: string;
        enrollment_reserved?: string;
        waiver_warning_heading?: string;
        waiver_warning_body?: string;
        waiver_cta?: string;
        link_expires?: string;
        no_show_policy?: string;
        confirmation_note?: string;
    };
    /** Student name */
    recipientName: string;
    /** Class name */
    className: string;
    /** If true, shows the pending waiver warning and sign CTA */
    pendingWaiver: boolean;
    /** Magic link URL for signing the waiver (required when pendingWaiver=true) */
    signUrl?: string;
    /** ISO datetime string of the waiver deadline */
    deadlineDate?: string;
}
export default function EnrolmentConfirmationEmail({ schoolName, schoolLogoUrl, language, colors, footerStrings, strings, recipientName, className, pendingWaiver, signUrl, deadlineDate, }: EnrolmentConfirmationEmailProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=EnrolmentConfirmationEmail.d.ts.map
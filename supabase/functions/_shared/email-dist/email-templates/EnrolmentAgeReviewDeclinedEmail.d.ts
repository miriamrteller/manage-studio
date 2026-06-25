import { type EmailColorConfig, type EmailFooterStrings } from './BaseEmailTemplate.js';
interface EnrolmentAgeReviewDeclinedEmailProps {
    schoolName: string;
    schoolLogoUrl?: string;
    language: 'en' | 'he';
    colors?: EmailColorConfig;
    footerStrings?: EmailFooterStrings;
    strings?: {
        subject?: string;
        preview?: string;
        greeting?: string;
        body?: string;
        reason_label?: string;
        footer_note?: string;
    };
    recipientName: string;
    studentName: string;
    className: string;
    declineReason?: string;
}
export default function EnrolmentAgeReviewDeclinedEmail({ schoolName, schoolLogoUrl, language, colors, footerStrings, strings, recipientName, studentName, className, declineReason, }: EnrolmentAgeReviewDeclinedEmailProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=EnrolmentAgeReviewDeclinedEmail.d.ts.map
import { type EmailColorConfig, type EmailFooterStrings } from './BaseEmailTemplate.js';
interface EnrolmentAgeReviewApprovedEmailProps {
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
        cta_button?: string;
        footer_note?: string;
    };
    recipientName: string;
    studentName: string;
    className: string;
    payUrl: string;
}
export default function EnrolmentAgeReviewApprovedEmail({ schoolName, schoolLogoUrl, language, colors, footerStrings, strings, recipientName, studentName, className, payUrl, }: EnrolmentAgeReviewApprovedEmailProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=EnrolmentAgeReviewApprovedEmail.d.ts.map
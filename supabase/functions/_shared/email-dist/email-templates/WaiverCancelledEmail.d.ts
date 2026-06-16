import { type EmailColorConfig, type EmailFooterStrings } from './BaseEmailTemplate.js';
interface WaiverCancelledEmailProps {
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
        refund_note?: string;
        contact_note?: string;
    };
    recipientName: string;
    className: string;
    /** e.g. "A full refund has been issued to your original payment method." or "No payment was taken." */
    refundNote: string;
}
export default function WaiverCancelledEmail({ schoolName, schoolLogoUrl, language, colors, footerStrings, strings, recipientName, className, refundNote, }: WaiverCancelledEmailProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=WaiverCancelledEmail.d.ts.map
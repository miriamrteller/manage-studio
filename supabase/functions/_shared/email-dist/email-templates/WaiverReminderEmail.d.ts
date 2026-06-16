import { type EmailColorConfig, type EmailFooterStrings } from './BaseEmailTemplate.js';
interface WaiverReminderEmailProps {
    schoolName: string;
    schoolLogoUrl?: string;
    language: 'en' | 'he';
    colors?: EmailColorConfig;
    footerStrings?: EmailFooterStrings;
    strings?: {
        subject?: string;
        subject_urgent?: string;
        preview?: string;
        greeting?: string;
        body?: string;
        body_urgent?: string;
        waiver_warning?: string;
        cta?: string;
        link_expires?: string;
        deadline_note?: string;
        cancellation_warning?: string;
    };
    recipientName: string;
    className: string;
    /** URL for signing the waiver — a freshly generated magic link */
    signUrl: string;
    /** ISO string of the waiver deadline */
    deadlineDate: string;
    /** true = 48h reminder (most urgent); false = 5-day reminder (first notice) */
    isUrgent: boolean;
}
export default function WaiverReminderEmail({ schoolName, schoolLogoUrl, language, colors, footerStrings, strings, recipientName, className, signUrl, deadlineDate, isUrgent, }: WaiverReminderEmailProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=WaiverReminderEmail.d.ts.map
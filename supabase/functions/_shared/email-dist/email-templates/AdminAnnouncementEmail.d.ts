import { type EmailColorConfig, type EmailFooterStrings } from './BaseEmailTemplate.js';
interface AdminAnnouncementEmailProps {
    schoolName: string;
    schoolLogoUrl?: string;
    language: 'en' | 'he';
    colors?: EmailColorConfig;
    footerStrings?: EmailFooterStrings;
    strings?: {
        preview?: string;
    };
    subject: string;
    body: string;
}
export default function AdminAnnouncementEmail({ schoolName, schoolLogoUrl, language, colors, footerStrings, strings, subject, body, }: AdminAnnouncementEmailProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=AdminAnnouncementEmail.d.ts.map
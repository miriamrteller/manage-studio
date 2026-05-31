import { type EmailColorConfig, type EmailFooterStrings } from './BaseEmailTemplate.js';
interface OtpEmailProps {
    schoolName: string;
    schoolLogoUrl?: string;
    otpCode: string;
    expiresInMinutes?: number;
    recipientName?: string;
    language: 'en' | 'he';
    colors?: EmailColorConfig;
    footerStrings?: EmailFooterStrings;
    strings?: {
        preview?: string;
        heading?: string;
        greeting_hello?: string;
        greeting_with_name?: string;
        context_messages?: Record<string, string>;
        context_labels?: Record<string, string>;
        expiration_warning?: string;
        security_notice?: string;
    };
    usageContext?: 'whatsapp_verification' | 'email_verification' | 'security_reset';
}
export default function OtpEmail({ schoolName, schoolLogoUrl, otpCode, expiresInMinutes, recipientName, language, colors, footerStrings, strings, usageContext, }: OtpEmailProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=OtpEmail.d.ts.map
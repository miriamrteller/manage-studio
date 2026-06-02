import { type EmailColorConfig, type EmailFooterStrings } from './BaseEmailTemplate.js';
export interface MagicLinkEmailProps {
    schoolName: string;
    schoolLogoUrl?: string;
    magicLinkUrl: string;
    /** 6-digit sign-in code (login Code tab) */
    otpCode?: string;
    expiresInMinutes?: number;
    recipientName?: string;
    language: 'en' | 'he';
    colors?: EmailColorConfig;
    footerStrings?: EmailFooterStrings;
    strings?: {
        preview?: string;
        subject?: string;
        greeting_hello?: string;
        greeting_with_name?: string;
        intro?: string;
        code_heading?: string;
        cta_button?: string;
        fallback_text?: string;
        expiration_notice?: string;
        security_notice?: string;
    };
}
export default function MagicLinkEmail({ schoolName, schoolLogoUrl, magicLinkUrl, otpCode, expiresInMinutes, recipientName, language, colors, footerStrings, strings, }: MagicLinkEmailProps): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=MagicLinkEmail.d.ts.map
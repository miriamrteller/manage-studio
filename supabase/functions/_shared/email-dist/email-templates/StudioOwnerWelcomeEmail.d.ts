import { type EmailColorConfig, type EmailFooterStrings } from './BaseEmailTemplate.js';
/**
 * Sent once, when the platform creates a studio and invites its owner
 * (provision-studio → Supabase "invite" → send-auth-email). OpalSwift-branded:
 * the header is OpalSwift's, the studio's name is in the body.
 */
export interface StudioOwnerWelcomeEmailProps {
    studioName: string;
    /** e.g. https://<subdomain>.opalswift.com */
    studioUrl: string;
    /** The invite link ("Set up your account"). */
    inviteUrl: string;
    logoUrl?: string;
    language: 'en' | 'he';
    colors?: EmailColorConfig;
    footerStrings?: EmailFooterStrings;
    strings?: Record<string, unknown>;
}
export default function StudioOwnerWelcomeEmail({ studioName, studioUrl, inviteUrl, logoUrl, language, colors, footerStrings, strings, }: StudioOwnerWelcomeEmailProps): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=StudioOwnerWelcomeEmail.d.ts.map
import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import BaseEmailTemplate from './BaseEmailTemplate.js';
import { EmailCodeWithCopy, EmailLinkBox, EmailMutedText, EmailParagraph, EmailPrimaryButton, EmailWarningText, } from './primitives/index.js';
const DEFAULT_STRINGS = {
    preview: 'Sign in to {schoolName}',
    greeting_hello: 'Hello,',
    greeting_with_name: 'Hello {recipientName},',
    intro: "We received a request to sign in to your {schoolName} account. If you didn't make this request, you can ignore this message.",
    code_heading: 'Your sign-in code:',
    copy_button: 'Copy',
    cta_button: 'Sign In',
    fallback_text: "If the button above doesn't work, copy and paste this link into your browser:",
    expiration_notice: 'This link expires in {expiresInMinutes} minutes',
    security_notice: "This link can only be used once. If you didn't request this sign-in link, you can safely ignore this message.",
};
export default function MagicLinkEmail({ schoolName, schoolLogoUrl, magicLinkUrl, otpCode, expiresInMinutes = 15, recipientName, language, colors, footerStrings, strings, }) {
    const finalStrings = { ...DEFAULT_STRINGS, ...strings };
    const greeting = recipientName
        ? (finalStrings.greeting_with_name || '').replace('{recipientName}', recipientName)
        : (finalStrings.greeting_hello || '');
    const intro = (finalStrings.intro || '').replace('{schoolName}', schoolName);
    const expirationText = (finalStrings.expiration_notice || '').replace('{expiresInMinutes}', String(expiresInMinutes));
    const previewText = (finalStrings.preview || '').replace('{schoolName}', schoolName);
    const primaryColor = colors?.primary?.startsWith('var(')
        ? colors.primary.replace(/var\(--email-primary,\s*([^)]+)\)/, '$1').trim()
        : colors?.primary ?? '#2563eb';
    return (_jsxs(BaseEmailTemplate, { previewText: previewText, schoolName: schoolName, schoolLogoUrl: schoolLogoUrl, language: language, colors: colors, footerStrings: footerStrings, children: [_jsx(EmailParagraph, { children: greeting }), _jsx(EmailParagraph, { children: intro }), otpCode ? (_jsxs(_Fragment, { children: [_jsx(EmailParagraph, { style: { fontWeight: 600 }, children: finalStrings.code_heading || DEFAULT_STRINGS.code_heading }), _jsx(EmailCodeWithCopy, { code: otpCode, copyLabel: finalStrings.copy_button || DEFAULT_STRINGS.copy_button, primaryColor: primaryColor })] })) : null, _jsx(EmailPrimaryButton, { href: magicLinkUrl, children: finalStrings.cta_button || DEFAULT_STRINGS.cta_button }), _jsx(EmailMutedText, { children: finalStrings.fallback_text || DEFAULT_STRINGS.fallback_text }), _jsx(EmailLinkBox, { href: magicLinkUrl }), _jsx(EmailWarningText, { children: expirationText }), _jsx(EmailMutedText, { children: finalStrings.security_notice || DEFAULT_STRINGS.security_notice })] }));
}

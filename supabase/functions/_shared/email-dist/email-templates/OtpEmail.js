import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import BaseEmailTemplate from './BaseEmailTemplate.js';
import { EmailCodeBox, EmailMutedText, EmailParagraph, EmailWarningText, } from './primitives/index.js';
const DEFAULT_STRINGS = {
    preview: 'Your Verification Code',
    heading: 'Your Verification Code',
    greeting_hello: 'Hello,',
    greeting_with_name: 'Hello {recipientName},',
    context_messages: {
        whatsapp_verification: 'To verify your WhatsApp number with {schoolName}, use this code:',
        email_verification: 'To verify your email address with {schoolName}, use this code:',
        security_reset: 'To reset your password with {schoolName}, use this code:',
    },
    context_labels: {
        whatsapp_verification: 'WhatsApp Verification',
        email_verification: 'Email Verification',
        security_reset: 'Password Reset',
    },
    expiration_warning: 'This code expires in {expiresInMinutes} minutes',
    security_notice: "If you didn't request this code, please ignore this message. If you believe your account has been compromised, please contact our support team immediately.",
};
export default function OtpEmail({ schoolName, schoolLogoUrl, otpCode, expiresInMinutes = 10, recipientName, language, colors, footerStrings, strings, usageContext = 'email_verification', }) {
    const finalStrings = { ...DEFAULT_STRINGS, ...strings };
    const contextMessage = finalStrings.context_messages?.[usageContext] ||
        finalStrings.context_messages?.['email_verification'] ||
        '';
    const contextLabel = finalStrings.context_labels?.[usageContext] ||
        finalStrings.context_labels?.['email_verification'] ||
        '';
    const message = contextMessage.replace('{schoolName}', schoolName);
    const greeting = recipientName
        ? (finalStrings.greeting_with_name || '').replace('{recipientName}', recipientName)
        : (finalStrings.greeting_hello || '');
    const expirationText = (finalStrings.expiration_warning || '').replace('{expiresInMinutes}', String(expiresInMinutes));
    return (_jsxs(BaseEmailTemplate, { previewText: finalStrings.preview || DEFAULT_STRINGS.preview, schoolName: schoolName, schoolLogoUrl: schoolLogoUrl, language: language, colors: colors, footerStrings: footerStrings, children: [_jsx(EmailParagraph, { children: greeting }), _jsx(EmailParagraph, { children: message }), _jsx(EmailCodeBox, { code: otpCode, label: contextLabel }), _jsx(EmailWarningText, { style: { textAlign: 'center' }, children: expirationText }), _jsx(EmailMutedText, { children: finalStrings.security_notice })] }));
}

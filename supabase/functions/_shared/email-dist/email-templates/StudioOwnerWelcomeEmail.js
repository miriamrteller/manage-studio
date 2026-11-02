/* @ts-self-types="./StudioOwnerWelcomeEmail.d.ts" */
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import BaseEmailTemplate from './BaseEmailTemplate.js';
import { OPALSWIFT_EMAIL_ANCHOR } from '../email/brand.js';
import { EmailLinkBox, EmailMutedText, EmailParagraph, EmailPrimaryButton, EmailWarningText, } from './primitives/index.js';
const DEFAULT_STRINGS = {
    preview: 'Your studio {studioName} is ready on OpalSwift',
    greeting: 'Welcome to OpalSwift!',
    intro: 'Your studio {studioName} is ready. Set up your account to get started.',
    studio_address_label: 'Your studio address:',
    cta_button: 'Set up your account',
    next_heading: "What's next",
    next_step_1: 'Sign in to your studio.',
    next_step_2: 'Add your logo and your classes or services.',
    next_step_3: 'Invite your first clients or families.',
    fallback_text: "If the button above doesn't work, copy and paste this link into your browser:",
    expiration_notice: 'This link works for 1 hour. After that, sign in at your studio address with this email.',
    questions: 'Questions? Just reply to this email.',
    footer_notice: 'You are receiving this email because a studio was created for you on OpalSwift.',
};
function text(strings, key) {
    const value = strings[key];
    return typeof value === 'string' && value ? value : DEFAULT_STRINGS[key];
}
export default function StudioOwnerWelcomeEmail({ studioName, studioUrl, inviteUrl, logoUrl, language, colors, footerStrings, strings = {}, }) {
    const withStudio = (value) => value.split('{studioName}').join(studioName);
    const steps = [text(strings, 'next_step_1'), text(strings, 'next_step_2'), text(strings, 'next_step_3')];
    return (_jsxs(BaseEmailTemplate, { previewText: withStudio(text(strings, 'preview')), schoolName: "OpalSwift", schoolLogoUrl: logoUrl, language: language, colors: colors, gradientAnchor: OPALSWIFT_EMAIL_ANCHOR, 
        // The footer's "do not reply" line would contradict "just reply" here.
        footerStrings: { ...footerStrings, automated_notice: text(strings, 'footer_notice') }, children: [_jsx(EmailParagraph, { style: { fontWeight: 600, fontSize: '18px' }, children: text(strings, 'greeting') }), _jsx(EmailParagraph, { children: withStudio(text(strings, 'intro')) }), _jsxs(EmailParagraph, { children: [text(strings, 'studio_address_label'), ' ', _jsx("a", { href: studioUrl, dir: "ltr", style: { color: 'var(--email-primary)', fontWeight: 600 }, children: studioUrl })] }), _jsx(EmailPrimaryButton, { href: inviteUrl, children: text(strings, 'cta_button') }), _jsx(EmailParagraph, { style: { fontWeight: 600, marginTop: '8px' }, children: text(strings, 'next_heading') }), _jsx("ol", { style: { margin: '0 0 20px', paddingInlineStart: '24px' }, children: steps.map((step) => (_jsx("li", { style: { marginBottom: '6px' }, children: step }, step))) }), _jsx(EmailWarningText, { children: text(strings, 'expiration_notice') }), _jsx(EmailMutedText, { children: text(strings, 'fallback_text') }), _jsx(EmailLinkBox, { href: inviteUrl }), _jsx(EmailParagraph, { style: { marginTop: '24px' }, children: text(strings, 'questions') })] }));
}

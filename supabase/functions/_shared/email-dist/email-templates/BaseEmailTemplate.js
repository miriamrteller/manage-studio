import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Body, Container, Head, Hr, Html, Img, Link, Preview, Section, Text, } from '@react-email/components';
/**
 * Default email colors
 * These match the CSS variable defaults and provide safe fallbacks
 */
const DEFAULT_EMAIL_COLORS = {
    primary: '#2563eb',
    accent: '#dc2626',
    text: '#1f2937',
    bg: '#f9fafb',
    neutral: '#6b7280',
};
const DEFAULT_FOOTER = {
    automated_notice: 'This is an automated email. Please do not reply directly.',
    preferences_link: 'Manage your notification preferences at',
    preferences_url: 'https://manage-studio.app/preferences',
};
/**
 * Base email template component
 * Provides consistent branding, header/footer, and RTL support
 */
export default function BaseEmailTemplate({ previewText, children, schoolName, schoolLogoUrl, language, colors, footerStrings, }) {
    const dir = language === 'he' ? 'rtl' : 'ltr';
    const emailColors = colors
        ? {
            ...colors,
            primary: colors.primary.startsWith('var(')
                ? colors.primary.replace(/var\(--email-primary,\s*([^)]+)\)/, '$1').trim()
                : colors.primary,
            accent: colors.accent.startsWith('var(')
                ? colors.accent.replace(/var\(--email-accent,\s*([^)]+)\)/, '$1').trim()
                : colors.accent,
            text: colors.text.startsWith('var(')
                ? colors.text.replace(/var\(--email-text,\s*([^)]+)\)/, '$1').trim()
                : colors.text,
            bg: colors.bg.startsWith('var(')
                ? colors.bg.replace(/var\(--email-bg,\s*([^)]+)\)/, '$1').trim()
                : colors.bg,
            neutral: colors.neutral.startsWith('var(')
                ? colors.neutral.replace(/var\(--email-neutral,\s*([^)]+)\)/, '$1').trim()
                : colors.neutral,
        }
        : DEFAULT_EMAIL_COLORS;
    const footer = { ...DEFAULT_FOOTER, ...footerStrings };
    const year = new Date().getFullYear();
    const displayCopyright = footer.copyright?.replace('{year}', String(year)).replace('{schoolName}', schoolName) ??
        `© ${year} ${schoolName}. All rights reserved.`;
    const preferencesUrl = footer.preferences_url ?? DEFAULT_FOOTER.preferences_url;
    return (_jsxs(Html, { lang: language, dir: dir, children: [_jsx(Head, { children: _jsx("style", { children: `
          :root {
            --email-primary: ${emailColors.primary};
            --email-accent: ${emailColors.accent};
            --email-text: ${emailColors.text};
            --email-bg: ${emailColors.bg};
            --email-neutral: ${emailColors.neutral};
          }
        ` }) }), _jsx(Preview, { children: previewText }), _jsx(Body, { style: {
                    backgroundColor: '#f3f4f6',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                    color: emailColors.text,
                    lineHeight: '1.6',
                    margin: 0,
                    padding: '24px 0',
                }, children: _jsxs(Container, { style: {
                        maxWidth: '600px',
                        margin: '0 auto',
                        padding: '0 16px',
                    }, children: [_jsxs(Section, { style: {
                                backgroundColor: '#ffffff',
                                borderRadius: '12px',
                                border: '1px solid #e5e7eb',
                                overflow: 'hidden',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                            }, children: [_jsxs(Section, { style: {
                                        backgroundColor: emailColors.primary,
                                        padding: '28px 32px',
                                        textAlign: 'center',
                                    }, children: [schoolLogoUrl ? (_jsx(Img, { src: schoolLogoUrl, alt: schoolName, style: {
                                                height: '48px',
                                                margin: '0 auto 12px',
                                                display: 'block',
                                            } })) : null, _jsx(Text, { style: {
                                                fontSize: '22px',
                                                fontWeight: 'bold',
                                                margin: 0,
                                                color: '#ffffff',
                                            }, children: schoolName })] }), _jsx(Section, { style: { padding: '32px' }, children: children })] }), _jsx(Hr, { style: { borderColor: '#e5e7eb', margin: '24px 0' } }), _jsxs(Section, { style: { textAlign: 'center', paddingBottom: '16px' }, children: [_jsx(Text, { style: {
                                        fontSize: '12px',
                                        color: emailColors.neutral,
                                        margin: '4px 0',
                                    }, children: displayCopyright }), _jsx(Text, { style: {
                                        fontSize: '12px',
                                        color: emailColors.neutral,
                                        margin: '4px 0',
                                    }, children: footer.automated_notice }), _jsxs(Text, { style: {
                                        fontSize: '12px',
                                        color: emailColors.neutral,
                                        margin: '8px 0 0 0',
                                    }, children: [footer.preferences_link, ' ', _jsx(Link, { href: preferencesUrl, style: { color: emailColors.primary }, children: preferencesUrl.replace(/^https?:\/\//, '') })] })] })] }) })] }));
}

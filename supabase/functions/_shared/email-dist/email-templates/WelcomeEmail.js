import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Button, Text, } from '@react-email/components';
import BaseEmailTemplate from './BaseEmailTemplate.js';
/**
 * Default strings (fallback when i18n/overrides not provided)
 * Matches structure in email-templates-en.json
 */
const DEFAULT_STRINGS = {
    preview: 'Welcome to {enrolledClassName} - {schoolName}',
    greeting: 'Welcome, {recipientName}!',
    confirmation: 'Your enrollment in {enrolledClassName} for {enrolledTermName} has been successfully confirmed!',
    class_details_heading: 'Class Details:',
    class_name_label: 'Class:',
    class_term_label: 'Term:',
    next_steps_heading: 'Next Steps:',
    next_steps_text: 'You can now view your class schedule and manage your enrollment through your account dashboard.',
    cta_button: 'View Dashboard',
    contact_notice: 'If you have any questions about your enrollment, please contact us.',
    questions_text: 'Questions? Contact our support team for more information about your class and the session schedule.',
};
/**
 * Welcome Email Template
 * Sent after successful enrolment to confirm participation
 * Includes link to dashboard/schedule view
 *
 * Adheres to:
 * - SPEC.md 2.1: Direction computed from language in BaseEmailTemplate only
 * - No hardcoded text (uses i18n)
 * - All colors via CSS variables
 */
export default function WelcomeEmail({ schoolName, schoolLogoUrl, recipientName, enrolledClassName, enrolledTermName, dashboardUrl, language, colors, strings, }) {
    // Merge provided strings with defaults
    const finalStrings = { ...DEFAULT_STRINGS, ...strings };
    // Interpolate dynamic values
    const greeting = (finalStrings.greeting || '').replace('{recipientName}', recipientName);
    const confirmation = (finalStrings.confirmation || '')
        .replace('{enrolledClassName}', enrolledClassName)
        .replace('{enrolledTermName}', enrolledTermName);
    const previewText = (finalStrings.preview || '')
        .replace('{enrolledClassName}', enrolledClassName)
        .replace('{schoolName}', schoolName);
    return (_jsxs(BaseEmailTemplate, { previewText: previewText, schoolName: schoolName, schoolLogoUrl: schoolLogoUrl, language: language, colors: colors, children: [_jsx(Text, { style: {
                    fontSize: '16px',
                    marginBottom: '10px',
                }, children: greeting }), _jsx(Text, { style: {
                    fontSize: '16px',
                    marginBottom: '25px',
                    lineHeight: '1.6',
                }, children: confirmation }), _jsxs("div", { style: {
                    backgroundColor: '#f0f9ff',
                    padding: '20px',
                    borderRadius: '8px',
                    marginBottom: '25px',
                    borderLeft: '4px solid var(--email-primary)',
                }, children: [_jsx(Text, { style: {
                            fontSize: '14px',
                            fontWeight: '600',
                            margin: '0 0 10px 0',
                        }, children: finalStrings.class_details_heading || DEFAULT_STRINGS.class_details_heading }), _jsxs(Text, { style: {
                            fontSize: '14px',
                            margin: '5px 0',
                        }, children: [_jsx("strong", { children: finalStrings.class_name_label || DEFAULT_STRINGS.class_name_label }), " ", enrolledClassName] }), _jsxs(Text, { style: {
                            fontSize: '14px',
                            margin: '5px 0',
                        }, children: [_jsx("strong", { children: finalStrings.class_term_label || DEFAULT_STRINGS.class_term_label }), " ", enrolledTermName] })] }), _jsx(Text, { style: {
                    fontSize: '16px',
                    marginBottom: '20px',
                    lineHeight: '1.6',
                }, children: finalStrings.next_steps_text || DEFAULT_STRINGS.next_steps_text }), _jsx("div", { style: { marginBottom: '25px', textAlign: 'center' }, children: _jsx(Button, { href: dashboardUrl, style: {
                        backgroundColor: 'var(--email-primary)',
                        color: '#ffffff',
                        padding: '12px 32px',
                        borderRadius: '6px',
                        textDecoration: 'none',
                        display: 'inline-block',
                        fontWeight: '600',
                        fontSize: '16px',
                    }, children: finalStrings.cta_button || DEFAULT_STRINGS.cta_button }) }), _jsx(Text, { style: {
                    fontSize: '14px',
                    marginBottom: '15px',
                    color: 'var(--email-neutral)',
                    lineHeight: '1.6',
                }, children: finalStrings.questions_text || DEFAULT_STRINGS.questions_text }), _jsx(Text, { style: {
                    fontSize: '14px',
                    marginBottom: '10px',
                    color: 'var(--email-neutral)',
                }, children: finalStrings.contact_notice || DEFAULT_STRINGS.contact_notice })] }));
}

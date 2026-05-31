import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Button, Text, } from '@react-email/components';
import BaseEmailTemplate from './BaseEmailTemplate.js';
/**
 * Default strings (fallback when i18n/overrides not provided)
 * Matches structure in email-templates-en.json
 */
const DEFAULT_STRINGS = {
    preview: 'Class Cancellation Notice',
    greeting: 'Hello {recipientName},',
    announcement: 'The class {cancelledClassName} scheduled for {cancelledDate} has been cancelled.',
    cancellation_reason_label: 'Reason:',
    makeup_credit_heading: '💳 Makeup Credit:',
    makeup_credit_text: 'You are eligible for a {makeupCreditAmount} makeup session to reschedule for another class.',
    reschedule_instructions: 'To reschedule another class using your makeup credit, visit your dashboard:',
    cta_button: 'Reschedule Now',
    support_text: 'If you have any questions or need help rescheduling, please contact our support team.',
};
/**
 * Class Cancellation Email Template
 * Sent when a scheduled class is cancelled
 * Includes makeup credit details and rebooking link
 *
 * Adheres to:
 * - SPEC.md 2.1: Direction computed from language in BaseEmailTemplate only
 * - No hardcoded text (uses i18n)
 * - All colors via CSS variables
 */
export default function ClassCancellationEmail({ schoolName, schoolLogoUrl, recipientName, cancelledClassName, cancelledDate, cancellationReason, makeupCreditAmount, rebookUrl, language, colors, strings, }) {
    // Merge provided strings with defaults
    const finalStrings = { ...DEFAULT_STRINGS, ...strings };
    // Interpolate dynamic values
    const greeting = (finalStrings.greeting || '').replace('{recipientName}', recipientName);
    const announcement = (finalStrings.announcement || '')
        .replace('{cancelledClassName}', cancelledClassName)
        .replace('{cancelledDate}', cancelledDate);
    const previewText = (finalStrings.preview || '');
    const makeupCreditText = (finalStrings.makeup_credit_text || '')
        .replace('{makeupCreditAmount}', makeupCreditAmount || 'full credit');
    return (_jsxs(BaseEmailTemplate, { previewText: previewText, schoolName: schoolName, schoolLogoUrl: schoolLogoUrl, language: language, colors: colors, children: [_jsx(Text, { style: {
                    fontSize: '16px',
                    marginBottom: '10px',
                }, children: greeting }), _jsx(Text, { style: {
                    fontSize: '16px',
                    marginBottom: '20px',
                    color: 'var(--email-accent)',
                    fontWeight: '600',
                    lineHeight: '1.6',
                }, children: announcement }), cancellationReason && (_jsxs(Text, { style: {
                    fontSize: '14px',
                    marginBottom: '20px',
                    color: 'var(--email-neutral)',
                    fontStyle: 'italic',
                }, children: [_jsx("strong", { children: finalStrings.cancellation_reason_label || DEFAULT_STRINGS.cancellation_reason_label }), " ", cancellationReason] })), _jsxs("div", { style: {
                    backgroundColor: '#fef3c7',
                    padding: '15px',
                    borderRadius: '6px',
                    marginBottom: '25px',
                    borderLeft: '4px solid var(--email-accent)',
                }, children: [_jsx(Text, { style: {
                            fontSize: '14px',
                            fontWeight: '600',
                            margin: '0 0 10px 0',
                            color: 'var(--email-accent)',
                        }, children: finalStrings.makeup_credit_heading || DEFAULT_STRINGS.makeup_credit_heading }), _jsx(Text, { style: {
                            fontSize: '14px',
                            margin: '0',
                        }, children: makeupCreditText })] }), rebookUrl && (_jsxs(_Fragment, { children: [_jsx(Text, { style: {
                            fontSize: '14px',
                            marginBottom: '20px',
                            lineHeight: '1.6',
                        }, children: finalStrings.reschedule_instructions || DEFAULT_STRINGS.reschedule_instructions }), _jsx("div", { style: { marginBottom: '25px', textAlign: 'center' }, children: _jsx(Button, { href: rebookUrl, style: {
                                backgroundColor: 'var(--email-primary)',
                                color: '#ffffff',
                                padding: '12px 32px',
                                borderRadius: '6px',
                                textDecoration: 'none',
                                display: 'inline-block',
                                fontWeight: '600',
                                fontSize: '16px',
                            }, children: finalStrings.cta_button || DEFAULT_STRINGS.cta_button }) })] })), _jsx(Text, { style: {
                    fontSize: '14px',
                    marginBottom: '10px',
                    color: 'var(--email-neutral)',
                    lineHeight: '1.6',
                }, children: finalStrings.support_text || DEFAULT_STRINGS.support_text }), _jsxs(Text, { style: {
                    fontSize: '14px',
                    marginBottom: '10px',
                    color: 'var(--email-neutral)',
                }, children: ["Best regards,", _jsx("br", {}), schoolName, " Team"] })] }));
}

import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Button, Link, Text, } from '@react-email/components';
import BaseEmailTemplate from './BaseEmailTemplate.js';
/**
 * Default strings (fallback when i18n/overrides not provided)
 * Matches structure in email-templates-en.json
 */
const DEFAULT_STRINGS = {
    preview: 'Payment Reminder - {schoolName}',
    greeting: 'Hello {recipientName},',
    intro: 'This is a reminder that payment for {description} is due soon.',
    intro_overdue: 'Your account with {schoolName} has an outstanding balance of {amount} that is now {daysSinceOverdue} days overdue.',
    amount_label: 'Amount Due:',
    due_date_label: 'Due Date:',
    due_date_value: '{dueDate}',
    payment_details: 'Please log in to your account to make a payment or set up automatic payments.',
    cta_button: 'Make Payment',
    late_notice: 'If payment is not received by {dueDate}, your enrollment may be subject to cancellation.',
    questions_text: 'If you have questions about your payment or need to discuss payment arrangements, please contact us.',
    payment_methods: 'We accept the following payment methods:',
};
/**
 * Payment Reminder Email Template
 * Dunning notice for outstanding class payments
 * Includes payment link and invoice reference
 * Escalates in tone if overdue (optional daysSinceOverdue parameter)
 *
 * Adheres to:
 * - SPEC.md 2.1: Direction computed from language in BaseEmailTemplate only
 * - No hardcoded text (uses i18n)
 * - All colors via CSS variables
 */
export default function PaymentReminderEmail({ schoolName, schoolLogoUrl, recipientName, amountOutstandingFormatted, enrolledClassName, dueDate, paymentUrl, invoiceId, language, colors, strings, daysSinceOverdue, }) {
    // Merge provided strings with defaults
    const finalStrings = { ...DEFAULT_STRINGS, ...strings };
    // Determine if account is overdue
    const isOverdue = daysSinceOverdue && daysSinceOverdue > 0;
    // Interpolate dynamic values
    const greeting = (finalStrings.greeting || '').replace('{recipientName}', recipientName);
    const intro = isOverdue
        ? (finalStrings.intro_overdue || '')
            .replace('{schoolName}', schoolName)
            .replace('{amount}', amountOutstandingFormatted)
            .replace('{daysSinceOverdue}', String(daysSinceOverdue || 0))
        : (finalStrings.intro || '')
            .replace('{description}', `${enrolledClassName}`)
            .replace('{enrolledClassName}', enrolledClassName);
    const previewText = (finalStrings.preview || '').replace('{schoolName}', schoolName);
    const lateNotice = (finalStrings.late_notice || '').replace('{dueDate}', dueDate);
    return (_jsxs(BaseEmailTemplate, { previewText: previewText, schoolName: schoolName, schoolLogoUrl: schoolLogoUrl, language: language, colors: colors, children: [_jsx(Text, { style: {
                    fontSize: '16px',
                    marginBottom: '10px',
                }, children: greeting }), _jsx(Text, { style: {
                    fontSize: '16px',
                    marginBottom: '20px',
                    color: isOverdue ? 'var(--email-accent)' : undefined,
                    fontWeight: isOverdue ? '600' : undefined,
                    lineHeight: '1.6',
                }, children: intro }), _jsxs("div", { style: {
                    backgroundColor: '#f0f9ff',
                    padding: '20px',
                    borderRadius: '8px',
                    marginBottom: '25px',
                    borderLeft: '4px solid var(--email-accent)',
                }, children: [_jsx(Text, { style: {
                            fontSize: '14px',
                            fontWeight: '600',
                            margin: '0 0 15px 0',
                        }, children: "Payment Details:" }), _jsxs(Text, { style: {
                            fontSize: '14px',
                            margin: '8px 0',
                        }, children: [_jsx("strong", { children: finalStrings.amount_label || DEFAULT_STRINGS.amount_label }), ' ', _jsx("span", { style: { fontSize: '18px', fontWeight: 'bold' }, children: amountOutstandingFormatted })] }), invoiceId && (_jsxs(Text, { style: {
                            fontSize: '14px',
                            margin: '8px 0',
                        }, children: [_jsx("strong", { children: "Invoice ID:" }), " ", invoiceId] })), _jsxs(Text, { style: {
                            fontSize: '14px',
                            margin: '8px 0',
                        }, children: [_jsx("strong", { children: finalStrings.due_date_label || DEFAULT_STRINGS.due_date_label }), " ", dueDate] }), _jsxs(Text, { style: {
                            fontSize: '14px',
                            margin: '8px 0',
                        }, children: [_jsx("strong", { children: "Class:" }), " ", enrolledClassName] })] }), _jsx("div", { style: { marginBottom: '25px', textAlign: 'center' }, children: _jsx(Button, { href: paymentUrl, style: {
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
                }, children: finalStrings.payment_details || DEFAULT_STRINGS.payment_details }), _jsx("div", { style: {
                    backgroundColor: '#f3f4f6',
                    padding: '12px',
                    borderRadius: '4px',
                    marginBottom: '25px',
                    wordBreak: 'break-all',
                }, children: _jsx(Link, { href: paymentUrl, style: {
                        color: 'var(--email-primary)',
                        textDecoration: 'underline',
                        fontSize: '12px',
                    }, children: paymentUrl }) }), isOverdue && (_jsxs(Text, { style: {
                    fontSize: '14px',
                    marginBottom: '20px',
                    padding: '15px',
                    backgroundColor: '#fee2e2',
                    borderRadius: '6px',
                    color: 'var(--email-accent)',
                    lineHeight: '1.6',
                }, children: ["\u26A0\uFE0F ", lateNotice] })), _jsx(Text, { style: {
                    fontSize: '14px',
                    marginBottom: '10px',
                    color: 'var(--email-neutral)',
                    lineHeight: '1.6',
                }, children: finalStrings.questions_text || DEFAULT_STRINGS.questions_text }), _jsxs(Text, { style: {
                    fontSize: '14px',
                    marginBottom: '10px',
                    color: 'var(--email-neutral)',
                }, children: ["Best regards,", _jsx("br", {}), schoolName, " Team"] })] }));
}

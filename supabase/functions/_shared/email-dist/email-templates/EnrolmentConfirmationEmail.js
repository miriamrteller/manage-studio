import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { Button, Text } from '@react-email/components';
import BaseEmailTemplate from './BaseEmailTemplate.js';
const DEFAULT_STRINGS = {
    subject: 'Your enrollment at {schoolName}',
    preview: 'Enrollment confirmation for {className}',
    greeting: 'Hi {recipientName},',
    enrollment_confirmed: 'Your enrollment in {className} is confirmed!',
    enrollment_reserved: 'Your spot in {className} is reserved.',
    waiver_warning_heading: 'ACTION REQUIRED: Sign your waiver',
    waiver_warning_body: 'Your spot is reserved but your enrollment is NOT active. You will not be permitted to attend class until the waiver is signed. Classes missed while your waiver is pending are not eligible for refund, credit, or makeup.',
    waiver_cta: 'Sign Your Waiver Now',
    link_expires: 'This link expires in 1 hour. If it has expired, visit the link in this email and enter your email address to receive a new one.',
    no_show_policy: 'Deadline: {deadlineDate}. If the waiver is not signed by this date, your enrollment will be automatically cancelled and a full refund issued.',
    confirmation_note: 'Please contact us if you have any questions.',
};
export default function EnrolmentConfirmationEmail({ schoolName, schoolLogoUrl, language, colors, footerStrings, strings, recipientName, className, pendingWaiver, signUrl, deadlineDate, }) {
    const s = { ...DEFAULT_STRINGS, ...strings };
    const greeting = s.greeting.replace('{recipientName}', recipientName);
    const preview = s.preview.replace('{className}', className);
    const mainText = pendingWaiver
        ? s.enrollment_reserved.replace('{className}', className)
        : s.enrollment_confirmed.replace('{className}', className);
    const formattedDeadline = deadlineDate
        ? new Date(deadlineDate).toLocaleDateString(language === 'he' ? 'he-IL' : 'en-GB', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        })
        : '';
    return (_jsxs(BaseEmailTemplate, { previewText: preview, schoolName: schoolName, schoolLogoUrl: schoolLogoUrl, language: language, colors: colors, footerStrings: footerStrings, children: [_jsx(Text, { style: { fontSize: '16px', marginBottom: '10px' }, children: greeting }), _jsx(Text, { style: { fontSize: '16px', marginBottom: '20px', lineHeight: '1.6' }, children: mainText }), pendingWaiver && (_jsxs("div", { style: {
                    backgroundColor: '#fef3c7',
                    border: '2px solid #f59e0b',
                    borderRadius: '8px',
                    padding: '20px',
                    marginBottom: '24px',
                }, children: [_jsx(Text, { style: {
                            fontSize: '15px',
                            fontWeight: '700',
                            color: '#92400e',
                            margin: '0 0 10px 0',
                        }, children: s.waiver_warning_heading }), _jsx(Text, { style: {
                            fontSize: '14px',
                            color: '#78350f',
                            lineHeight: '1.6',
                            margin: '0 0 16px 0',
                        }, children: s.waiver_warning_body }), signUrl && (_jsxs(_Fragment, { children: [_jsx("div", { style: { textAlign: 'center', marginBottom: '12px' }, children: _jsx(Button, { href: signUrl, style: {
                                        backgroundColor: '#b45309',
                                        color: '#ffffff',
                                        padding: '12px 28px',
                                        borderRadius: '6px',
                                        textDecoration: 'none',
                                        display: 'inline-block',
                                        fontWeight: '700',
                                        fontSize: '15px',
                                    }, children: s.waiver_cta }) }), _jsx(Text, { style: { fontSize: '12px', color: '#92400e', margin: '0 0 8px 0' }, children: s.link_expires })] })), formattedDeadline && (_jsx(Text, { style: { fontSize: '13px', color: '#78350f', margin: 0 }, children: s.no_show_policy.replace('{deadlineDate}', formattedDeadline) }))] })), _jsx(Text, { style: {
                    fontSize: '14px',
                    color: '#6b7280',
                    lineHeight: '1.6',
                    marginBottom: '10px',
                }, children: s.confirmation_note })] }));
}

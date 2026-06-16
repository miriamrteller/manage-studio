import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Button, Text } from '@react-email/components';
import BaseEmailTemplate from './BaseEmailTemplate.js';
const DEFAULT_STRINGS = {
    subject: 'Reminder: sign your waiver for {className}',
    subject_urgent: 'URGENT: Final reminder — sign your waiver for {className}',
    preview: 'Action needed: your enrollment in {className} is not yet active',
    greeting: 'Hi {recipientName},',
    body: 'This is a reminder that your enrollment in {className} will not be active until you sign the waiver.',
    body_urgent: 'This is your FINAL reminder. Your enrollment in {className} will be cancelled if the waiver is not signed within 48 hours.',
    waiver_warning: 'Your spot is reserved but your enrollment is NOT active. You will not be permitted to attend class until the waiver is signed. Classes missed while your waiver is pending are not eligible for refund, credit, or makeup.',
    cta: 'Sign Your Waiver Now',
    link_expires: 'This link expires in 1 hour. If it has expired, click the link and enter your email to receive a new one.',
    deadline_note: 'Your deadline is {deadlineDate}.',
    cancellation_warning: 'If the waiver is not signed by this date, your enrollment will be automatically cancelled and a full refund will be issued.',
};
export default function WaiverReminderEmail({ schoolName, schoolLogoUrl, language, colors, footerStrings, strings, recipientName, className, signUrl, deadlineDate, isUrgent, }) {
    const s = { ...DEFAULT_STRINGS, ...strings };
    const greeting = s.greeting.replace('{recipientName}', recipientName);
    const bodyText = (isUrgent ? s.body_urgent : s.body).replace('{className}', className);
    const formattedDeadline = new Date(deadlineDate).toLocaleDateString(language === 'he' ? 'he-IL' : 'en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const borderColor = isUrgent ? '#dc2626' : '#f59e0b';
    const bgColor = isUrgent ? '#fef2f2' : '#fef3c7';
    const headingColor = isUrgent ? '#991b1b' : '#92400e';
    const textColor = isUrgent ? '#7f1d1d' : '#78350f';
    return (_jsxs(BaseEmailTemplate, { previewText: s.preview.replace('{className}', className), schoolName: schoolName, schoolLogoUrl: schoolLogoUrl, language: language, colors: colors, footerStrings: footerStrings, children: [_jsx(Text, { style: { fontSize: '16px', marginBottom: '10px' }, children: greeting }), _jsx(Text, { style: { fontSize: '16px', marginBottom: '20px', lineHeight: '1.6' }, children: bodyText }), _jsxs("div", { style: {
                    backgroundColor: bgColor,
                    border: `2px solid ${borderColor}`,
                    borderRadius: '8px',
                    padding: '20px',
                    marginBottom: '24px',
                }, children: [_jsx(Text, { style: {
                            fontSize: '14px',
                            color: textColor,
                            lineHeight: '1.6',
                            margin: '0 0 16px 0',
                        }, children: s.waiver_warning }), _jsx("div", { style: { textAlign: 'center', marginBottom: '12px' }, children: _jsx(Button, { href: signUrl, style: {
                                backgroundColor: isUrgent ? '#dc2626' : '#b45309',
                                color: '#ffffff',
                                padding: '12px 28px',
                                borderRadius: '6px',
                                textDecoration: 'none',
                                display: 'inline-block',
                                fontWeight: '700',
                                fontSize: '15px',
                            }, children: s.cta }) }), _jsx(Text, { style: { fontSize: '12px', color: headingColor, margin: '0 0 8px 0' }, children: s.link_expires }), _jsx(Text, { style: { fontSize: '13px', color: textColor, margin: '0 0 4px 0' }, children: s.deadline_note.replace('{deadlineDate}', formattedDeadline) }), _jsx(Text, { style: { fontSize: '13px', color: textColor, margin: 0 }, children: s.cancellation_warning })] })] }));
}

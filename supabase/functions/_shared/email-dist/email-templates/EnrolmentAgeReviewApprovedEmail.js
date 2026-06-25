import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Button, Text } from '@react-email/components';
import BaseEmailTemplate from './BaseEmailTemplate.js';
const DEFAULT_STRINGS = {
    subject: 'Enrolment approved — {className}',
    preview: 'Your age review request was approved',
    greeting: 'Hi {recipientName},',
    body: 'Good news! {schoolName} has approved {studentName} for {className}. You can complete payment using the link below.',
    cta_button: 'Complete payment',
    footer_note: 'If you have questions, please contact the studio.',
};
export default function EnrolmentAgeReviewApprovedEmail({ schoolName, schoolLogoUrl, language, colors, footerStrings, strings, recipientName, studentName, className, payUrl, }) {
    const s = { ...DEFAULT_STRINGS, ...strings };
    const greeting = s.greeting.replace('{recipientName}', recipientName);
    const body = s.body
        .replace('{schoolName}', schoolName)
        .replace('{studentName}', studentName)
        .replace('{className}', className);
    return (_jsxs(BaseEmailTemplate, { previewText: s.preview, schoolName: schoolName, schoolLogoUrl: schoolLogoUrl, language: language, colors: colors, footerStrings: footerStrings, children: [_jsx(Text, { style: { fontSize: '16px', marginBottom: '10px' }, children: greeting }), _jsx(Text, { style: { fontSize: '16px', marginBottom: '24px', lineHeight: '1.6' }, children: body }), _jsx("div", { style: { textAlign: 'center', marginBottom: '24px' }, children: _jsx(Button, { href: payUrl, style: {
                        backgroundColor: colors?.primary ?? '#2563eb',
                        color: '#ffffff',
                        padding: '12px 28px',
                        borderRadius: '6px',
                        textDecoration: 'none',
                        display: 'inline-block',
                        fontWeight: '700',
                        fontSize: '15px',
                    }, children: s.cta_button }) }), _jsx(Text, { style: { fontSize: '14px', color: '#6b7280', lineHeight: '1.6' }, children: s.footer_note })] }));
}

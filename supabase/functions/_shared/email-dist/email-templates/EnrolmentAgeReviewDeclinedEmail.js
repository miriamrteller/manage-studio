import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { Text } from '@react-email/components';
import BaseEmailTemplate from './BaseEmailTemplate.js';
const DEFAULT_STRINGS = {
    subject: 'Age review update — {className}',
    preview: 'Update on your age review request',
    greeting: 'Hi {recipientName},',
    body: 'After review, {schoolName} is unable to approve {studentName} for {className} based on the class age requirements.',
    reason_label: 'Note from the studio',
    footer_note: 'You may browse other classes or contact the studio if you have questions.',
};
export default function EnrolmentAgeReviewDeclinedEmail({ schoolName, schoolLogoUrl, language, colors, footerStrings, strings, recipientName, studentName, className, declineReason, }) {
    const s = { ...DEFAULT_STRINGS, ...strings };
    const greeting = s.greeting.replace('{recipientName}', recipientName);
    const body = s.body
        .replace('{schoolName}', schoolName)
        .replace('{studentName}', studentName)
        .replace('{className}', className);
    return (_jsxs(BaseEmailTemplate, { previewText: s.preview, schoolName: schoolName, schoolLogoUrl: schoolLogoUrl, language: language, colors: colors, footerStrings: footerStrings, children: [_jsx(Text, { style: { fontSize: '16px', marginBottom: '10px' }, children: greeting }), _jsx(Text, { style: { fontSize: '16px', marginBottom: '16px', lineHeight: '1.6' }, children: body }), declineReason && (_jsxs(_Fragment, { children: [_jsx(Text, { style: { fontSize: '14px', fontWeight: 600, marginBottom: '4px' }, children: s.reason_label }), _jsx(Text, { style: { fontSize: '14px', marginBottom: '16px', lineHeight: '1.6' }, children: declineReason })] })), _jsx(Text, { style: { fontSize: '14px', color: '#6b7280', lineHeight: '1.6' }, children: s.footer_note })] }));
}

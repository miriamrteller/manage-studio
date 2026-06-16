import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Text } from '@react-email/components';
import BaseEmailTemplate from './BaseEmailTemplate.js';
const DEFAULT_STRINGS = {
    subject: 'Your enrollment in {className} has been cancelled',
    preview: 'Enrollment cancelled — waiver not signed',
    greeting: 'Hi {recipientName},',
    body: 'Your enrollment in {className} has been automatically cancelled because the required waiver was not signed before the deadline.',
    refund_note: '{refundNote}',
    contact_note: 'If you believe this is an error, or if you would like to re-enroll, please contact us.',
};
export default function WaiverCancelledEmail({ schoolName, schoolLogoUrl, language, colors, footerStrings, strings, recipientName, className, refundNote, }) {
    const s = { ...DEFAULT_STRINGS, ...strings };
    return (_jsxs(BaseEmailTemplate, { previewText: s.preview, schoolName: schoolName, schoolLogoUrl: schoolLogoUrl, language: language, colors: colors, footerStrings: footerStrings, children: [_jsx(Text, { style: { fontSize: '16px', marginBottom: '10px' }, children: s.greeting.replace('{recipientName}', recipientName) }), _jsx(Text, { style: { fontSize: '16px', marginBottom: '20px', lineHeight: '1.6' }, children: s.body.replace('{className}', className) }), _jsx("div", { style: {
                    backgroundColor: '#fee2e2',
                    border: '2px solid #dc2626',
                    borderRadius: '8px',
                    padding: '16px',
                    marginBottom: '20px',
                }, children: _jsx(Text, { style: { fontSize: '14px', color: '#7f1d1d', margin: 0 }, children: s.refund_note.replace('{refundNote}', refundNote) }) }), _jsx(Text, { style: { fontSize: '14px', color: '#6b7280', lineHeight: '1.6' }, children: s.contact_note })] }));
}

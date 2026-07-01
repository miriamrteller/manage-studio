import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Heading, Text } from '@react-email/components';
import BaseEmailTemplate from './BaseEmailTemplate.js';
export default function AdminAnnouncementEmail({ schoolName, schoolLogoUrl, language, colors, footerStrings, strings, subject, body, }) {
    const preview = strings?.preview?.replace('{schoolName}', schoolName) ??
        `Announcement from ${schoolName}`;
    return (_jsxs(BaseEmailTemplate, { previewText: preview, schoolName: schoolName, schoolLogoUrl: schoolLogoUrl, language: language, colors: colors, footerStrings: footerStrings, children: [_jsx(Heading, { as: "h1", style: { fontSize: '20px', fontWeight: 700, marginBottom: '16px' }, children: subject }), _jsx(Text, { style: { fontSize: '16px', lineHeight: '1.6', whiteSpace: 'pre-wrap' }, children: body })] }));
}

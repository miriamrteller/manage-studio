import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Text } from '@react-email/components';
import BaseEmailTemplate from './BaseEmailTemplate.js';
export default function AdminAnnouncementEmail({ schoolName, schoolLogoUrl, language, colors, footerStrings, strings, subject, body, }) {
    const preview = strings?.preview?.replace('{schoolName}', schoolName) ??
        `Announcement from ${schoolName}`;
    return (_jsxs(BaseEmailTemplate, { previewText: preview, schoolName: schoolName, schoolLogoUrl: schoolLogoUrl, language: language, colors: colors, footerStrings: footerStrings, children: [_jsx(Text, { style: {
                    fontSize: '20px',
                    fontWeight: 700,
                    marginTop: 0,
                    marginBottom: '16px',
                    lineHeight: '1.4',
                }, children: subject }), _jsx(Text, { style: { fontSize: '16px', lineHeight: '1.6', whiteSpace: 'pre-wrap' }, children: body })] }));
}

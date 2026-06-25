import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Button, Text } from '@react-email/components';
import BaseEmailTemplate from './BaseEmailTemplate.js';
import { EmailDetailsTable } from './primitives/EmailDetailsTable.js';
const DEFAULT_STRINGS = {
    subject: 'Age review requested — {studentName}',
    preview: 'A parent requested studio review for {className}',
    greeting: 'Hello,',
    intro: 'A parent has requested studio review for an age-ineligible enrolment.',
    student_label: 'Student',
    class_label: 'Class',
    age_label: 'Age at season start / class range',
    note_label: 'Parent note',
    cta_button: 'Review request',
};
export default function EnrolmentAgeReviewRequestedEmail({ schoolName, schoolLogoUrl, language, colors, footerStrings, strings, studentName, className, studentAge, classAgeRange, parentNote, reviewUrl, }) {
    const s = { ...DEFAULT_STRINGS, ...strings };
    const ageDisplay = studentAge != null && classAgeRange
        ? `${studentAge} / ${classAgeRange}`
        : studentAge != null
            ? String(studentAge)
            : classAgeRange ?? '—';
    const rows = [
        { label: s.student_label, value: studentName },
        { label: s.class_label, value: className },
        { label: s.age_label, value: ageDisplay },
        { label: s.note_label, value: parentNote },
    ];
    return (_jsxs(BaseEmailTemplate, { previewText: s.preview.replace('{className}', className).replace('{studentName}', studentName), schoolName: schoolName, schoolLogoUrl: schoolLogoUrl, language: language, colors: colors, footerStrings: footerStrings, children: [_jsx(Text, { style: { fontSize: '16px', marginBottom: '10px' }, children: s.greeting }), _jsx(Text, { style: { fontSize: '16px', marginBottom: '20px', lineHeight: '1.6' }, children: s.intro }), _jsx(EmailDetailsTable, { heading: s.class_label, rows: rows }), _jsx("div", { style: { textAlign: 'center', marginTop: '24px' }, children: _jsx(Button, { href: reviewUrl, style: {
                        backgroundColor: colors?.primary ?? '#2563eb',
                        color: '#ffffff',
                        padding: '12px 28px',
                        borderRadius: '6px',
                        textDecoration: 'none',
                        display: 'inline-block',
                        fontWeight: '700',
                        fontSize: '15px',
                    }, children: s.cta_button }) })] }));
}

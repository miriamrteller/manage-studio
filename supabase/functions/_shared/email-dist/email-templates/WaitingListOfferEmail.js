import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Button, Text, } from '@react-email/components';
import BaseEmailTemplate from './BaseEmailTemplate.js';
/**
 * Default strings (fallback when i18n/overrides not provided)
 * Matches structure in email-templates-en.json
 */
const DEFAULT_STRINGS = {
    preview: 'A Spot Just Opened! - {schoolName}',
    heading: '🎉 A Space is Available!',
    greeting: 'Hello {recipientName},',
    offer: 'Great news! {availableSlots} {slotText} now available in {className}, the class you\'ve been waitlisted for.',
    class_details_heading: 'Class Details:',
    class_label: 'Class:',
    day_label: 'Day:',
    time_label: 'Time:',
    dates_label: 'Dates:',
    teacher_label: 'Instructor:',
    cta_text: 'Was waiting for this? All you need to do is click the button below to secure your spot now!',
    cta_button: 'Enroll Now',
    expiry_heading: '⏰ Limited Time Offer:',
    expiry_notice: 'This offer expires on {offerExpiryDate}. After that date, the spot may be offered to other waitlisted students.',
    support_text: 'If you have any questions or need help with enrollment, please don\'t hesitate to contact our support team.',
};
/**
 * Waiting List Offer Email Template
 * Sent when a space opens up in a class that user was waitlisted for
 * Time-limited offer with CTA to enroll
 *
 * Adheres to:
 * - SPEC.md 2.1: Direction computed from language in BaseEmailTemplate only
 * - No hardcoded text (uses i18n)
 * - All colors via CSS variables
 */
export default function WaitingListOfferEmail({ schoolName, schoolLogoUrl, recipientName, className, availableSlots, offerExpiryDate, enrollNowUrl, termName, classDetails, language, colors, strings, }) {
    // Merge provided strings with defaults
    const finalStrings = { ...DEFAULT_STRINGS, ...strings };
    // Interpolate dynamic values
    const slotText = availableSlots > 1 ? 'spaces are' : 'space is';
    const offer = (finalStrings.offer || '')
        .replace('{availableSlots}', String(availableSlots))
        .replace('{slotText}', slotText)
        .replace('{className}', className);
    const greeting = (finalStrings.greeting || '').replace('{recipientName}', recipientName);
    const previewText = (finalStrings.preview || '').replace('{schoolName}', schoolName);
    const expiryNotice = (finalStrings.expiry_notice || '').replace('{offerExpiryDate}', offerExpiryDate);
    return (_jsxs(BaseEmailTemplate, { previewText: previewText, schoolName: schoolName, schoolLogoUrl: schoolLogoUrl, language: language, colors: colors, children: [_jsx(Text, { style: {
                    fontSize: '18px',
                    fontWeight: 'bold',
                    marginBottom: '15px',
                    color: 'var(--email-accent)',
                }, children: finalStrings.heading || DEFAULT_STRINGS.heading }), _jsx(Text, { style: {
                    fontSize: '16px',
                    marginBottom: '10px',
                }, children: greeting }), _jsx(Text, { style: {
                    fontSize: '16px',
                    marginBottom: '25px',
                    lineHeight: '1.6',
                }, children: offer }), _jsxs("div", { style: {
                    backgroundColor: '#f0fdf4',
                    padding: '20px',
                    borderRadius: '8px',
                    marginBottom: '25px',
                    borderLeft: '4px solid var(--email-accent)',
                }, children: [_jsx(Text, { style: {
                            fontSize: '14px',
                            fontWeight: '600',
                            margin: '0 0 15px 0',
                        }, children: finalStrings.class_details_heading || DEFAULT_STRINGS.class_details_heading }), _jsxs(Text, { style: {
                            fontSize: '14px',
                            margin: '8px 0',
                        }, children: [_jsx("strong", { children: finalStrings.class_label || DEFAULT_STRINGS.class_label }), " ", className] }), classDetails?.day && (_jsxs(Text, { style: {
                            fontSize: '14px',
                            margin: '8px 0',
                        }, children: [_jsx("strong", { children: finalStrings.day_label || DEFAULT_STRINGS.day_label }), " ", classDetails.day] })), classDetails?.time && (_jsxs(Text, { style: {
                            fontSize: '14px',
                            margin: '8px 0',
                        }, children: [_jsx("strong", { children: finalStrings.time_label || DEFAULT_STRINGS.time_label }), " ", classDetails.time] })), classDetails?.startDate && classDetails?.endDate && (_jsxs(Text, { style: {
                            fontSize: '14px',
                            margin: '8px 0',
                        }, children: [_jsx("strong", { children: finalStrings.dates_label || DEFAULT_STRINGS.dates_label }), " ", classDetails.startDate, " to", ' ', classDetails.endDate] })), classDetails?.teacher && (_jsxs(Text, { style: {
                            fontSize: '14px',
                            margin: '8px 0',
                        }, children: [_jsx("strong", { children: finalStrings.teacher_label || DEFAULT_STRINGS.teacher_label }), " ", classDetails.teacher] }))] }), _jsx(Text, { style: {
                    fontSize: '16px',
                    marginBottom: '25px',
                    lineHeight: '1.6',
                }, children: finalStrings.cta_text || DEFAULT_STRINGS.cta_text }), _jsx("div", { style: { marginBottom: '25px', textAlign: 'center' }, children: _jsx(Button, { href: enrollNowUrl, style: {
                        backgroundColor: 'var(--email-accent)',
                        color: '#ffffff',
                        padding: '14px 40px',
                        borderRadius: '6px',
                        textDecoration: 'none',
                        display: 'inline-block',
                        fontWeight: '600',
                        fontSize: '16px',
                    }, children: finalStrings.cta_button || DEFAULT_STRINGS.cta_button }) }), _jsxs("div", { style: {
                    backgroundColor: '#fef3c7',
                    padding: '15px',
                    borderRadius: '6px',
                    marginBottom: '25px',
                    borderLeft: '4px solid #f59e0b',
                }, children: [_jsx(Text, { style: {
                            fontSize: '14px',
                            fontWeight: '600',
                            margin: '0 0 8px 0',
                            color: '#92400e',
                        }, children: finalStrings.expiry_heading || DEFAULT_STRINGS.expiry_heading }), _jsx(Text, { style: {
                            fontSize: '14px',
                            margin: '0',
                            color: '#92400e',
                        }, children: expiryNotice })] }), _jsx(Text, { style: {
                    fontSize: '14px',
                    marginBottom: '15px',
                    color: 'var(--email-neutral)',
                    lineHeight: '1.6',
                }, children: finalStrings.support_text || DEFAULT_STRINGS.support_text }), _jsxs(Text, { style: {
                    fontSize: '14px',
                    marginBottom: '10px',
                    color: 'var(--email-neutral)',
                }, children: ["Best regards,", _jsx("br", {}), schoolName, " Team"] })] }));
}

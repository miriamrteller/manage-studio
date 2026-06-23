import React from 'react';
import { render } from '@react-email/render';
import ClassCancellationEmail from '../email-templates/ClassCancellationEmail.js';
import MagicLinkEmail from '../email-templates/MagicLinkEmail.js';
import OtpEmail from '../email-templates/OtpEmail.js';
import PaymentReminderEmail from '../email-templates/PaymentReminderEmail.js';
import WaitingListOfferEmail from '../email-templates/WaitingListOfferEmail.js';
import WelcomeEmail from '../email-templates/WelcomeEmail.js';
import EnrolmentConfirmationEmail from '../email-templates/EnrolmentConfirmationEmail.js';
import WaiverReminderEmail from '../email-templates/WaiverReminderEmail.js';
import WaiverCancelledEmail from '../email-templates/WaiverCancelledEmail.js';
import { getEmailColors } from '../config/email-colors.js';
import { EMAIL_TEMPLATE_NAMES, getEmailFooterStrings, getEmailStrings, interpolateTemplate, } from '../i18n/email.js';
import { deepMergeStrings } from './merge-strings.js';
import { normalizeEmailColors } from './normalize-colors.js';
export { EMAIL_TEMPLATE_NAMES };
export function isSupportedEmailTemplate(name) {
    return Object.values(EMAIL_TEMPLATE_NAMES).includes(name);
}
function str(value, fallback = '') {
    return typeof value === 'string' ? value : fallback;
}
function num(value, fallback) {
    return typeof value === 'number' && !Number.isNaN(value) ? value : fallback;
}
function getFooterStrings(language) {
    const base = getEmailFooterStrings(language);
    return base.footer ?? {};
}
function buildSubject(templateStrings, schoolName, fallback) {
    const subjectTemplate = str(templateStrings.subject) || str(templateStrings.preview) || fallback;
    return interpolateTemplate(subjectTemplate, { schoolName });
}
function mergeTemplateStrings(language, templateName, overrides) {
    const base = getEmailStrings(language, templateName);
    return deepMergeStrings(base, overrides ?? undefined);
}
function buildComponent(input, strings, colors, footerStrings) {
    const { templateName, language, schoolName, schoolLogoUrl, variables = {} } = input;
    const v = variables;
    const common = {
        schoolName,
        schoolLogoUrl,
        language,
        colors,
        footerStrings,
        strings,
    };
    switch (templateName) {
        case EMAIL_TEMPLATE_NAMES.OTP:
            return React.createElement(OtpEmail, {
                ...common,
                otpCode: str(v.otpCode) || str(v.code),
                expiresInMinutes: num(v.expiresInMinutes, num(v.expiryMinutes, 10)),
                recipientName: str(v.recipientName) || undefined,
                usageContext: v.usageContext ||
                    'email_verification',
            });
        case EMAIL_TEMPLATE_NAMES.MAGIC_LINK:
            return React.createElement(MagicLinkEmail, {
                ...common,
                magicLinkUrl: str(v.magicLinkUrl) || str(v.confirmationUrl),
                otpCode: str(v.otpCode) || str(v.token) || undefined,
                expiresInMinutes: num(v.expiresInMinutes, 15),
                recipientName: str(v.recipientName) || undefined,
            });
        case EMAIL_TEMPLATE_NAMES.WELCOME:
            return React.createElement(WelcomeEmail, {
                ...common,
                recipientName: str(v.recipientName, 'there'),
                enrolledClassName: str(v.enrolledClassName) || str(v.className),
                enrolledTermName: str(v.enrolledTermName) || str(v.termName),
                dashboardUrl: str(v.dashboardUrl) || str(v.portalUrl, 'https://manage-studio.app/dashboard'),
            });
        case EMAIL_TEMPLATE_NAMES.PAYMENT_REMINDER:
            return React.createElement(PaymentReminderEmail, {
                ...common,
                recipientName: str(v.recipientName, 'there'),
                amountOutstandingFormatted: str(v.amountOutstandingFormatted) || str(v.amount) || str(v.amountFormatted),
                enrolledClassName: str(v.enrolledClassName) || str(v.className) || str(v.description),
                dueDate: str(v.dueDate, '—'),
                paymentUrl: str(v.paymentUrl, '#'),
                invoiceId: str(v.invoiceId) || undefined,
                daysSinceOverdue: num(v.daysSinceOverdue, 0) || undefined,
            });
        case EMAIL_TEMPLATE_NAMES.CLASS_CANCELLATION:
            return React.createElement(ClassCancellationEmail, {
                ...common,
                recipientName: str(v.recipientName, 'there'),
                cancelledClassName: str(v.cancelledClassName) || str(v.className),
                cancelledDate: str(v.cancelledDate) || str(v.effectiveDate) || str(v.date),
                cancellationReason: str(v.cancellationReason) || undefined,
                makeupCreditAmount: str(v.makeupCreditAmount) || undefined,
                rebookUrl: str(v.rebookUrl) || str(v.dashboardUrl) || undefined,
            });
        case EMAIL_TEMPLATE_NAMES.WAITING_LIST_OFFER:
            return React.createElement(WaitingListOfferEmail, {
                ...common,
                recipientName: str(v.recipientName, 'there'),
                className: str(v.className) || str(v.enrolledClassName),
                availableSlots: num(v.availableSlots, 1),
                offerExpiryDate: str(v.offerExpiryDate) || str(v.expirationTime) || str(v.expiryTime),
                enrollNowUrl: str(v.enrollNowUrl) || str(v.enrollUrl) || str(v.enrollmentUrl, '#'),
                termName: str(v.termName) || str(v.enrolledTermName) || undefined,
                classDetails: v.classDetails,
            });
        case EMAIL_TEMPLATE_NAMES.ENROLMENT_CONFIRMATION: {
            const studentName = str(v.studentName) || str(v.recipientName, 'there');
            const recipientName = str(v.recipientName) || studentName;
            const showStudentRow = typeof v.showStudentRow === 'boolean'
                ? v.showStudentRow
                : studentName !== recipientName;
            const paymentRaw = v.paymentSummary;
            const paymentSummary = paymentRaw && typeof paymentRaw === 'object' && !Array.isArray(paymentRaw)
                ? paymentRaw
                : {};
            return React.createElement(EnrolmentConfirmationEmail, {
                ...common,
                recipientName,
                studentName,
                showStudentRow,
                className: str(v.className) || str(v.enrolledClassName),
                classDetails: v.classDetails,
                location: str(v.location) || undefined,
                paymentSummary: {
                    amountFormatted: str(paymentSummary.amountFormatted, '—'),
                    paidOnFormatted: str(paymentSummary.paidOnFormatted, '—'),
                    paymentMethodLabel: str(paymentSummary.paymentMethodLabel, '—'),
                },
                pendingWaiver: Boolean(v.pendingWaiver),
                signUrl: str(v.signUrl) || undefined,
                deadlineDate: str(v.deadlineDate) || undefined,
            });
        }
        case EMAIL_TEMPLATE_NAMES.WAIVER_REMINDER:
            return React.createElement(WaiverReminderEmail, {
                ...common,
                recipientName: str(v.recipientName) || str(v.studentName, 'there'),
                className: str(v.className) || str(v.enrolledClassName),
                signUrl: str(v.signUrl, '#'),
                deadlineDate: str(v.deadlineDate, new Date().toISOString()),
                isUrgent: Boolean(v.isUrgent),
            });
        case EMAIL_TEMPLATE_NAMES.WAIVER_CANCELLED:
            return React.createElement(WaiverCancelledEmail, {
                ...common,
                recipientName: str(v.recipientName) || str(v.studentName, 'there'),
                className: str(v.className) || str(v.enrolledClassName),
                refundNote: str(v.refundNote, 'A full refund has been issued to your original payment method.'),
            });
        default:
            throw new Error(`Unsupported email template: ${templateName}`);
    }
}
/**
 * Render a React Email template to HTML + subject line.
 */
export async function renderEmailTemplate(input) {
    const strings = mergeTemplateStrings(input.language, input.templateName, input.stringOverrides);
    const rawColors = input.tenantColors
        ? getEmailColors(input.tenantColors)
        : getEmailColors();
    const colors = normalizeEmailColors(rawColors);
    const footerStrings = getFooterStrings(input.language);
    const element = buildComponent(input, strings, colors, footerStrings);
    const html = await render(element);
    const subject = input.subject ??
        buildSubject(strings, input.schoolName, input.templateName.replace(/_/g, ' '));
    return { html, subject };
}

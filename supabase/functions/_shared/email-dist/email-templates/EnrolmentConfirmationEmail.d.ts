import { type EmailColorConfig, type EmailFooterStrings } from './BaseEmailTemplate.js';
interface EnrolmentConfirmationEmailProps {
    schoolName: string;
    schoolLogoUrl?: string;
    language: 'en' | 'he';
    colors?: EmailColorConfig;
    footerStrings?: EmailFooterStrings;
    strings?: {
        subject?: string;
        preview?: string;
        greeting?: string;
        enrollment_confirmed?: string;
        enrollment_confirmed_for_student?: string;
        enrollment_reserved?: string;
        enrollment_reserved_for_student?: string;
        class_details_heading?: string;
        payment_summary_heading?: string;
        student_label?: string;
        class_label?: string;
        day_label?: string;
        time_label?: string;
        start_date_label?: string;
        teacher_label?: string;
        location_label?: string;
        amount_paid_label?: string;
        paid_on_label?: string;
        payment_method_label?: string;
        tax_invoice_label?: string;
        tax_invoice_notice?: string;
        waiver_warning_heading?: string;
        waiver_warning_body?: string;
        waiver_cta?: string;
        link_expires?: string;
        no_show_policy?: string;
        confirmation_note?: string;
    };
    recipientName: string;
    studentName: string;
    /** When set, used instead of computing from showStudentRow / pendingWaiver (shell placeholder). */
    headline?: string;
    showStudentRow?: boolean;
    className: string;
    classDetails?: {
        day?: string;
        time?: string;
        startDate?: string;
        teacher?: string;
    };
    location?: string;
    paymentSummary: {
        amountFormatted: string;
        paidOnFormatted: string;
        paymentMethodLabel: string;
    };
    pendingWaiver: boolean;
    signUrl?: string;
    deadlineDate?: string;
}
export default function EnrolmentConfirmationEmail({ schoolName, schoolLogoUrl, language, colors, footerStrings, strings, recipientName, studentName, headline, showStudentRow, className, classDetails, location, paymentSummary, pendingWaiver, signUrl, deadlineDate, }: EnrolmentConfirmationEmailProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=EnrolmentConfirmationEmail.d.ts.map
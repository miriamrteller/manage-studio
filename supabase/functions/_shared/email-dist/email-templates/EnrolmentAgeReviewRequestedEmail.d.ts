import { type EmailColorConfig, type EmailFooterStrings } from './BaseEmailTemplate.js';
interface EnrolmentAgeReviewRequestedEmailProps {
    schoolName: string;
    schoolLogoUrl?: string;
    language: 'en' | 'he';
    colors?: EmailColorConfig;
    footerStrings?: EmailFooterStrings;
    strings?: {
        subject?: string;
        preview?: string;
        greeting?: string;
        intro?: string;
        student_label?: string;
        class_label?: string;
        age_label?: string;
        note_label?: string;
        cta_button?: string;
    };
    studentName: string;
    className: string;
    studentAge?: number | string;
    classAgeRange?: string;
    parentNote: string;
    reviewUrl: string;
}
export default function EnrolmentAgeReviewRequestedEmail({ schoolName, schoolLogoUrl, language, colors, footerStrings, strings, studentName, className, studentAge, classAgeRange, parentNote, reviewUrl, }: EnrolmentAgeReviewRequestedEmailProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=EnrolmentAgeReviewRequestedEmail.d.ts.map
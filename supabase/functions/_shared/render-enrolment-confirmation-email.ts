import {
  applyEnrolmentConfirmationShell,
  ENROLMENT_CONFIRMATION_SHELLS,
  type EnrolmentConfirmationLanguage,
  type EnrolmentConfirmationVariant,
} from "./enrolment-confirmation-email-shells/generated.ts";
import {
  EMAIL_TEMPLATE_NAMES,
  getEmailStrings,
  interpolateTemplate,
} from "./email-dist/i18n/email.js";

export interface RenderEnrolmentConfirmationInput {
  language: EnrolmentConfirmationLanguage;
  schoolName: string;
  recipientName: string;
  studentName: string;
  showStudentRow: boolean;
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
  primaryColor: string;
  accentColor: string;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function formatDeadline(deadlineDate: string | undefined, language: EnrolmentConfirmationLanguage): string | undefined {
  if (!deadlineDate) return undefined;
  const d = new Date(deadlineDate);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toLocaleDateString(language === "he" ? "he-IL" : "en-GB", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/** Render enrolment confirmation HTML without React (Deno-safe). */
export function renderEnrolmentConfirmationHtml(input: RenderEnrolmentConfirmationInput): string {
  const lang = input.language === "he" ? "he" : "en";
  const variant: EnrolmentConfirmationVariant = input.pendingWaiver ? "pending_waiver" : "confirmed";
  const shell = ENROLMENT_CONFIRMATION_SHELLS[lang][variant];

  return applyEnrolmentConfirmationShell(shell, {
    schoolName: input.schoolName,
    recipientName: input.recipientName,
    studentName: input.studentName,
    showStudentRow: input.showStudentRow,
    className: input.className,
    classDay: str(input.classDetails?.day),
    classTime: str(input.classDetails?.time),
    classStartDate: str(input.classDetails?.startDate),
    classTeacher: str(input.classDetails?.teacher),
    location: str(input.location),
    amountPaid: input.paymentSummary.amountFormatted,
    paidOn: input.paymentSummary.paidOnFormatted,
    paymentMethod: input.paymentSummary.paymentMethodLabel,
    signUrl: input.pendingWaiver ? input.signUrl : undefined,
    deadlineDate: input.pendingWaiver ? formatDeadline(input.deadlineDate, lang) : undefined,
    primaryColor: input.primaryColor,
    accentColor: input.accentColor,
  });
}

export function buildEnrolmentConfirmationSubject(
  language: EnrolmentConfirmationLanguage,
  schoolName: string,
): string {
  const strings = getEmailStrings(language, EMAIL_TEMPLATE_NAMES.ENROLMENT_CONFIRMATION);
  const subjectTemplate = typeof strings.subject === "string"
    ? strings.subject
    : "Your enrollment at {schoolName}";
  return interpolateTemplate(subjectTemplate, { schoolName });
}

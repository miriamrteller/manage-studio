import {
  EMAIL_TEMPLATE_NAMES,
  isSupportedEmailTemplate,
  renderEmailTemplate,
  type EmailLanguage,
  type EmailTemplateName,
  type RenderEmailTemplateInput,
} from "shared/email";
import { renderPaymentReminderHtml } from "./render-payment-email.ts";
import {
  buildEnrolmentConfirmationSubject,
  renderEnrolmentConfirmationHtml,
} from "./render-enrolment-confirmation-email.ts";

export {
  EMAIL_TEMPLATE_NAMES,
  isSupportedEmailTemplate,
  renderEmailTemplate,
};
export type { EmailLanguage, EmailTemplateName, RenderEmailTemplateInput };

export interface SendRenderedEmailOptions {
  to: string;
  from: string;
  subject?: string;
  renderInput: RenderEmailTemplateInput;
}

import { sendHtmlEmail } from "./resend-client.ts";

export { sendHtmlEmail };

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export async function sendRenderedEmail(
  options: SendRenderedEmailOptions,
): Promise<{ id: string }> {
  const { renderInput, subject: subjectOverride } = options;
  const variables = renderInput.variables ?? {};

  let html: string;
  let subject: string;

  if (renderInput.templateName === EMAIL_TEMPLATE_NAMES.PAYMENT_REMINDER) {
    html = renderPaymentReminderHtml({
      language: renderInput.language === "he" ? "he" : "en",
      schoolName: renderInput.schoolName,
      recipientName: str(variables.recipientName, "there"),
      amountFormatted:
        str(variables.amountOutstandingFormatted) ||
        str(variables.amount) ||
        str(variables.amountFormatted),
      className:
        str(variables.enrolledClassName) ||
        str(variables.className) ||
        str(variables.description),
      dueDate: str(variables.dueDate, "—"),
      paymentUrl: str(variables.paymentUrl, "#"),
      description: str(variables.description),
      primaryColor: renderInput.tenantColors?.primary_color ?? "#2563eb",
      accentColor: renderInput.tenantColors?.accent_color ?? "#dc2626",
      intro: str(variables.intro) || undefined,
      ctaButton: str(variables.ctaButton) || undefined,
    });
    subject =
      subjectOverride ??
      renderInput.subject ??
      `Payment required — ${str(variables.enrolledClassName) || str(variables.className) || "class"}`;
  } else if (renderInput.templateName === EMAIL_TEMPLATE_NAMES.ENROLMENT_CONFIRMATION) {
    const language = renderInput.language === "he" ? "he" : "en";
    const classDetailsRaw = variables.classDetails;
    const classDetails =
      classDetailsRaw && typeof classDetailsRaw === "object" && !Array.isArray(classDetailsRaw)
        ? (classDetailsRaw as Record<string, unknown>)
        : undefined;
    const paymentRaw = variables.paymentSummary;
    const paymentSummary =
      paymentRaw && typeof paymentRaw === "object" && !Array.isArray(paymentRaw)
        ? (paymentRaw as Record<string, unknown>)
        : {};
    const studentName = str(variables.studentName) || str(variables.recipientName, "there");
    const recipientName = str(variables.recipientName) || studentName;

    html = renderEnrolmentConfirmationHtml({
      language,
      schoolName: renderInput.schoolName,
      recipientName,
      studentName,
      showStudentRow: typeof variables.showStudentRow === "boolean"
        ? variables.showStudentRow
        : studentName !== recipientName,
      className: str(variables.className) || str(variables.enrolledClassName, "class"),
      classDetails: classDetails
        ? {
          day: str(classDetails.day),
          time: str(classDetails.time),
          startDate: str(classDetails.startDate),
          teacher: str(classDetails.teacher),
        }
        : undefined,
      location: str(variables.location) || undefined,
      paymentSummary: {
        amountFormatted: str(paymentSummary.amountFormatted, "—"),
        paidOnFormatted: str(paymentSummary.paidOnFormatted, "—"),
        paymentMethodLabel: str(paymentSummary.paymentMethodLabel, "—"),
      },
      pendingWaiver: Boolean(variables.pendingWaiver),
      signUrl: str(variables.signUrl) || undefined,
      deadlineDate: str(variables.deadlineDate) || undefined,
      primaryColor: renderInput.tenantColors?.primary_color ?? "#2563eb",
      accentColor: renderInput.tenantColors?.accent_color ?? "#dc2626",
    });
    subject =
      subjectOverride ??
      renderInput.subject ??
      buildEnrolmentConfirmationSubject(language, renderInput.schoolName);
  } else {
    const rendered = await renderEmailTemplate({
      ...renderInput,
      subject: subjectOverride ?? renderInput.subject,
    });
    html = rendered.html;
    subject = rendered.subject;
  }

  return sendHtmlEmail({
    to: options.to,
    from: options.from,
    subject,
    html,
  });
}

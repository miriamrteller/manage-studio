import {
  EMAIL_TEMPLATE_NAMES,
  isSupportedEmailTemplate,
  renderEmailTemplate,
  type EmailLanguage,
  type EmailTemplateName,
  type RenderEmailTemplateInput,
} from "shared/email";
import { renderPaymentReminderHtml } from "./render-payment-email.ts";

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

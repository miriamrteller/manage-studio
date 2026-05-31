import {
  EMAIL_TEMPLATE_NAMES,
  isSupportedEmailTemplate,
  renderEmailTemplate,
  type EmailLanguage,
  type EmailTemplateName,
  type RenderEmailTemplateInput,
} from "shared/email";

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

export async function sendRenderedEmail(
  options: SendRenderedEmailOptions,
): Promise<{ id: string }> {
  const { html, subject } = await renderEmailTemplate({
    ...options.renderInput,
    subject: options.subject ?? options.renderInput.subject,
  });

  return sendHtmlEmail({
    to: options.to,
    from: options.from,
    subject,
    html,
  });
}

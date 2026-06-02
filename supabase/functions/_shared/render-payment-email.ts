import {
  applyPaymentReminderShell,
  PAYMENT_REMINDER_SHELLS,
  type PaymentEmailLanguage,
} from "./payment-email-shells/generated.ts";

export interface RenderPaymentReminderInput {
  language: PaymentEmailLanguage;
  schoolName: string;
  recipientName: string;
  amountFormatted: string;
  className: string;
  dueDate: string;
  paymentUrl: string;
  description: string;
  primaryColor: string;
  accentColor: string;
}

/** Render payment reminder HTML without React (Deno-safe). */
export function renderPaymentReminderHtml(input: RenderPaymentReminderInput): string {
  const lang = input.language === "he" ? "he" : "en";
  const shell = PAYMENT_REMINDER_SHELLS[lang];
  return applyPaymentReminderShell(shell, input);
}

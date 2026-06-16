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
  intro?: string;
  ctaButton?: string;
}

const EN_INTRO_PATTERN =
  /This is a reminder that payment for .*? is due soon\./;
const HE_INTRO_PATTERN =
  /זו תזכורת שתשלום עבור .*? יהיה בקרוב\./;

/** Render payment reminder HTML without React (Deno-safe). */
export function renderPaymentReminderHtml(input: RenderPaymentReminderInput): string {
  const lang = input.language === "he" ? "he" : "en";
  const shell = PAYMENT_REMINDER_SHELLS[lang];
  let html = applyPaymentReminderShell(shell, input);

  if (input.intro) {
    html = html.replace(lang === "he" ? HE_INTRO_PATTERN : EN_INTRO_PATTERN, input.intro);
  }

  if (input.ctaButton) {
    const defaultCta = lang === "he" ? "בצע תשלום" : "Make Payment";
    html = html.split(`>${defaultCta}<`).join(`>${input.ctaButton}<`);
  }

  return html;
}

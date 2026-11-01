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
  /**
   * Studio with no online payments: the pay button and link are replaced by the
   * studio's own "pay at the studio" instructions (tenants.offline_payment_instructions).
   */
  offline?: { instructions: string | null };
}

const EN_INTRO_PATTERN =
  /This is a reminder that payment for .*? is due soon\./;
const HE_INTRO_PATTERN =
  /זו תזכורת שתשלום עבור .*? יהיה בקרוב\./;

/** The "Make Payment" button block and the plain-text link box of the generated shell. */
const PAY_BUTTON_BLOCK = /<div style="margin-bottom:25px;text-align:center"><a href="[^"]*"[\s\S]*?<\/a><\/div>/;
const PAY_LINK_BOX = /<div style="background-color:#f3f4f6;padding:12px;border-radius:4px;margin-bottom:25px;word-break:break-all"><a [\s\S]*?<\/a><\/div>/;
const LOGIN_HINT: Record<PaymentEmailLanguage, string> = {
  en: "Please log in to your account to make a payment or set up automatic payments.",
  he: "אנא היכנס לחשבונך כדי לבצע תשלום או להגדיר תשלומים אוטומטיים.",
};
const OFFLINE_HEADING: Record<PaymentEmailLanguage, string> = {
  en: "How to pay",
  he: "איך משלמים",
};
const OFFLINE_FALLBACK: Record<PaymentEmailLanguage, string> = {
  en: "Please pay at the studio in cash or by bank transfer. Contact us for the details.",
  he: "נא לשלם בסטודיו במזומן או בהעברה בנקאית. לפרטים, פנו אלינו.",
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Escaped, line breaks kept, so a studio can list bank details on separate lines. */
export function renderOfflineInstructionsBlock(
  lang: PaymentEmailLanguage,
  instructions: string | null,
  accentColor: string,
): string {
  const text = instructions?.trim() ? instructions.trim() : OFFLINE_FALLBACK[lang];
  const body = escapeHtml(text).replace(/\r?\n/g, "<br/>");
  return (
    `<div style="background-color:#f0f9ff;padding:20px;border-radius:8px;margin-bottom:25px;` +
    `border-inline-start:4px solid ${escapeHtml(accentColor)}">` +
    `<p style="font-size:14px;line-height:24px;margin:0 0 10px 0;font-weight:600">${OFFLINE_HEADING[lang]}</p>` +
    `<p style="font-size:14px;line-height:1.6;margin:0">${body}</p></div>`
  );
}

/** Render payment reminder HTML without React (Deno-safe). */
export function renderPaymentReminderHtml(input: RenderPaymentReminderInput): string {
  const lang = input.language === "he" ? "he" : "en";
  const shell = PAYMENT_REMINDER_SHELLS[lang];
  let html = applyPaymentReminderShell(shell, input);

  if (input.intro) {
    html = html.replace(lang === "he" ? HE_INTRO_PATTERN : EN_INTRO_PATTERN, input.intro);
  }

  if (input.offline) {
    html = html
      .replace(PAY_BUTTON_BLOCK, renderOfflineInstructionsBlock(lang, input.offline.instructions, input.accentColor))
      .replace(PAY_LINK_BOX, "")
      .replace(new RegExp(`<p[^>]*>${LOGIN_HINT[lang]}</p>`), "");
    return html;
  }

  if (input.ctaButton) {
    const defaultCta = lang === "he" ? "בצע תשלום" : "Make Payment";
    html = html.split(`>${defaultCta}<`).join(`>${input.ctaButton}<`);
  }

  return html;
}

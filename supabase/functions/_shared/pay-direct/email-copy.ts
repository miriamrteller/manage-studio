/**
 * Email to the studio when a client sends a payment screenshot from a payment page
 * (/pay/:token or the enrolment pay step). Pure, plain text: the announcement layout
 * escapes it.
 */
export type Lang = "en" | "he";

export function buildStudioPaymentProofEmail(i: {
  language: Lang;
  clientName: string;
  /** What the payment is for: the request's label or the class / booking name. */
  what: string;
  totalFormatted: string;
  /** e.g. "by Bit" / "בביט"; empty when not known. */
  payHow: string;
  /** Admin page with the screenshot. */
  proofsUrl: string;
}): { subject: string; body: string } {
  if (i.language === "he") {
    const how = i.payHow ? ` ${i.payHow}` : "";
    return {
      subject: `צילום מסך של תשלום: ${i.clientName}`,
      body:
        `${i.clientName} שלח/ה צילום מסך של התשלום${how} עבור ${i.what}, בסך ${i.totalFormatted}.\n\n` +
        `לצפייה בצילום המסך:\n${i.proofsUrl}\n\n` +
        `אחרי שבודקים שהכסף התקבל, רושמים את התשלום כרגיל.`,
    };
  }
  const how = i.payHow ? ` ${i.payHow}` : "";
  return {
    subject: `Payment screenshot: ${i.clientName}`,
    body:
      `${i.clientName} sent a screenshot of their payment${how} for ${i.what}, ${i.totalFormatted} in total.\n\n` +
      `See the screenshot:\n${i.proofsUrl}\n\n` +
      `Once you've checked the money is in, record the payment as usual.`,
  };
}

/**
 * To the client, at 1, 3 and 7 days: Bit / bank transfer were on offer on their payment page
 * and no screenshot has come yet (owner, 23 Nov 2026). Never says anything is blocked.
 */
export function buildClientPaymentProofReminderEmail(i: {
  language: Lang;
  studioName: string;
  /** What the payment is for: the request's label or the class / booking name. */
  what: string;
  /** Empty when not known. */
  totalFormatted: string;
  /** The studio's ways, one paragraph each (payDirectWaysText). */
  ways: string;
  payUrl: string;
}): { subject: string; body: string } {
  if (i.language === "he") {
    const about = [i.what, i.totalFormatted].filter(Boolean).join(", ");
    return {
      subject: `צילום מסך של התשלום ל${i.studioName}`,
      body:
        `עדיין לא קיבלנו צילום מסך של התשלום${about ? ` (${about})` : ""}.\n\n` +
        (i.ways ? `אם עוד לא שילמת, משלמים לסטודיו:\n${i.ways}\n\n` : "") +
        `לשליחת צילום המסך:\n${i.payUrl}\n\n` +
        `כבר שילמת והסטודיו רשם את התשלום? אפשר להתעלם מהמייל הזה.`,
    };
  }
  const about = [i.what, i.totalFormatted].filter(Boolean).join(", ");
  return {
    subject: `Payment screenshot for ${i.studioName}`,
    body:
      `We haven't had a screenshot of your payment yet${about ? ` (${about})` : ""}.\n\n` +
      (i.ways ? `If you haven't paid yet, pay the studio:\n${i.ways}\n\n` : "") +
      `Send the screenshot here:\n${i.payUrl}\n\n` +
      `Already paid and the studio has recorded it? You can ignore this email.`,
  };
}

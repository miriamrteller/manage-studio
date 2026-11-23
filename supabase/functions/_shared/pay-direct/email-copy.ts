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

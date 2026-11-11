/** Studio shop email text (EN + HE). No imports, so tests and any function can use it. */

export type Lang = "he" | "en";

export interface ShopEmailLine {
  name: string;
  size: string;
  quantity: number;
}

function lineText(l: ShopEmailLine, lang: Lang): string {
  const size = l.size === "One size" ? "" : lang === "he" ? ` (מידה ${l.size})` : ` (${l.size})`;
  return `• ${l.name}${size}${l.quantity > 1 ? ` ×${l.quantity}` : ""}`;
}

/** To the studio when a family has paid: what to get ready, for whom. */
export function buildStudioShopOrderPaidEmail(i: {
  language: Lang;
  forName: string;
  totalFormatted: string;
  lines: ShopEmailLine[];
  shopUrl: string;
}): { subject: string; body: string } {
  const list = i.lines.map((l) => lineText(l, i.language)).join("\n");
  if (i.language === "he") {
    return {
      subject: `הזמנה חדשה מהחנות: ${i.forName}`,
      body:
        `הזמנה עבור ${i.forName} שולמה, בסך ${i.totalFormatted}.\n\n` +
        `הפריטים:\n${list}\n\n` +
        `כשהפריטים מוכנים לאיסוף, יש ללחוץ על "מוכן לאיסוף" בחנות והמשפחה תקבל הודעה:\n${i.shopUrl}`,
    };
  }
  return {
    subject: `New shop order: ${i.forName}`,
    body:
      `An order for ${i.forName} has been paid, ${i.totalFormatted} in total.\n\n` +
      `The items:\n${list}\n\n` +
      `When they are ready, press "Ready to collect" in the shop and the family will be told:\n${i.shopUrl}`,
  };
}

/** To the family when the studio has the order ready. */
export function buildFamilyShopOrderReadyEmail(i: {
  language: Lang;
  studioName: string;
  forName: string;
  lines: ShopEmailLine[];
  portalUrl: string;
}): { subject: string; body: string } {
  const list = i.lines.map((l) => lineText(l, i.language)).join("\n");
  if (i.language === "he") {
    return {
      subject: "ההזמנה שלך מוכנה לאיסוף",
      body:
        `ההזמנה עבור ${i.forName} מוכנה לאיסוף ב${i.studioName}.\n\n` +
        `הפריטים:\n${list}\n\n` +
        `ההזמנות שלך נמצאות גם בחשבון:\n${i.portalUrl}`,
    };
  }
  return {
    subject: "Your order is ready to collect",
    body:
      `The order for ${i.forName} is ready to collect at ${i.studioName}.\n\n` +
      `The items:\n${list}\n\n` +
      `Your orders are also in your account:\n${i.portalUrl}`,
  };
}

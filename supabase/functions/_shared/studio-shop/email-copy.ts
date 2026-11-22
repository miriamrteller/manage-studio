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

/**
 * To the buyer when they order on the public Shop page. Card: the pay link, and that the
 * items are kept for 48 hours. Paying the studio directly: how to pay and collect.
 */
export function buildBuyerShopOrderPlacedEmail(i: {
  language: Lang;
  studioName: string;
  buyerName: string;
  totalFormatted: string;
  lines: ShopEmailLine[];
  payByCash: boolean;
  /** Card orders only. */
  payUrl: string | null;
}): { subject: string; body: string } {
  const list = i.lines.map((l) => lineText(l, i.language)).join("\n");
  if (i.language === "he") {
    return {
      subject: `ההזמנה שלך מ${i.studioName}`,
      body:
        `שלום ${i.buyerName},\n\nקיבלנו את ההזמנה שלך, בסך ${i.totalFormatted}.\n\n` +
        `הפריטים:\n${list}\n\n` +
        (i.payByCash
          ? `התשלום ישירות לסטודיו (מזומן, העברה בנקאית או דרך אחרת). ` +
            `נשלח לך מייל כשההזמנה תהיה מוכנה לאיסוף בסטודיו.`
          : `אפשר לשלם כאן:\n${i.payUrl}\n\n` +
            `שומרים לך את הפריטים 48 שעות. נשלח לך מייל כשההזמנה תהיה מוכנה לאיסוף בסטודיו.`),
    };
  }
  return {
    subject: `Your order from ${i.studioName}`,
    body:
      `Hello ${i.buyerName},\n\nThank you for your order, ${i.totalFormatted} in total.\n\n` +
      `The items:\n${list}\n\n` +
      (i.payByCash
        ? `You pay the studio directly (cash, bank transfer or another way they accept). ` +
          `We'll email you when your order is ready to collect at the studio.`
        : `You can pay here:\n${i.payUrl}\n\n` +
          `Your items are kept for you for 48 hours. We'll email you when your order is ready to collect at the studio.`),
  };
}

/** To the studio when a public Shop page buyer will pay the studio directly. */
export function buildStudioShopOrderSentInEmail(i: {
  language: Lang;
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string | null;
  totalFormatted: string;
  lines: ShopEmailLine[];
  shopUrl: string;
}): { subject: string; body: string } {
  const list = i.lines.map((l) => lineText(l, i.language)).join("\n");
  const contact = [i.buyerEmail, i.buyerPhone].filter(Boolean).join(", ");
  if (i.language === "he") {
    return {
      subject: `הזמנה חדשה מהחנות: ${i.buyerName}`,
      body:
        `${i.buyerName} (${contact}) הזמינו בסך ${i.totalFormatted}, ותשלום ישירות לסטודיו.\n\n` +
        `הפריטים:\n${list}\n\n` +
        `כשמתקבל התשלום, יש ללחוץ על "רישום תשלום במזומן" בהזמנה:\n${i.shopUrl}`,
    };
  }
  return {
    subject: `New shop order: ${i.buyerName}`,
    body:
      `${i.buyerName} (${contact}) ordered ${i.totalFormatted} and will pay you directly.\n\n` +
      `The items:\n${list}\n\n` +
      `When they pay, press "Record cash payment" on the order:\n${i.shopUrl}`,
  };
}

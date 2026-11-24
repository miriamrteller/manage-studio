/** Photo shop email text (EN + HE). No imports, so tests and any function can use it. */

export type Lang = "he" | "en";

export interface StudioOrderEmailInput {
  language: Lang;
  clientName: string;
  totalFormatted: string;
  photos: { fileName: string; key: string }[];
  shootUrl: string;
  /** Sent in to be paid in cash: not paid yet. */
  payInCash?: boolean;
  /** With payInCash: the ways the studio offers, e.g. "by Bit or in cash" (default "in cash"). */
  payHow?: string | null;
}

export function buildStudioOrderEmail(i: StudioOrderEmailInput): { subject: string; body: string } {
  const list = i.photos.map((p) => `• ${p.fileName} (${p.key})`).join("\n");
  if (i.payInCash) {
    if (i.language === "he") {
      const how = i.payHow || "במזומן";
      return {
        subject: `הזמנת תמונות חדשה, תשלום ${how}: ${i.clientName} (${i.photos.length})`,
        body:
          `${i.clientName} הזמין/ה ${i.photos.length} תמונות, בסך ${i.totalFormatted}, וישלם/תשלם ${how}.\n\n` +
          `התמונות:\n${list}\n\n` +
          `כשמקבלים את הכסף, יש ללחוץ על "רישום תשלום במזומן" בהזמנה:\n${i.shootUrl}`,
      };
    }
    const how = i.payHow || "in cash";
    return {
      subject: `New photo order, paying ${how}: ${i.clientName} (${i.photos.length})`,
      body:
        `${i.clientName} ordered ${i.photos.length} photos, ${i.totalFormatted} in total, and will pay you ${how}.\n\n` +
        `The photos:\n${list}\n\n` +
        `When you have the money, press "Record cash payment" on the order:\n${i.shootUrl}`,
    };
  }
  if (i.language === "he") {
    return {
      subject: `הזמנת תמונות חדשה: ${i.clientName} (${i.photos.length})`,
      body:
        `${i.clientName} קנה/תה ${i.photos.length} תמונות, בסך ${i.totalFormatted}.\n\n` +
        `התמונות:\n${list}\n\n` +
        `יש ליצור ב-SmugMug גלריית הורדה עם התמונות האלה, להדביק את הקישור בהזמנה וללחוץ על שליחה:\n${i.shootUrl}`,
    };
  }
  return {
    subject: `New photo order: ${i.clientName} (${i.photos.length})`,
    body:
      `${i.clientName} bought ${i.photos.length} photos, ${i.totalFormatted} in total.\n\n` +
      `The photos:\n${list}\n\n` +
      `Make a download gallery on SmugMug with these photos, paste its link into the order and press Send:\n${i.shootUrl}`,
  };
}

export interface ClientPayDirectEmailInput {
  language: Lang;
  studioName: string;
  photoCount: number;
  totalFormatted: string;
  /** The studio's ways to pay with their details, already written out (one paragraph each). */
  ways: string;
  /** A payment screenshot is asked for (Bit / bank transfer on offer). */
  asksForProof: boolean;
  /** The order's payment page: pick a way, pay, send the screenshot. */
  payUrl: string;
}

/** To the client, an order to pay the studio by Bit or bank transfer: how to pay. */
export function buildClientPayDirectEmail(i: ClientPayDirectEmailInput): { subject: string; body: string } {
  const ways = i.ways;
  if (i.language === "he") {
    return {
      subject: `הזמנת התמונות שלך מ${i.studioName}: איך משלמים`,
      body:
        `תודה על ההזמנה: ${i.photoCount === 1 ? "תמונה אחת" : `${i.photoCount} תמונות`}, בסך ${i.totalFormatted}.\n\n` +
        `אפשר לשלם לסטודיו:\n${ways}\n\n` +
        (i.asksForProof
          ? `בוחרים איך לשלם בעמוד התשלום. בביט או בהעברה בנקאית, שולחים שם צילום מסך של התשלום:\n${i.payUrl}\n\n`
          : `בוחרים איך לשלם בעמוד התשלום:\n${i.payUrl}\n\n`) +
        `כשהסטודיו יקבל את התשלום, הוא יכין את התמונות וישלח לך במייל קישור להורדה.`,
    };
  }
  return {
    subject: `Your photo order from ${i.studioName}: how to pay`,
    body:
      `Thank you for your order: ${i.photoCount === 1 ? "1 photo" : `${i.photoCount} photos`}, ${i.totalFormatted} in total.\n\n` +
      `You can pay the studio:\n${ways}\n\n` +
      (i.asksForProof
        ? `Choose how you'll pay on the payment page. For Bit or bank transfer, send a screenshot of your payment there:\n${i.payUrl}\n\n`
        : `Choose how you'll pay on the payment page:\n${i.payUrl}\n\n`) +
      `When the studio has your payment, they prepare your photos and email you a download link.`,
  };
}

/** Reminder to the client: please send the payment screenshot. */
export function buildClientProofReminderEmail(i: ClientPayDirectEmailInput): { subject: string; body: string } {
  const ways = i.ways;
  if (i.language === "he") {
    return {
      subject: `צילום מסך של התשלום להזמנת התמונות מ${i.studioName}`,
      body:
        `עדיין לא קיבלנו צילום מסך של התשלום על ההזמנה שלך (${i.photoCount === 1 ? "תמונה אחת" : `${i.photoCount} תמונות`}, ${i.totalFormatted}).\n\n` +
        (ways ? `אם עוד לא שילמת, משלמים לסטודיו:\n${ways}\n\n` : "") +
        `לשליחת צילום המסך:\n${i.payUrl}\n\n` +
        `כבר שילמת והסטודיו רשם את התשלום? אפשר להתעלם מהמייל הזה.`,
    };
  }
  return {
    subject: `Payment screenshot for your photo order from ${i.studioName}`,
    body:
      `We haven't had a screenshot of your payment for your order yet (${i.photoCount === 1 ? "1 photo" : `${i.photoCount} photos`}, ${i.totalFormatted}).\n\n` +
      (ways ? `If you haven't paid yet, pay the studio:\n${ways}\n\n` : "") +
      `Send the screenshot here:\n${i.payUrl}\n\n` +
      `Already paid and the studio has recorded it? You can ignore this email.`,
  };
}

/** To the studio: the client sent a payment screenshot. */
export function buildStudioProofEmail(i: {
  language: Lang;
  clientName: string;
  photoCount: number;
  totalFormatted: string;
  /** e.g. "by Bit" / "בביט"; empty when not known. */
  payHow: string;
  shootUrl: string;
}): { subject: string; body: string } {
  if (i.language === "he") {
    const how = i.payHow;
    return {
      subject: `צילום מסך של תשלום: ${i.clientName}`,
      body:
        `${i.clientName} שלח/ה צילום מסך של התשלום${how ? ` ${how}` : ""} על הזמנת ${i.photoCount} תמונות, בסך ${i.totalFormatted}.\n\n` +
        `צילום המסך נמצא בהזמנה. אחרי שבודקים שהכסף התקבל, יש ללחוץ על "רישום תשלום במזומן":\n${i.shootUrl}`,
    };
  }
  const how = i.payHow ? ` ${i.payHow}` : "";
  return {
    subject: `Payment screenshot: ${i.clientName}`,
    body:
      `${i.clientName} sent a screenshot of their payment${how} for ${i.photoCount} photos, ${i.totalFormatted} in total.\n\n` +
      `The screenshot is on the order. Once you've checked the money is in, press "Record cash payment":\n${i.shootUrl}`,
  };
}

export function buildClientDeliveredEmail(
  i: { language: Lang; studioName: string; photoCount: number; downloadUrl: string; portalUrl: string },
): { subject: string; body: string } {
  if (i.language === "he") {
    return {
      subject: "התמונות שלך מוכנות להורדה",
      body:
        `${i.studioName} שלח/ה את ${i.photoCount === 1 ? "התמונה שקנית" : `${i.photoCount} התמונות שקנית`}.\n\n` +
        `להורדה:\n${i.downloadUrl}\n\n` +
        `הקישור נמצא גם בחשבון שלך:\n${i.portalUrl}`,
    };
  }
  return {
    subject: "Your photos are ready to download",
    body:
      `${i.studioName} has sent ${i.photoCount === 1 ? "the photo you bought" : `the ${i.photoCount} photos you bought`}.\n\n` +
      `Download them here:\n${i.downloadUrl}\n\n` +
      `The link is also in your account:\n${i.portalUrl}`,
  };
}

/** "Email shop link to client": the shoot's photos are ready to view and order. */
export function buildClientShopLinkEmail(
  i: { language: Lang; studioName: string; url: string; days: number },
): { subject: string; body: string } {
  if (i.language === "he") {
    return {
      subject: "התמונות מהצילום מוכנות",
      body:
        `התמונות מהצילום ב${i.studioName} מוכנות. אפשר לצפות בהן ולבחור תמונות כאן:\n${i.url}\n\n` +
        `הקישור פעיל ${i.days} ימים. אחר כך התמונות מחכות בחשבון שלך.`,
    };
  }
  return {
    subject: "Your photos are ready",
    body:
      `Your photos from your shoot with ${i.studioName} are ready. See them and choose the ones you want here:\n${i.url}\n\n` +
      `This link works for ${i.days} days. After that, your photos are waiting in your account.`,
  };
}

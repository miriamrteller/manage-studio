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
}

export function buildStudioOrderEmail(i: StudioOrderEmailInput): { subject: string; body: string } {
  const list = i.photos.map((p) => `• ${p.fileName} (${p.key})`).join("\n");
  if (i.payInCash) {
    if (i.language === "he") {
      return {
        subject: `הזמנת תמונות חדשה, תשלום במזומן: ${i.clientName} (${i.photos.length})`,
        body:
          `${i.clientName} הזמין/ה ${i.photos.length} תמונות, בסך ${i.totalFormatted}, וישלם/תשלם במזומן.\n\n` +
          `התמונות:\n${list}\n\n` +
          `כשמקבלים את הכסף, יש ללחוץ על "רישום תשלום במזומן" בהזמנה:\n${i.shootUrl}`,
      };
    }
    return {
      subject: `New photo order, paying in cash: ${i.clientName} (${i.photos.length})`,
      body:
        `${i.clientName} ordered ${i.photos.length} photos, ${i.totalFormatted} in total, and will pay you in cash.\n\n` +
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

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.105.3";
import { formatCurrency, formatDate } from "../email-dist/format.js";
import { resolveOfferingPrice } from "../email-dist/pricing.js";
import { loadEngagementDiscount, priceAfterDiscount } from "../payments/class-discount.ts";
import { resolveEnrolmentNotificationRecipient } from "../enrolment-recipient.ts";

export type DunningKind = "renewal" | "enrolment_unpaid";

/** Pay-at-the-studio tenant: the reminder carries these instructions instead of a pay link. */
export interface OfflineDunningInput {
  instructions: string | null;
  /** Day on which the unpaid place is released (ladder's last step). */
  cancelAfterDays: number;
}

export interface DunningEmailContext {
  recipientEmail: string;
  recipientName: string;
  recipientPersonId: string;
  variables: Record<string, unknown>;
  subject: string;
}

export function buildRenewalDunningEmailCopy(input: {
  language: "en" | "he";
  className: string;
  studentName: string;
  attemptCount: number;
  nextActionAt: string | null;
}): Pick<DunningEmailContext, "variables" | "subject"> & {
  intro: string;
  ctaButton: string;
  dueDate: string;
  description: string;
} {
  const locale = input.language === "he" ? "he-IL" : "en-GB";
  const description = `${input.studentName} — ${input.className}`;
  const dueDate = input.attemptCount >= 3 || !input.nextActionAt
    ? formatDate(new Date().toISOString(), locale)
    : formatDate(input.nextActionAt, locale);

  const intros: Record<"en" | "he", Record<1 | 2 | 3, string>> = {
    en: {
      1: `We couldn't process your monthly payment for ${input.className}. We'll try again on ${dueDate}.`,
      2: `Your monthly payment for ${input.className} is still outstanding. We'll retry on ${dueDate}.`,
      3: `Your billing for ${input.className} is suspended after 3 failed payment attempts. Please update your payment method in the portal.`,
    },
    he: {
      1: `לא הצלחנו לחייב את התשלום החודשי עבור ${input.className}. ננסה שוב ב-${dueDate}.`,
      2: `התשלום החודשי עבור ${input.className} עדיין לא עבר. ננסה שוב ב-${dueDate}.`,
      3: `החיוב עבור ${input.className} הושעה לאחר 3 ניסיונות כושלים. עדכנו את אמצעי התשלום בפורטל.`,
    },
  };

  const ctaButtons: Record<"en" | "he", Record<"retry" | "portal", string>> = {
    en: { retry: "Update payment method", portal: "Open parent portal" },
    he: { retry: "עדכון אמצעי תשלום", portal: "כניסה לפורטל" },
  };

  const attempt = Math.min(Math.max(input.attemptCount, 1), 3) as 1 | 2 | 3;
  const intro = intros[input.language][attempt];
  const ctaButton = attempt >= 3
    ? ctaButtons[input.language].portal
    : ctaButtons[input.language].retry;

  const subject = input.language === "he"
    ? (attempt >= 3 ? `החיוב הושעה — ${input.className}` : `תשלום נכשל — ${input.className}`)
    : (attempt >= 3 ? `Billing suspended — ${input.className}` : `Payment failed — ${input.className}`);

  return { intro, ctaButton, dueDate, description, subject, variables: {} };
}

export function buildEnrolmentUnpaidEmailCopy(input: {
  language: "en" | "he";
  className: string;
  studentName: string;
  attemptCount: number;
  dueDate: string;
  /** Pay-at-the-studio tenant: no link, pay at the studio, place released on this day. */
  offline?: { cancelAfterDays: number };
}): Pick<DunningEmailContext, "variables" | "subject"> & {
  intro: string;
  ctaButton: string;
  description: string;
} {
  const description = `${input.studentName} — ${input.className}`;
  const attempt = Math.min(Math.max(input.attemptCount, 1), 2) as 1 | 2;

  const intros: Record<"en" | "he", Record<1 | 2, string>> = input.offline
    ? {
      en: {
        1: `Payment for ${input.className} is still outstanding. Please pay at the studio (cash or bank transfer) — the details are below.`,
        2: `Reminder: enrollment for ${input.className} is still unpaid. Please pay at the studio soon — the place is released if payment is not received within ${input.offline.cancelAfterDays} days of enrolling. The details are below.`,
      },
      he: {
        1: `התשלום עבור ${input.className} עדיין לא הושלם. נא לשלם בסטודיו (מזומן או העברה בנקאית) — הפרטים למטה.`,
        2: `תזכורת: ההרשמה ל${input.className} עדיין לא שולמה. נא לשלם בסטודיו בהקדם — המקום משתחרר אם התשלום לא מתקבל בתוך ${input.offline.cancelAfterDays} ימים מההרשמה. הפרטים למטה.`,
      },
    }
    : {
      en: {
        1: `Payment for ${input.className} is still outstanding. Please complete enrollment using the link below.`,
        2: `Reminder: enrollment for ${input.className} is still unpaid. Please complete payment soon to secure the spot.`,
      },
      he: {
        1: `התשלום עבור ${input.className} עדיין לא הושלם. נא להשלים את ההרשמה בקישור למטה.`,
        2: `תזכורת: ההרשמה ל${input.className} עדיין לא שולמה. נא להשלים את התשלום בהקדם.`,
      },
    };

  const ctaButton = input.language === "he" ? "השלמת הרשמה ותשלום" : "Complete enrollment";

  const subject = input.language === "he"
    ? (attempt === 2
      ? `תזכורת: השלמת הרשמה — ${input.className}`
      : `השלמת הרשמה — ${input.className}`)
    : (attempt === 2
      ? `Reminder: complete enrollment — ${input.className}`
      : `Complete enrollment — ${input.className}`);

  return {
    intro: intros[input.language][attempt],
    ctaButton,
    description,
    subject,
    variables: {},
  };
}

export async function buildDunningEmailContext(
  service: SupabaseClient,
  input: {
    kind: DunningKind;
    tenantId: string;
    engagementId: string;
    offeringId: string;
    personId: string;
    attemptCount: number;
    nextActionAt: string | null;
    paymentUrl: string;
    language: "en" | "he";
    linkExpiresAt?: Date;
    offline?: OfflineDunningInput;
  },
): Promise<DunningEmailContext | null> {
  const recipient = await resolveEnrolmentNotificationRecipient(
    service,
    input.tenantId,
    input.personId,
  );
  if (!recipient) return null;

  const { data: student } = await service
    .from("people")
    .select("name")
    .eq("id", input.personId)
    .eq("tenant_id", input.tenantId)
    .single();

  const studentName = (student?.name as string) ?? recipient.name;

  const { data: offering } = await service
    .from("offerings")
    .select("name, price_minor, currency")
    .eq("id", input.offeringId)
    .eq("tenant_id", input.tenantId)
    .single();

  if (!offering) return null;

  const { data: tenant } = await service
    .from("tenants")
    .select("currency")
    .eq("id", input.tenantId)
    .single();

  const discount = await loadEngagementDiscount(service, input.engagementId);
  const pricing = resolveOfferingPrice({
    price_minor: priceAfterDiscount(offering.price_minor as number, discount.discountMinor),
  });
  const currency = (offering.currency ?? tenant?.currency ?? "ILS").toUpperCase();
  const locale = input.language === "he" ? "he-IL" : "en-GB";
  const className = (offering.name as string) ?? "Class";
  const amountOutstandingFormatted = formatCurrency(pricing.totalMinor, currency, locale);

  if (input.kind === "renewal") {
    const copy = buildRenewalDunningEmailCopy({
      language: input.language,
      className,
      studentName,
      attemptCount: input.attemptCount,
      nextActionAt: input.nextActionAt,
    });

    return {
      recipientEmail: recipient.email,
      recipientName: recipient.name,
      recipientPersonId: recipient.personId,
      subject: copy.subject,
      variables: {
        subject: copy.subject,
        recipientName: recipient.name,
        enrolledClassName: className,
        className,
        amountOutstandingFormatted,
        amountFormatted: amountOutstandingFormatted,
        dueDate: copy.dueDate,
        paymentUrl: input.paymentUrl,
        description: copy.description,
        intro: copy.intro,
        ctaButton: copy.ctaButton,
      },
    };
  }

  const linkExpiresAt = input.linkExpiresAt ?? new Date(Date.now() + 7 * 24 * 3600 * 1000);
  const dueDate = formatDate(linkExpiresAt.toISOString(), locale);
  const copy = buildEnrolmentUnpaidEmailCopy({
    language: input.language,
    className,
    studentName,
    attemptCount: input.attemptCount,
    dueDate,
    offline: input.offline ? { cancelAfterDays: input.offline.cancelAfterDays } : undefined,
  });

  return {
    recipientEmail: recipient.email,
    recipientName: recipient.name,
    recipientPersonId: recipient.personId,
    subject: copy.subject,
    variables: {
      subject: copy.subject,
      recipientName: recipient.name,
      enrolledClassName: className,
      className,
      amountOutstandingFormatted,
      amountFormatted: amountOutstandingFormatted,
      dueDate,
      paymentUrl: input.paymentUrl,
      description: copy.description,
      intro: copy.intro,
      ctaButton: copy.ctaButton,
      ...(input.offline
        ? { offlinePayment: true, offlineInstructions: input.offline.instructions ?? "" }
        : {}),
    },
  };
}

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.105.3";
import { formatCurrency, formatDate } from "./email-dist/format.js";
import { resolveOfferingPrice } from "./email-dist/pricing.js";
import { loadEngagementDiscount, NO_DISCOUNT, priceAfterDiscount } from "./payments/class-discount.ts";

export interface EnrolmentPaymentEmailDetails {
  className: string;
  studentName: string;
  amountOutstandingFormatted: string;
  amountMinor: number;
  currency: string;
  dueDate: string;
  description: string;
  intro: string;
  ctaButton: string;
}

export function buildAdminCompletionLinkEmailCopy(input: {
  language: "en" | "he";
  studentName: string;
  className: string;
  dueDate: string;
}): Pick<EnrolmentPaymentEmailDetails, "intro" | "ctaButton" | "description" | "dueDate"> {
  const { language, studentName, className, dueDate } = input;
  if (language === "he") {
    return {
      intro: `נא להשלים את הרשמת ${studentName} לשיעור ${className} באמצעות הקישור למטה.`,
      ctaButton: "השלמת הרשמה ותשלום",
      description: `${studentName} — ${className}`,
      dueDate,
    };
  }
  return {
    intro: `Please complete enrollment for ${studentName} in ${className} using the link below.`,
    ctaButton: "Complete enrollment",
    description: `${studentName} — ${className}`,
    dueDate,
  };
}

export async function resolveEnrolmentPaymentEmailDetails(
  service: SupabaseClient,
  input: {
    tenantId: string;
    offeringId: string;
    /** The enrolment, so its automatic class discount is in the amount. */
    engagementId?: string;
    studentName: string;
    language: "en" | "he";
    linkExpiresAt?: Date;
  },
): Promise<EnrolmentPaymentEmailDetails | null> {
  const [{ data: offering }, { data: tenant }] = await Promise.all([
    service
      .from("offerings")
      .select("name, price_minor, currency")
      .eq("id", input.offeringId)
      .eq("tenant_id", input.tenantId)
      .single(),
    service
      .from("tenants")
      .select("currency, language_default")
      .eq("id", input.tenantId)
      .single(),
  ]);

  if (!offering || !tenant) return null;

  const discount = input.engagementId ? await loadEngagementDiscount(service, input.engagementId) : NO_DISCOUNT;
  const pricing = resolveOfferingPrice({
    price_minor: priceAfterDiscount(offering.price_minor as number, discount.discountMinor),
  });

  const currency = (offering.currency ?? tenant.currency ?? "ILS").toUpperCase();
  const locale = input.language === "he" ? "he-IL" : "en-GB";
  const linkExpiresAt = input.linkExpiresAt ?? new Date(Date.now() + 7 * 24 * 3600 * 1000);
  const dueDate = formatDate(linkExpiresAt.toISOString(), locale);
  const className = (offering.name as string) ?? "Class";
  const copy = buildAdminCompletionLinkEmailCopy({
    language: input.language,
    studentName: input.studentName,
    className,
    dueDate,
  });

  return {
    className,
    studentName: input.studentName,
    amountOutstandingFormatted: formatCurrency(pricing.totalMinor, currency, locale),
    amountMinor: pricing.totalMinor,
    currency,
    ...copy,
  };
}

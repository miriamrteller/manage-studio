import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { formatCurrency, formatDate } from "./email-dist/format.js";
import { resolveOfferingPrice } from "./email-dist/pricing.js";

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
      .select("vat_rate, prices_include_vat, currency, language_default")
      .eq("id", input.tenantId)
      .single(),
  ]);

  if (!offering || !tenant) return null;

  const pricing = resolveOfferingPrice(
    { price_minor: offering.price_minor as number },
    {
      vat_rate: Number(tenant.vat_rate ?? 0.17),
      prices_include_vat: tenant.prices_include_vat !== false,
    },
  );

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

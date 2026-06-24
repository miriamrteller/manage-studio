import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { formatPaymentMethodDisplay } from "./email-dist/email/format-payment-method.js";
import { formatCurrency, formatDate } from "./email-dist/format.js";
import {
  EMAIL_TEMPLATE_NAMES,
  getEmailStrings,
} from "./email-dist/i18n/email.js";
import { resolveEnrolmentNotificationRecipient, resolveAdminLinkRecipientEmail } from "./enrolment-recipient.ts";
import { resolveEmailLanguage, type EmailLanguage } from "./resolve-email-language.ts";

const WEEKDAY_NAMES: Record<EmailLanguage, string[]> = {
  en: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
  he: ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"],
};

function formatWeekday(dow: number | null | undefined, language: EmailLanguage): string | undefined {
  if (dow == null || dow < 0 || dow > 6) return undefined;
  return WEEKDAY_NAMES[language][dow];
}

function formatTimeRange(
  start: string | null | undefined,
  end: string | null | undefined,
): string | undefined {
  const hhmm = (t: string | null | undefined) =>
    typeof t === "string" && t.length >= 5 ? t.slice(0, 5) : undefined;
  const s = hhmm(start);
  const e = hhmm(end);
  if (s && e) return `${s}–${e}`;
  return s ?? e;
}

function formatStartDate(iso: string | null | undefined, language: EmailLanguage): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toLocaleDateString(language === "he" ? "he-IL" : "en-GB", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export async function buildClassDetailsForEmail(
  service: SupabaseClient,
  offering: {
    day_of_week?: number | null;
    start_time?: string | null;
    end_time?: string | null;
    season_id?: string | null;
    staff_id?: string | null;
  },
  language: EmailLanguage,
): Promise<{ day?: string; time?: string; startDate?: string; teacher?: string }> {
  const [seasonRes, staffRes] = await Promise.all([
    offering.season_id
      ? service.from("seasons").select("start_date").eq("id", offering.season_id).maybeSingle()
      : Promise.resolve({ data: null }),
    offering.staff_id
      ? service.from("staff").select("name").eq("id", offering.staff_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return {
    day: formatWeekday(offering.day_of_week as number | null, language),
    time: formatTimeRange(offering.start_time as string | null, offering.end_time as string | null),
    startDate: formatStartDate((seasonRes.data as { start_date?: string } | null)?.start_date, language),
    teacher: typeof (staffRes.data as { name?: unknown } | null)?.name === "string"
      ? (staffRes.data as { name: string }).name
      : undefined,
  };
}

export interface EnrolmentConfirmationEmailVariables {
  recipientName: string;
  studentName: string;
  showStudentRow: boolean;
  className: string;
  classDetails: { day?: string; time?: string; startDate?: string; teacher?: string };
  location?: string;
  pendingWaiver: boolean;
  signUrl?: string;
  deadlineDate?: string;
  paymentSummary: {
    amountFormatted: string;
    paidOnFormatted: string;
    paymentMethodLabel: string;
  };
}

export interface BuildEnrolmentConfirmationPayloadInput {
  tenantId: string;
  paymentId: string;
  engagementId: string;
  pendingWaiver: boolean;
  signUrl?: string;
  deadlineDate?: string;
}

export interface BuildEnrolmentConfirmationPayloadResult {
  language: EmailLanguage;
  schoolName: string;
  recipientEmail: string;
  variables: EnrolmentConfirmationEmailVariables;
}

export async function buildEnrolmentConfirmationPayload(
  service: SupabaseClient,
  input: BuildEnrolmentConfirmationPayloadInput,
): Promise<BuildEnrolmentConfirmationPayloadResult | null> {
  const { data: engagement } = await service
    .from("engagements")
    .select("person_id, offering_id")
    .eq("id", input.engagementId)
    .single();
  if (!engagement) return null;

  const personId = engagement.person_id as string;
  const offeringId = engagement.offering_id as string;

  const [
    { data: tenantRow },
    { data: offeringRow },
    { data: studentRow },
    { data: paymentRow },
    recipient,
    language,
  ] = await Promise.all([
    service.from("tenants").select("name, language_default, primary_color, accent_color").eq("id", input.tenantId).single(),
    service
      .from("offerings")
      .select("name, day_of_week, start_time, end_time, season_id, staff_id, location")
      .eq("id", offeringId)
      .single(),
    service.from("people").select("name").eq("id", personId).eq("tenant_id", input.tenantId).single(),
    service
      .from("payments")
      .select("total_amount_minor, currency, paid_at, payment_method, billing_account_id")
      .eq("id", input.paymentId)
      .single(),
    resolveEnrolmentNotificationRecipient(service, input.tenantId, personId),
    resolveEmailLanguage(service, { tenantId: input.tenantId, personId }),
  ]);

  if (!tenantRow || !paymentRow) return null;

  let recipientEmail = recipient?.email ?? null;
  let recipientName = recipient?.name?.trim() || null;

  if (!recipientEmail) {
    recipientEmail = await resolveAdminLinkRecipientEmail(service, input.tenantId, input.engagementId);
    recipientName = recipientName ?? "there";
  }

  if (!recipientEmail) return null;
  const studentName = (studentRow?.name as string | undefined)?.trim() || "there";
  const resolvedRecipientName = recipientName ?? studentName;
  const showStudentRow = studentName !== resolvedRecipientName;

  const locale = language === "he" ? "he-IL" : "en-GB";
  const className = (offeringRow?.name as string | undefined) ?? "";
  const classDetails = offeringRow
    ? await buildClassDetailsForEmail(service, offeringRow, language)
    : {};
  const locationRaw = typeof offeringRow?.location === "string" ? offeringRow.location.trim() : "";
  const location = locationRaw || undefined;

  const templateStrings = getEmailStrings(language, EMAIL_TEMPLATE_NAMES.ENROLMENT_CONFIRMATION);

  let cardBrand: string | null = null;
  let last4: string | null = null;
  if (paymentRow.payment_method === "card" && paymentRow.billing_account_id) {
    const { data: cardRows } = await service.rpc("get_billing_account_payment_method", {
      p_billing_account_id: paymentRow.billing_account_id as string,
    });
    const defaultCard = (cardRows as Array<{ card_brand?: string; last4?: string; is_default?: boolean }> | null)
      ?.find((row) => row.is_default) ?? (cardRows as Array<{ card_brand?: string; last4?: string }> | null)?.[0];
    cardBrand = defaultCard?.card_brand ?? null;
    last4 = defaultCard?.last4 ?? null;
  }

  const paymentMethodLabel = formatPaymentMethodDisplay({
    method: paymentRow.payment_method as string | null,
    cardBrand,
    last4,
    strings: templateStrings,
  });

  const paidAt = paymentRow.paid_at
    ? formatDate(paymentRow.paid_at as string, locale, {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    })
    : formatDate(new Date().toISOString(), locale, {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

  return {
    language,
    schoolName: tenantRow.name as string,
    recipientEmail,
    variables: {
      recipientName: resolvedRecipientName,
      studentName,
      showStudentRow,
      className,
      classDetails,
      ...(location ? { location } : {}),
      pendingWaiver: input.pendingWaiver,
      signUrl: input.signUrl,
      deadlineDate: input.deadlineDate,
      paymentSummary: {
        amountFormatted: formatCurrency(
          paymentRow.total_amount_minor as number,
          (paymentRow.currency as string | undefined)?.toUpperCase() ?? "ILS",
          locale,
        ),
        paidOnFormatted: paidAt,
        paymentMethodLabel,
      },
    },
  };
}

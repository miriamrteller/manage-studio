import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { formatPaymentMethodDisplay } from "./email-dist/email/format-payment-method.js";
import { formatCurrency, formatDate } from "./email-dist/format.js";
import {
  EMAIL_TEMPLATE_NAMES,
  getEmailStrings,
} from "./email-dist/i18n/email.js";
import {
  resolveAdminLinkRecipientEmail,
  resolveEnrolmentNotificationRecipient,
  resolveTenantAdminNotificationEmails,
} from "./enrolment-recipient.ts";
import { resolveEmailLanguage, type EmailLanguage } from "./resolve-email-language.ts";

const JERUSALEM_TZ = "Asia/Jerusalem";

export interface AppointmentConfirmationPayload {
  language: EmailLanguage;
  tenantLanguage: EmailLanguage;
  schoolName: string;
  recipientEmail: string;
  recipientName: string;
  clientName: string;
  clientEmail: string;
  clientPhone?: string;
  serviceName: string;
  whenFormatted: string;
  tenantWhenFormatted: string;
  location?: string;
  pendingWaiver: boolean;
  signUrl?: string;
  deadlineDate?: string;
  paymentSummary: {
    amountFormatted: string;
    paidOnFormatted: string;
    paymentMethodLabel: string;
  };
  tenantAdminEmails: string[];
}

export interface BuildAppointmentConfirmationPayloadInput {
  tenantId: string;
  paymentId: string;
  engagementId: string;
  pendingWaiver: boolean;
  signUrl?: string;
  deadlineDate?: string;
}

function formatAppointmentWhen(
  startsAt: string,
  endsAt: string,
  language: EmailLanguage,
): string {
  const locale = language === "he" ? "he-IL" : "en-GB";
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  const datePart = start.toLocaleDateString(locale, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: JERUSALEM_TZ,
  });
  const timeOptions: Intl.DateTimeFormatOptions = {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: JERUSALEM_TZ,
    hour12: locale.startsWith("en"),
  };
  const startTime = start.toLocaleTimeString(locale, timeOptions);
  const endTime = end.toLocaleTimeString(locale, timeOptions);
  return `${datePart}, ${startTime}–${endTime}`;
}

function formatDeadline(deadlineDate: string | undefined, language: EmailLanguage): string | undefined {
  if (!deadlineDate) return undefined;
  const d = new Date(deadlineDate);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toLocaleDateString(language === "he" ? "he-IL" : "en-GB", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: JERUSALEM_TZ,
  });
}

async function resolvePaymentSummary(
  service: SupabaseClient,
  paymentId: string,
  language: EmailLanguage,
): Promise<{
  amountFormatted: string;
  paidOnFormatted: string;
  paymentMethodLabel: string;
} | null> {
  const { data: paymentRow } = await service
    .from("payments")
    .select("total_amount_minor, currency, paid_at, payment_method, billing_account_id")
    .eq("id", paymentId)
    .single();

  if (!paymentRow) return null;

  const locale = language === "he" ? "he-IL" : "en-GB";
  const templateStrings = getEmailStrings(language, EMAIL_TEMPLATE_NAMES.APPOINTMENT_CONFIRMATION);

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
    amountFormatted: formatCurrency(
      paymentRow.total_amount_minor as number,
      (paymentRow.currency as string | undefined)?.toUpperCase() ?? "ILS",
      locale,
    ),
    paidOnFormatted: paidAt,
    paymentMethodLabel,
  };
}

export async function buildAppointmentConfirmationPayload(
  service: SupabaseClient,
  input: BuildAppointmentConfirmationPayloadInput,
): Promise<AppointmentConfirmationPayload | null> {
  const { data: engagement } = await service
    .from("engagements")
    .select("person_id, offering_id, booked_starts_at, booked_ends_at, scheduling_hold_id")
    .eq("id", input.engagementId)
    .single();

  if (!engagement?.booked_starts_at || !engagement.booked_ends_at) return null;

  const personId = engagement.person_id as string;
  const offeringId = engagement.offering_id as string;
  const startsAt = engagement.booked_starts_at as string;
  const endsAt = engagement.booked_ends_at as string;

  const language = await resolveEmailLanguage(service, { tenantId: input.tenantId, personId });

  const [
    { data: tenantRow },
    { data: offeringRow },
    { data: studentRow },
    holdResult,
    recipient,
    tenantAdminEmails,
  ] = await Promise.all([
    service.from("tenants").select("name, language_default").eq("id", input.tenantId).single(),
    service
      .from("offerings")
      .select("name, location, offering_type")
      .eq("id", offeringId)
      .single(),
    service.from("people").select("name, email").eq("id", personId).eq("tenant_id", input.tenantId).single(),
    engagement.scheduling_hold_id
      ? service
        .from("scheduling_holds")
        .select("client_name, client_email, client_phone")
        .eq("id", engagement.scheduling_hold_id as string)
        .maybeSingle()
      : Promise.resolve({ data: null }),
    resolveEnrolmentNotificationRecipient(service, input.tenantId, personId),
    resolveTenantAdminNotificationEmails(service, input.tenantId),
  ]);

  const paymentSummary = await resolvePaymentSummary(service, input.paymentId, language);

  if (!tenantRow || !offeringRow || !paymentSummary) return null;
  if (offeringRow.offering_type !== "appointment") return null;

  let recipientEmail = recipient?.email ?? null;
  let recipientName = recipient?.name?.trim() || null;

  if (!recipientEmail) {
    recipientEmail = await resolveAdminLinkRecipientEmail(service, input.tenantId, input.engagementId);
    recipientName = recipientName ?? "there";
  }

  const hold = holdResult.data;
  const fallbackEmail = typeof hold?.client_email === "string"
    ? hold.client_email.trim().toLowerCase()
    : typeof studentRow?.email === "string"
      ? studentRow.email.trim().toLowerCase()
      : null;
  const clientEmail = recipientEmail ?? fallbackEmail;

  if (!clientEmail) return null;

  const clientName = (
    (typeof hold?.client_name === "string" && hold.client_name.trim()) ||
    (typeof studentRow?.name === "string" && studentRow.name.trim()) ||
    recipientName ||
    "there"
  );
  const resolvedRecipientName = recipientName ?? clientName;

  const tenantLanguage: EmailLanguage = tenantRow.language_default === "he" ? "he" : "en";
  const locationRaw = typeof offeringRow.location === "string" ? offeringRow.location.trim() : "";
  const clientPhoneRaw = typeof hold?.client_phone === "string" ? hold.client_phone.trim() : "";

  return {
    language,
    tenantLanguage,
    schoolName: tenantRow.name as string,
    recipientEmail: clientEmail,
    recipientName: resolvedRecipientName,
    clientName,
    clientEmail,
    ...(clientPhoneRaw ? { clientPhone: clientPhoneRaw } : {}),
    serviceName: (offeringRow.name as string | undefined) ?? "",
    whenFormatted: formatAppointmentWhen(startsAt, endsAt, language),
    tenantWhenFormatted: formatAppointmentWhen(startsAt, endsAt, tenantLanguage),
    ...(locationRaw ? { location: locationRaw } : {}),
    pendingWaiver: input.pendingWaiver,
    signUrl: input.signUrl,
    deadlineDate: formatDeadline(input.deadlineDate, language),
    paymentSummary,
    tenantAdminEmails,
  };
}

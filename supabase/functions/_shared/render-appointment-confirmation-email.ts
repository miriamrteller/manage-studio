import {
  EMAIL_TEMPLATE_NAMES,
  getEmailStrings,
  interpolateTemplate,
} from "./email-dist/i18n/email.js";
import type { AppointmentConfirmationPayload } from "./build-appointment-confirmation-payload.ts";

type EmailLanguage = "en" | "he";

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function detailRow(label: string, value: string | undefined): string {
  if (!value) return "";
  return `<tr><td style="padding:8px 12px;color:#6b7280;white-space:nowrap;">${escapeHtml(label)}</td>`
    + `<td style="padding:8px 12px;color:#1f2937;">${escapeHtml(value)}</td></tr>`;
}

function renderDetailsTable(rows: string): string {
  if (!rows) return "";
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:16px 0;">${rows}</table>`;
}

function renderShell(params: {
  language: EmailLanguage;
  schoolName: string;
  greeting: string;
  headline: string;
  detailsHeading: string;
  detailsRows: string;
  paymentHeading?: string;
  paymentRows?: string;
  waiverBlock?: string;
  footerNote?: string;
  primaryColor: string;
}): string {
  const dir = params.language === "he" ? "rtl" : "ltr";
  const align = params.language === "he" ? "right" : "left";

  return `<!DOCTYPE html><html dir="${dir}" lang="${params.language}"><body style="margin:0;padding:24px;background:#f3f4f6;font-family:Arial,sans-serif;">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;padding:24px;text-align:${align};">
  <h1 style="margin:0 0 8px;font-size:20px;color:${params.primaryColor};">${escapeHtml(params.schoolName)}</h1>
  <p style="margin:0 0 16px;color:#374151;">${escapeHtml(params.greeting)}</p>
  <p style="margin:0 0 16px;font-size:16px;font-weight:bold;color:#111827;">${escapeHtml(params.headline)}</p>
  <h2 style="margin:24px 0 8px;font-size:14px;color:#374151;text-transform:uppercase;letter-spacing:0.05em;">${escapeHtml(params.detailsHeading)}</h2>
  ${renderDetailsTable(params.detailsRows)}
  ${params.paymentHeading && params.paymentRows ? `<h2 style="margin:24px 0 8px;font-size:14px;color:#374151;text-transform:uppercase;letter-spacing:0.05em;">${escapeHtml(params.paymentHeading)}</h2>${renderDetailsTable(params.paymentRows)}` : ""}
  ${params.waiverBlock ?? ""}
  ${params.footerNote ? `<p style="margin:24px 0 0;color:#6b7280;font-size:14px;">${escapeHtml(params.footerNote)}</p>` : ""}
</div></body></html>`;
}

export function renderAppointmentClientConfirmationHtml(
  payload: AppointmentConfirmationPayload,
  primaryColor: string,
): string {
  const language = payload.language === "he" ? "he" : "en";
  const strings = getEmailStrings(language, EMAIL_TEMPLATE_NAMES.APPOINTMENT_CONFIRMATION);

  const headline = payload.pendingWaiver
    ? interpolateTemplate(str(strings.headline_pending_waiver) ?? "", { serviceName: payload.serviceName })
    : interpolateTemplate(str(strings.headline_confirmed) ?? "", { serviceName: payload.serviceName });

  const greeting = interpolateTemplate(str(strings.greeting) ?? "", { recipientName: payload.recipientName });

  const detailsRows = [
    detailRow(str(strings.service_label) ?? "Service", payload.serviceName),
    detailRow(str(strings.when_label) ?? "When", payload.whenFormatted),
    detailRow(str(strings.location_label) ?? "Location", payload.location),
  ].join("");

  const paymentRows = [
    detailRow(str(strings.amount_paid_label) ?? "Amount paid", payload.paymentSummary.amountFormatted),
    detailRow(str(strings.paid_on_label) ?? "Paid on", payload.paymentSummary.paidOnFormatted),
    detailRow(str(strings.payment_method_label) ?? "Payment method", payload.paymentSummary.paymentMethodLabel),
  ].join("");

  let waiverBlock = "";
  if (payload.pendingWaiver) {
    const cta = str(strings.waiver_cta) ?? "Sign waiver";
    const deadlineLine = payload.deadlineDate
      ? interpolateTemplate(str(strings.no_show_policy) ?? "", { deadlineDate: payload.deadlineDate })
      : "";
    waiverBlock = `<div style="margin:24px 0;padding:16px;background:#fef3c7;border-radius:8px;">
      <p style="margin:0 0 8px;font-weight:bold;color:#92400e;">${escapeHtml(str(strings.waiver_warning_heading) ?? "")}</p>
      <p style="margin:0 0 12px;color:#78350f;">${escapeHtml(str(strings.waiver_warning_body) ?? "")}</p>
      ${deadlineLine ? `<p style="margin:0 0 12px;color:#78350f;">${escapeHtml(deadlineLine)}</p>` : ""}
      ${payload.signUrl ? `<p style="margin:0;"><a href="${escapeHtml(payload.signUrl)}" style="display:inline-block;padding:10px 16px;background:${primaryColor};color:#ffffff;text-decoration:none;border-radius:6px;">${escapeHtml(cta)}</a></p>` : ""}
    </div>`;
  }

  return renderShell({
    language,
    schoolName: payload.schoolName,
    greeting,
    headline,
    detailsHeading: str(strings.details_heading) ?? "Appointment details",
    detailsRows,
    paymentHeading: str(strings.payment_summary_heading) ?? "Payment summary",
    paymentRows,
    waiverBlock,
    footerNote: str(strings.confirmation_note),
    primaryColor,
  });
}

export function buildAppointmentClientSubject(
  payload: AppointmentConfirmationPayload,
): string {
  const language = payload.language === "he" ? "he" : "en";
  const strings = getEmailStrings(language, EMAIL_TEMPLATE_NAMES.APPOINTMENT_CONFIRMATION);
  return interpolateTemplate(str(strings.subject) ?? "Your appointment at {schoolName}", {
    schoolName: payload.schoolName,
  });
}

export function renderAppointmentTenantNotificationHtml(
  payload: AppointmentConfirmationPayload,
  primaryColor: string,
): string {
  const language = payload.tenantLanguage === "he" ? "he" : "en";
  const strings = getEmailStrings(language, EMAIL_TEMPLATE_NAMES.APPOINTMENT_TENANT_NOTIFICATION);

  const detailsRows = [
    detailRow(str(strings.service_label) ?? "Service", payload.serviceName),
    detailRow(str(strings.when_label) ?? "When", payload.tenantWhenFormatted),
    detailRow(str(strings.location_label) ?? "Location", payload.location),
    detailRow(str(strings.client_label) ?? "Client", payload.clientName),
    detailRow(str(strings.email_label) ?? "Email", payload.clientEmail),
    detailRow(str(strings.phone_label) ?? "Phone", payload.clientPhone),
  ].join("");

  const paymentRows = [
    detailRow(str(strings.amount_paid_label) ?? "Amount paid", payload.paymentSummary.amountFormatted),
    detailRow(str(strings.paid_on_label) ?? "Paid on", payload.paymentSummary.paidOnFormatted),
    detailRow(str(strings.payment_method_label) ?? "Payment method", payload.paymentSummary.paymentMethodLabel),
  ].join("");

  return renderShell({
    language,
    schoolName: payload.schoolName,
    greeting: str(strings.greeting) ?? "Hello,",
    headline: str(strings.headline) ?? "A new appointment has been booked.",
    detailsHeading: str(strings.details_heading) ?? "Booking details",
    detailsRows,
    paymentHeading: str(strings.payment_summary_heading) ?? "Payment",
    paymentRows,
    primaryColor,
  });
}

export function buildAppointmentTenantSubject(
  payload: AppointmentConfirmationPayload,
): string {
  const language = payload.tenantLanguage === "he" ? "he" : "en";
  const strings = getEmailStrings(language, EMAIL_TEMPLATE_NAMES.APPOINTMENT_TENANT_NOTIFICATION);
  return interpolateTemplate(str(strings.subject) ?? "New appointment — {serviceName}", {
    serviceName: payload.serviceName,
  });
}

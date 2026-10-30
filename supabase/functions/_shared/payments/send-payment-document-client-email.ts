import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.105.3";
import { sendHtmlEmail } from "../email-client.ts";
import { formatCurrency } from "../email-dist/format.js";
import {
  resolveTenantSender,
  TENANT_SENDER_COLUMNS,
  type TenantSender,
  type TenantSenderInput,
} from "../notification-from.ts";
import { isOfflinePaymentMethod } from "./ypay/document.ts";

export const PAYMENT_DOCUMENT_CLIENT_EMAIL_SENT = "payment_document_client_email_sent";
export const PAYMENT_DOCUMENT_CLIENT_EMAIL_FAILED = "payment_document_client_email_failed";
export const PAYMENT_DOCUMENT_CLIENT_EMAIL_SKIPPED = "payment_document_client_email_skipped";

/**
 * Payments whose document the APP must email to the client.
 *
 * Card providers email the document themselves (YPay mail:true, Grow, iCount,
 * Invoice4U all send it with the charge). Offline money (cash / bank transfer,
 * provider=manual) is documented standalone, so nobody else tells the client.
 */
export function paymentNeedsClientDocumentEmail(payment: {
  provider: string | null;
  payment_method: string | null;
}): boolean {
  return payment.provider === "manual" && isOfflinePaymentMethod(payment.payment_method);
}

async function auditExists(
  service: SupabaseClient,
  tenantId: string,
  action: string,
  paymentId: string,
): Promise<boolean> {
  const { data } = await service
    .from("audit_log")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("action", action)
    .eq("entity_id", paymentId)
    .limit(1)
    .maybeSingle();
  return Boolean(data);
}

async function auditSkip(
  service: SupabaseClient,
  tenantId: string,
  paymentId: string,
  reason: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  await service.from("audit_log").insert({
    tenant_id: tenantId,
    action: PAYMENT_DOCUMENT_CLIENT_EMAIL_SKIPPED,
    entity_type: "payment",
    entity_id: paymentId,
    after_state: { reason, ...extra },
  });
}

/**
 * Email the client their receipt / invoice-receipt once the provider issued it.
 * Idempotent on the `_sent` audit row; check-missing-documents retries until then.
 */
export async function sendPaymentDocumentClientEmail(
  service: SupabaseClient,
  params: { tenantId: string; paymentId: string },
): Promise<{ sent: boolean; skipped?: string }> {
  if (await auditExists(service, params.tenantId, PAYMENT_DOCUMENT_CLIENT_EMAIL_SENT, params.paymentId)) {
    return { sent: true };
  }

  const { data: payment, error: paymentError } = await service
    .from("payments")
    .select(
      "id, tenant_id, person_id, total_amount_minor, currency, external_document_id, external_document_number, invoice_url, payment_method, provider, paid_at",
    )
    .eq("id", params.paymentId)
    .eq("tenant_id", params.tenantId)
    .maybeSingle();

  if (paymentError) throw paymentError;
  if (!payment?.external_document_id) {
    await auditSkip(service, params.tenantId, params.paymentId, "no_document");
    return { sent: false, skipped: "no_document" };
  }

  if (!payment.person_id) {
    await auditSkip(service, params.tenantId, params.paymentId, "no_recipient");
    return { sent: false, skipped: "no_recipient" };
  }

  const { data: person } = await service
    .from("people")
    .select("name, email")
    .eq("id", payment.person_id)
    .maybeSingle();
  const recipientEmail = (person?.email as string | null)?.trim();
  if (!recipientEmail) {
    await auditSkip(service, params.tenantId, params.paymentId, "no_recipient");
    return { sent: false, skipped: "no_recipient" };
  }

  const { data: tenant } = await service
    .from("tenants")
    .select(`name, language_default, vat_type, ${TENANT_SENDER_COLUMNS}`)
    .eq("id", params.tenantId)
    .maybeSingle();

  let sender: TenantSender;
  try {
    sender = resolveTenantSender(tenant as unknown as TenantSenderInput);
  } catch (error) {
    await auditSkip(service, params.tenantId, params.paymentId, "sender_not_configured", {
      message: error instanceof Error ? error.message : String(error),
    });
    return { sent: false, skipped: "sender_not_configured" };
  }

  const language: "he" | "en" = tenant?.language_default === "en" ? "en" : "he";
  const studioName = (tenant?.name as string | null) ?? "Manage Studio";
  const amount = formatCurrency(
    payment.total_amount_minor as number,
    (payment.currency as string) ?? "ILS",
    language === "he" ? "he-IL" : "en-IL",
  );
  const docNumber =
    (payment.external_document_number as string | null) ?? (payment.external_document_id as string);
  const docUrl = (payment.invoice_url as string | null) ?? "";
  const recipientName = (person?.name as string | null)?.trim() || "";

  const { subject, html } = renderClientDocumentEmail({
    language,
    studioName,
    recipientName,
    amount,
    docNumber,
    docUrl,
    paymentMethod: payment.payment_method as string | null,
    vatExempt: Number(tenant?.vat_type) === 3,
  });

  try {
    await sendHtmlEmail({ to: recipientEmail, from: sender.from, replyTo: sender.replyTo, subject, html });
  } catch (err) {
    console.error("[sendPaymentDocumentClientEmail] failed:", recipientEmail, err);
    await service.from("audit_log").insert({
      tenant_id: params.tenantId,
      action: PAYMENT_DOCUMENT_CLIENT_EMAIL_FAILED,
      entity_type: "payment",
      entity_id: params.paymentId,
      after_state: {
        recipient_email: recipientEmail,
        message: err instanceof Error ? err.message : String(err),
      },
    });
    return { sent: false };
  }

  await service.from("audit_log").insert({
    tenant_id: params.tenantId,
    action: PAYMENT_DOCUMENT_CLIENT_EMAIL_SENT,
    entity_type: "payment",
    entity_id: params.paymentId,
    after_state: {
      recipient_email: recipientEmail,
      external_document_id: payment.external_document_id,
      external_document_number: payment.external_document_number,
    },
  });
  return { sent: true };
}

export interface ClientDocumentEmailInput {
  language: "he" | "en";
  studioName: string;
  recipientName: string;
  amount: string;
  docNumber: string;
  docUrl: string;
  paymentMethod: string | null;
  /** VAT-exempt dealers issue a receipt; others an invoice-receipt. Only affects wording. */
  vatExempt: boolean;
}

/** Pure renderer (covered by tests). Plain HTML — no React shell needed for a receipt note. */
export function renderClientDocumentEmail(input: ClientDocumentEmailInput): { subject: string; html: string } {
  const he = input.language === "he";
  const docLabel = he
    ? input.vatExempt ? "קבלה" : "חשבונית מס קבלה"
    : input.vatExempt ? "Receipt" : "Invoice-receipt";
  const methodLabel = he
    ? input.paymentMethod === "cash" ? "במזומן" : input.paymentMethod === "bank_transfer" ? "בהעברה בנקאית" : ""
    : input.paymentMethod === "cash" ? "in cash" : input.paymentMethod === "bank_transfer" ? "by bank transfer" : "";
  const greeting = he
    ? `שלום${input.recipientName ? ` ${escapeHtml(input.recipientName)}` : ""},`
    : `Hi${input.recipientName ? ` ${escapeHtml(input.recipientName)}` : ""},`;
  const intro = he
    ? `קיבלנו את התשלום שלך על סך ${escapeHtml(input.amount)}${methodLabel ? ` ${methodLabel}` : ""}. תודה!`
    : `We received your payment of ${escapeHtml(input.amount)}${methodLabel ? ` ${methodLabel}` : ""}. Thank you!`;
  const docLine = he
    ? `${docLabel} מספר ${escapeHtml(input.docNumber)} מצורפת בקישור:`
    : `${docLabel} number ${escapeHtml(input.docNumber)} is available here:`;
  const linkText = he ? `לצפייה ב${docLabel}` : `Open the ${docLabel.toLowerCase()}`;
  const noLink = he
    ? "המסמך זמין באזור האישי שלך."
    : "The document is available in your client portal.";
  const subject = he
    ? `${input.studioName}: ${docLabel} ${input.docNumber}`
    : `${input.studioName}: ${docLabel} ${input.docNumber}`;

  const html = `
    <div dir="${he ? "rtl" : "ltr"}" lang="${input.language}" style="font-family: Arial, Helvetica, sans-serif; font-size: 15px; line-height: 1.5; color: #1f2937;">
      <p>${greeting}</p>
      <p>${intro}</p>
      <p>${docLine}</p>
      ${
        input.docUrl
          ? `<p><a href="${escapeHtml(input.docUrl)}">${linkText}</a></p>`
          : `<p>${noLink}</p>`
      }
      <p>${escapeHtml(input.studioName)}</p>
    </div>
  `;
  return { subject, html };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

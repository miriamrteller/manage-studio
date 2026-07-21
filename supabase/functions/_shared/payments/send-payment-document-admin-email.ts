import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { resolveTenantAdminNotificationEmails } from "../enrolment-recipient.ts";
import { resolveNotificationFromEmail } from "../notification-from.ts";
import { sendHtmlEmail } from "../resend-client.ts";
import { formatCurrency } from "../email-dist/format.js";

export const PAYMENT_DOCUMENT_ADMIN_EMAIL_SENT = "payment_document_admin_email_sent";
export const PAYMENT_DOCUMENT_ADMIN_EMAIL_FAILED = "payment_document_admin_email_failed";
export const PAYMENT_DOCUMENT_ADMIN_EMAIL_SKIPPED = "payment_document_admin_email_skipped";

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

/**
 * Email every tenant admin a copy/link of the tax document.
 * Retries are driven by the missing-document cron until `_sent` is audited.
 */
export async function sendPaymentDocumentAdminEmail(
  service: SupabaseClient,
  params: {
    tenantId: string;
    paymentId: string;
  },
): Promise<{ sent: boolean; skipped?: string }> {
  if (
    await auditExists(
      service,
      params.tenantId,
      PAYMENT_DOCUMENT_ADMIN_EMAIL_SENT,
      params.paymentId,
    )
  ) {
    return { sent: true };
  }

  const { data: payment, error: paymentError } = await service
    .from("payments")
    .select(
      "id, tenant_id, total_amount_minor, currency, external_document_id, external_document_number, invoice_url, document_pdf_path, engagement_id, offering_id, paid_at, provider",
    )
    .eq("id", params.paymentId)
    .eq("tenant_id", params.tenantId)
    .maybeSingle();

  if (paymentError) throw paymentError;
  if (!payment?.external_document_id) {
    await service.from("audit_log").insert({
      tenant_id: params.tenantId,
      action: PAYMENT_DOCUMENT_ADMIN_EMAIL_SKIPPED,
      entity_type: "payment",
      entity_id: params.paymentId,
      after_state: { reason: "no_document" },
    });
    return { sent: false, skipped: "no_document" };
  }

  const { data: tenant } = await service
    .from("tenants")
    .select("name, from_email")
    .eq("id", params.tenantId)
    .maybeSingle();

  let fromEmail: string;
  try {
    fromEmail = resolveNotificationFromEmail(tenant?.from_email as string | null | undefined);
  } catch (error) {
    await service.from("audit_log").insert({
      tenant_id: params.tenantId,
      action: PAYMENT_DOCUMENT_ADMIN_EMAIL_SKIPPED,
      entity_type: "payment",
      entity_id: params.paymentId,
      after_state: {
        reason: "sender_not_configured",
        message: error instanceof Error ? error.message : String(error),
      },
    });
    return { sent: false, skipped: "sender_not_configured" };
  }

  const adminEmails = await resolveTenantAdminNotificationEmails(service, params.tenantId);
  if (adminEmails.length === 0) {
    await service.from("audit_log").insert({
      tenant_id: params.tenantId,
      action: PAYMENT_DOCUMENT_ADMIN_EMAIL_SKIPPED,
      entity_type: "payment",
      entity_id: params.paymentId,
      after_state: { reason: "no_tenant_admin_email" },
    });
    return { sent: false, skipped: "no_tenant_admin_email" };
  }

  let offeringName: string | null = null;
  if (payment.offering_id) {
    const { data: offering } = await service
      .from("offerings")
      .select("name")
      .eq("id", payment.offering_id)
      .maybeSingle();
    offeringName = (offering?.name as string | null) ?? null;
  }

  const amount = formatCurrency(
    payment.total_amount_minor as number,
    (payment.currency as string) ?? "ILS",
    "he-IL",
  );
  const docNumber =
    (payment.external_document_number as string | null) ??
    (payment.external_document_id as string);
  const docUrl = (payment.invoice_url as string | null) ?? "";
  const schoolName = (tenant?.name as string | null) ?? "Manage Studio";

  const subject = `${schoolName}: Tax invoice ${docNumber}`;
  const html = `
    <p>A tax invoice was recorded for a payment.</p>
    <ul>
      <li><strong>School:</strong> ${escapeHtml(schoolName)}</li>
      <li><strong>Document:</strong> ${escapeHtml(docNumber)}</li>
      <li><strong>Amount:</strong> ${escapeHtml(amount)}</li>
      ${offeringName ? `<li><strong>Offering:</strong> ${escapeHtml(offeringName)}</li>` : ""}
      <li><strong>Provider:</strong> ${escapeHtml(String(payment.provider ?? ""))}</li>
      <li><strong>Payment ID:</strong> ${escapeHtml(params.paymentId)}</li>
    </ul>
    ${
      docUrl
        ? `<p><a href="${escapeHtml(docUrl)}">Open tax invoice</a></p>`
        : "<p>No public invoice URL was stored; check Finance → Payments in Manage Studio.</p>"
    }
  `;

  const sentTo: string[] = [];
  const failed: Array<{ email: string; message: string }> = [];

  for (const adminEmail of adminEmails) {
    try {
      await sendHtmlEmail({
        to: adminEmail,
        from: fromEmail,
        subject,
        html,
      });
      sentTo.push(adminEmail);
    } catch (err) {
      failed.push({
        email: adminEmail,
        message: err instanceof Error ? err.message : String(err),
      });
      console.error("[sendPaymentDocumentAdminEmail] failed:", adminEmail, err);
    }
  }

  if (sentTo.length > 0) {
    await service.from("audit_log").insert({
      tenant_id: params.tenantId,
      action: PAYMENT_DOCUMENT_ADMIN_EMAIL_SENT,
      entity_type: "payment",
      entity_id: params.paymentId,
      after_state: {
        recipient_emails: sentTo,
        external_document_id: payment.external_document_id,
        external_document_number: payment.external_document_number,
        ...(failed.length > 0 ? { failed } : {}),
      },
    });
    return { sent: true };
  }

  await service.from("audit_log").insert({
    tenant_id: params.tenantId,
    action: PAYMENT_DOCUMENT_ADMIN_EMAIL_FAILED,
    entity_type: "payment",
    entity_id: params.paymentId,
    after_state: { failed },
  });
  return { sent: false };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

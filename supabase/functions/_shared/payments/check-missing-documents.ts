import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { resolveTenantAdminNotificationEmails } from "../enrolment-recipient.ts";
import { resolveNotificationFromEmail } from "../notification-from.ts";
import { sendHtmlEmail } from "../resend-client.ts";
import { formatCurrency } from "../email-dist/format.js";
import {
  PAYMENT_DOCUMENT_ADMIN_EMAIL_SENT,
  sendPaymentDocumentAdminEmail,
} from "./send-payment-document-admin-email.ts";

/** Succeeded payments without a tax doc after this grace period are alerted. */
export const MISSING_DOCUMENT_GRACE_MINUTES = 30;
export const MISSING_DOCUMENT_BATCH_LIMIT = 50;

export const PAYMENT_DOCUMENT_MISSING_ALERT_SENT = "payment_document_missing_alert_sent";
export const PAYMENT_DOCUMENT_MISSING_ALERT_FAILED = "payment_document_missing_alert_failed";
export const PAYMENT_DOCUMENT_MISSING_ALERT_SKIPPED = "payment_document_missing_alert_skipped";

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

async function alertAdminsMissingDocument(
  service: SupabaseClient,
  payment: {
    id: string;
    tenant_id: string;
    total_amount_minor: number;
    currency: string;
    paid_at: string | null;
    provider: string | null;
    engagement_id: string | null;
    offering_id: string | null;
  },
): Promise<"sent" | "failed" | "skipped"> {
  if (
    await auditExists(
      service,
      payment.tenant_id,
      PAYMENT_DOCUMENT_MISSING_ALERT_SENT,
      payment.id,
    )
  ) {
    return "sent";
  }

  const { data: tenant } = await service
    .from("tenants")
    .select("name, from_email")
    .eq("id", payment.tenant_id)
    .maybeSingle();

  let fromEmail: string;
  try {
    fromEmail = resolveNotificationFromEmail(tenant?.from_email as string | null | undefined);
  } catch (error) {
    await service.from("audit_log").insert({
      tenant_id: payment.tenant_id,
      action: PAYMENT_DOCUMENT_MISSING_ALERT_SKIPPED,
      entity_type: "payment",
      entity_id: payment.id,
      after_state: {
        reason: "sender_not_configured",
        message: error instanceof Error ? error.message : String(error),
      },
    });
    return "skipped";
  }

  const adminEmails = await resolveTenantAdminNotificationEmails(service, payment.tenant_id);
  if (adminEmails.length === 0) {
    await service.from("audit_log").insert({
      tenant_id: payment.tenant_id,
      action: PAYMENT_DOCUMENT_MISSING_ALERT_SKIPPED,
      entity_type: "payment",
      entity_id: payment.id,
      after_state: { reason: "no_tenant_admin_email" },
    });
    return "skipped";
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

  const schoolName = (tenant?.name as string | null) ?? "Manage Studio";
  const amount = formatCurrency(payment.total_amount_minor, payment.currency ?? "ILS", "he-IL");
  const subject = `${schoolName}: Missing tax invoice for payment`;
  const html = `
    <p><strong>Action required:</strong> a payment succeeded but no tax invoice has been recorded yet.</p>
    <ul>
      <li><strong>School:</strong> ${escapeHtml(schoolName)}</li>
      <li><strong>Amount:</strong> ${escapeHtml(amount)}</li>
      ${offeringName ? `<li><strong>Offering:</strong> ${escapeHtml(offeringName)}</li>` : ""}
      <li><strong>Provider:</strong> ${escapeHtml(String(payment.provider ?? ""))}</li>
      <li><strong>Paid at:</strong> ${escapeHtml(payment.paid_at ?? "")}</li>
      <li><strong>Payment ID:</strong> ${escapeHtml(payment.id)}</li>
      ${
        payment.engagement_id
          ? `<li><strong>Engagement ID:</strong> ${escapeHtml(payment.engagement_id)}</li>`
          : ""
      }
    </ul>
    <p>Check the payment provider dashboard and Finance → Payments in Manage Studio.</p>
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
      console.error("[check-missing-documents] alert failed:", adminEmail, err);
    }
  }

  if (sentTo.length > 0) {
    await service.from("audit_log").insert({
      tenant_id: payment.tenant_id,
      action: PAYMENT_DOCUMENT_MISSING_ALERT_SENT,
      entity_type: "payment",
      entity_id: payment.id,
      after_state: {
        recipient_emails: sentTo,
        grace_minutes: MISSING_DOCUMENT_GRACE_MINUTES,
        ...(failed.length > 0 ? { failed } : {}),
      },
    });
    return "sent";
  }

  await service.from("audit_log").insert({
    tenant_id: payment.tenant_id,
    action: PAYMENT_DOCUMENT_MISSING_ALERT_FAILED,
    entity_type: "payment",
    entity_id: payment.id,
    after_state: { failed },
  });
  return "failed";
}

export type CheckMissingDocumentsResult = {
  missingScanned: number;
  missingAlerted: number;
  missingFailed: number;
  missingSkipped: number;
  adminEmailRetried: number;
  adminEmailSent: number;
};

/**
 * 1) Alert admins for succeeded payments missing tax docs past the grace window.
 * 2) Retry admin invoice emails when a document exists but `_sent` audit is missing.
 */
export async function runCheckMissingDocuments(
  service: SupabaseClient,
): Promise<CheckMissingDocumentsResult> {
  const cutoff = new Date(
    Date.now() - MISSING_DOCUMENT_GRACE_MINUTES * 60 * 1000,
  ).toISOString();

  const result: CheckMissingDocumentsResult = {
    missingScanned: 0,
    missingAlerted: 0,
    missingFailed: 0,
    missingSkipped: 0,
    adminEmailRetried: 0,
    adminEmailSent: 0,
  };

  const { data: missingRows, error: missingError } = await service
    .from("payments")
    .select(
      "id, tenant_id, total_amount_minor, currency, paid_at, provider, engagement_id, offering_id",
    )
    .eq("status", "succeeded")
    .is("external_document_id", null)
    .lt("paid_at", cutoff)
    .order("paid_at", { ascending: true })
    .limit(MISSING_DOCUMENT_BATCH_LIMIT);

  if (missingError) throw missingError;

  result.missingScanned = missingRows?.length ?? 0;

  for (const row of missingRows ?? []) {
    const outcome = await alertAdminsMissingDocument(service, row as {
      id: string;
      tenant_id: string;
      total_amount_minor: number;
      currency: string;
      paid_at: string | null;
      provider: string | null;
      engagement_id: string | null;
      offering_id: string | null;
    });
    if (outcome === "sent") result.missingAlerted += 1;
    else if (outcome === "failed") result.missingFailed += 1;
    else result.missingSkipped += 1;
  }

  // Retry admin invoice emails for recorded docs that never got `_sent`.
  const { data: documented, error: documentedError } = await service
    .from("payments")
    .select("id, tenant_id")
    .eq("status", "succeeded")
    .not("external_document_id", "is", null)
    .order("invoice_issued_at", { ascending: true })
    .limit(MISSING_DOCUMENT_BATCH_LIMIT);

  if (documentedError) throw documentedError;

  for (const row of documented ?? []) {
    const paymentId = row.id as string;
    const tenantId = row.tenant_id as string;
    if (await auditExists(service, tenantId, PAYMENT_DOCUMENT_ADMIN_EMAIL_SENT, paymentId)) {
      continue;
    }
    result.adminEmailRetried += 1;
    const sendResult = await sendPaymentDocumentAdminEmail(service, {
      tenantId,
      paymentId,
    });
    if (sendResult.sent) result.adminEmailSent += 1;
  }

  return result;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

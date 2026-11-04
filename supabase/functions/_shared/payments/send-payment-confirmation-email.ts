import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.105.3";
import { sendHtmlEmail } from "../email-client.ts";
import { formatCurrency } from "../email-dist/format.js";
import {
  resolveTenantSender,
  TENANT_SENDER_COLUMNS,
  type TenantSender,
  type TenantSenderInput,
} from "../notification-from.ts";
import { paymentNeedsClientDocumentEmail } from "./send-payment-document-client-email.ts";

export const PAYMENT_CONFIRMATION_EMAIL_SENT = "payment_confirmation_email_sent";
export const PAYMENT_CONFIRMATION_EMAIL_FAILED = "payment_confirmation_email_failed";
export const PAYMENT_CONFIRMATION_EMAIL_SKIPPED = "payment_confirmation_email_skipped";

/**
 * Record a payment, PR 2 (owner decision 2026-11-04): a studio that issues no tax documents
 * (invoicing "none", e.g. not a registered business yet) gives the payer a plain payment
 * confirmation that says it is NOT a tax document. Only for money the studio recorded itself
 * (cash / bank transfer / Bit / PayBox); card providers send their own. The admin can untick
 * it per payment; it never stops the payment being recorded.
 */
export function needsNoDocumentConfirmation(input: {
  invoicingProvider: string | null | undefined;
  payment: { provider: string | null; payment_method: string | null };
}): boolean {
  return input.invoicingProvider === "none" && paymentNeedsClientDocumentEmail(input.payment);
}

export async function sendNoDocumentPaymentConfirmation(
  service: SupabaseClient,
  params: { tenantId: string; paymentId: string },
): Promise<{ sent: boolean; skipped?: string }> {
  const skip = async (reason: string): Promise<{ sent: false; skipped: string }> => {
    await service.from("audit_log").insert({
      tenant_id: params.tenantId,
      action: PAYMENT_CONFIRMATION_EMAIL_SKIPPED,
      entity_type: "payment",
      entity_id: params.paymentId,
      after_state: { reason },
    });
    return { sent: false, skipped: reason };
  };

  const { data: already } = await service
    .from("audit_log")
    .select("id")
    .eq("tenant_id", params.tenantId)
    .eq("action", PAYMENT_CONFIRMATION_EMAIL_SENT)
    .eq("entity_id", params.paymentId)
    .limit(1)
    .maybeSingle();
  if (already) return { sent: true };

  const [{ data: payment }, { data: tenant }] = await Promise.all([
    service
      .from("payments")
      .select("id, person_id, total_amount_minor, currency, payment_method, provider, paid_at")
      .eq("id", params.paymentId)
      .eq("tenant_id", params.tenantId)
      .maybeSingle(),
    service
      .from("tenants")
      .select(`name, language_default, invoicing_provider, ${TENANT_SENDER_COLUMNS}`)
      .eq("id", params.tenantId)
      .maybeSingle(),
  ]);
  if (!payment || !tenant) return skip("not_found");
  if (
    !needsNoDocumentConfirmation({
      invoicingProvider: tenant.invoicing_provider as string | null,
      payment: payment as { provider: string | null; payment_method: string | null },
    })
  ) {
    return { sent: false, skipped: "not_needed" };
  }
  if (!payment.person_id) return skip("no_recipient");

  const { data: person } = await service
    .from("people")
    .select("name, email")
    .eq("id", payment.person_id)
    .maybeSingle();
  const recipientEmail = (person?.email as string | null)?.trim();
  if (!recipientEmail) return skip("no_recipient");

  let sender: TenantSender;
  try {
    sender = resolveTenantSender(tenant as unknown as TenantSenderInput);
  } catch {
    return skip("sender_not_configured");
  }

  const language: "he" | "en" = tenant.language_default === "en" ? "en" : "he";
  const { subject, html } = renderNoDocumentConfirmation({
    language,
    studioName: (tenant.name as string | null) ?? "",
    recipientName: (person?.name as string | null)?.trim() ?? "",
    amount: formatCurrency(
      payment.total_amount_minor as number,
      (payment.currency as string) ?? "ILS",
      language === "he" ? "he-IL" : "en-IL",
    ),
    paymentMethod: payment.payment_method as string | null,
    paidOn: formatPaidOn(payment.paid_at as string | null, language),
  });

  try {
    await sendHtmlEmail({ to: recipientEmail, from: sender.from, replyTo: sender.replyTo, subject, html });
  } catch (err) {
    await service.from("audit_log").insert({
      tenant_id: params.tenantId,
      action: PAYMENT_CONFIRMATION_EMAIL_FAILED,
      entity_type: "payment",
      entity_id: params.paymentId,
      after_state: { recipient_email: recipientEmail, message: err instanceof Error ? err.message : String(err) },
    });
    return { sent: false };
  }

  await service.from("audit_log").insert({
    tenant_id: params.tenantId,
    action: PAYMENT_CONFIRMATION_EMAIL_SENT,
    entity_type: "payment",
    entity_id: params.paymentId,
    after_state: { recipient_email: recipientEmail },
  });
  return { sent: true };
}

function formatPaidOn(paidAt: string | null, language: "he" | "en"): string {
  const date = paidAt ? new Date(paidAt) : new Date();
  return date.toLocaleDateString(language === "he" ? "he-IL" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jerusalem",
  });
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const METHOD_TEXT: Record<"he" | "en", Record<string, string>> = {
  en: { cash: "in cash", bank_transfer: "by bank transfer", bit: "by Bit / PayBox" },
  he: { cash: "במזומן", bank_transfer: "בהעברה בנקאית", bit: "בביט / פייבוקס" },
};

/**
 * Pure renderer (tested). [[LAWYER: confirm]] the "not a tax document" wording (en + he),
 * listed in docs/legal/AWAITING-LAWYER-REVIEW.md.
 */
export function renderNoDocumentConfirmation(input: {
  language: "he" | "en";
  studioName: string;
  recipientName: string;
  amount: string;
  paymentMethod: string | null;
  paidOn: string;
}): { subject: string; html: string } {
  const he = input.language === "he";
  const studio = escapeHtml(input.studioName);
  const method = METHOD_TEXT[input.language][input.paymentMethod ?? ""] ?? "";
  const name = input.recipientName ? ` ${escapeHtml(input.recipientName)}` : "";
  const subject = he ? `אישור תשלום — ${input.studioName}` : `Payment confirmation — ${input.studioName}`;
  const lines = he
    ? [
      `שלום${name},`,
      `${studio} קיבל/ה את התשלום שלך על סך ${escapeHtml(input.amount)}${method ? ` ${method}` : ""} בתאריך ${escapeHtml(input.paidOn)}. תודה!`,
      `<strong>זהו אישור על קבלת תשלום בלבד, ואינו מסמך מס</strong> (לא קבלה ולא חשבונית).`,
    ]
    : [
      `Hi${name},`,
      `${studio} received your payment of ${escapeHtml(input.amount)}${method ? ` ${method}` : ""} on ${escapeHtml(input.paidOn)}. Thank you!`,
      `<strong>This is a payment confirmation only, not a tax document</strong> (not a receipt or an invoice).`,
    ];
  const html = `<!doctype html><html lang="${input.language}" dir="${he ? "rtl" : "ltr"}"><body style="font-family:Arial,sans-serif;line-height:1.5">${
    lines.map((l) => `<p>${l}</p>`).join("")
  }</body></html>`;
  return { subject, html };
}

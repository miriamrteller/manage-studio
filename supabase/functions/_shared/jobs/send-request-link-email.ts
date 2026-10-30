import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.105.3";
import { formatCurrency, formatDate } from "../email-dist/format.js";
import { EMAIL_TEMPLATE_NAMES, sendRenderedEmail } from "../email-send.ts";
import { resolveEnrolmentNotificationRecipient } from "../enrolment-recipient.ts";
import {
  resolveTenantSender,
  TENANT_SENDER_COLUMNS,
  type TenantSender,
  type TenantSenderInput,
} from "../notification-from.ts";
import { tenantBaseUrl } from "../tenant-url.ts";
import type { JobPaymentRequestRow } from "./load-request.ts";
import { canTransition } from "./payment-request-state.ts";

export type JobPaymentLinkKind = "admin_send" | "due_soon" | "overdue";

export type SendJobPaymentLinkResult =
  | { sent: true; recipientEmail: string; paymentUrl: string }
  | { sent: false; skipped: string; paymentUrl?: string };

const TEMPLATE_NAME = "payment_reminder";

/** Idempotency key stored in notification_log.variables.dunning_key (unique index). */
export function buildJobPaymentLinkKey(kind: JobPaymentLinkKind, requestId: string, salt?: string): string {
  return salt ? `job_request:${requestId}:${kind}:${salt}` : `job_request:${requestId}:${kind}`;
}

export function buildJobPaymentUrl(subdomain: string, publicToken: string): string {
  return `${tenantBaseUrl(subdomain)}/pay/${encodeURIComponent(publicToken)}`;
}

function copy(language: "he" | "en", kind: JobPaymentLinkKind, label: string, amount: string, due: string) {
  if (language === "he") {
    const intro = kind === "overdue"
      ? `התשלום עבור ${label} (${amount}) היה אמור להתקבל עד ${due}. נשמח להסדיר אותו בקישור למטה.`
      : kind === "due_soon"
      ? `תזכורת: התשלום עבור ${label} (${amount}) מגיע לתשלום ב-${due}.`
      : `מצורף קישור לתשלום עבור ${label} בסך ${amount}.`;
    const subject = kind === "overdue"
      ? `תזכורת תשלום — ${label}`
      : kind === "due_soon"
      ? `תשלום קרוב — ${label}`
      : `קישור לתשלום — ${label}`;
    return { intro, subject, cta: "לתשלום" };
  }
  const intro = kind === "overdue"
    ? `Payment for ${label} (${amount}) was due on ${due}. Please settle it using the link below.`
    : kind === "due_soon"
    ? `Reminder: payment for ${label} (${amount}) is due on ${due}.`
    : `Here is your payment link for ${label} (${amount}).`;
  const subject = kind === "overdue"
    ? `Payment reminder — ${label}`
    : kind === "due_soon"
    ? `Payment due soon — ${label}`
    : `Payment link — ${label}`;
  return { intro, subject, cta: "Pay now" };
}

/**
 * Email the client their pay link for one request, and move the request to
 * `sent` (sent_at) when it was still pending. Idempotent per (request, kind,
 * salt) through notification_log's dunning_key unique index — the daily cron
 * can run twice without a second email.
 */
export async function sendJobPaymentRequestLinkEmail(
  service: SupabaseClient,
  request: JobPaymentRequestRow,
  options: { kind: JobPaymentLinkKind; actorUserId?: string | null; idempotencySalt?: string },
): Promise<SendJobPaymentLinkResult> {
  const { data: tenant } = await service
    .from("tenants")
    .select(`id, name, subdomain, language_default, currency, primary_color, accent_color, ${TENANT_SENDER_COLUMNS}`)
    .eq("id", request.tenant_id)
    .single();
  if (!tenant) return { sent: false, skipped: "tenant_not_found" };

  const { data: engagement } = await service
    .from("engagements")
    .select("id, person_id, booked_starts_at")
    .eq("id", request.engagement_id)
    .single();
  if (!engagement) return { sent: false, skipped: "job_not_found" };

  const recipient = await resolveEnrolmentNotificationRecipient(
    service,
    request.tenant_id,
    engagement.person_id as string,
  );
  if (!recipient) return { sent: false, skipped: "no_recipient" };

  const paymentUrl = buildJobPaymentUrl(tenant.subdomain as string, request.public_token);
  const dunningKey = buildJobPaymentLinkKey(options.kind, request.id, options.idempotencySalt);

  const { data: already } = await service
    .from("notification_log")
    .select("id")
    .eq("tenant_id", request.tenant_id)
    .eq("template_name", TEMPLATE_NAME)
    .filter("variables->>dunning_key", "eq", dunningKey)
    .in("status", ["sent", "delivered", "read", "pending"])
    .limit(1)
    .maybeSingle();
  if (already) return { sent: false, skipped: "already_sent", paymentUrl };

  let sender: TenantSender;
  try {
    sender = resolveTenantSender(tenant as unknown as TenantSenderInput);
  } catch {
    return { sent: false, skipped: "sender_not_configured", paymentUrl };
  }

  const language: "he" | "en" = tenant.language_default === "he" ? "he" : "en";
  const locale = language === "he" ? "he-IL" : "en-GB";
  const amountFormatted = formatCurrency(request.amount_minor, request.currency, locale);
  const dueFormatted = request.due_date ? formatDate(request.due_date, locale) : "—";
  const text = copy(language, options.kind, request.label, amountFormatted, dueFormatted);

  const variables: Record<string, unknown> = {
    dunning_key: dunningKey,
    job_payment_request_id: request.id,
    engagement_id: request.engagement_id,
    kind: options.kind,
    recipientName: recipient.name,
    amountFormatted,
    className: request.label,
    description: request.label,
    dueDate: dueFormatted,
    paymentUrl,
    intro: text.intro,
    ctaButton: text.cta,
    subject: text.subject,
  };

  try {
    const result = await sendRenderedEmail({
      to: recipient.email,
      from: sender.from,
      replyTo: sender.replyTo,
      subject: text.subject,
      renderInput: {
        templateName: EMAIL_TEMPLATE_NAMES.PAYMENT_REMINDER,
        language,
        schoolName: tenant.name as string,
        tenantColors: {
          primary_color: tenant.primary_color as string | null,
          accent_color: tenant.accent_color as string | null,
        },
        variables,
      },
    });

    const { error: logError } = await service.from("notification_log").insert({
      tenant_id: request.tenant_id,
      recipient_person_id: recipient.personId,
      recipient_email: recipient.email,
      channel: "email",
      template_name: TEMPLATE_NAME,
      variables,
      external_msg_id: result.id,
      status: "sent",
      sent_at: new Date().toISOString(),
    });
    if (logError?.code === "23505") {
      return { sent: false, skipped: "already_sent", paymentUrl };
    }
  } catch (err) {
    try {
      await service.from("notification_log").insert({
        tenant_id: request.tenant_id,
        recipient_person_id: recipient.personId,
        recipient_email: recipient.email,
        channel: "email",
        template_name: TEMPLATE_NAME,
        variables,
        status: "failed",
        failure_reason: err instanceof Error ? err.message : "Email delivery failed",
        sent_at: null,
      });
    } catch {
      // Logging must never mask the send failure.
    }
    return { sent: false, skipped: "send_failed", paymentUrl };
  }

  if (canTransition(request.status, "send_link")) {
    await service
      .from("job_payment_requests")
      .update({ status: "sent", sent_at: new Date().toISOString() })
      .eq("id", request.id)
      .in("status", ["pending", "sent"]);
  }

  await service.from("audit_log").insert({
    tenant_id: request.tenant_id,
    action: "job_payment_request.link_sent",
    entity_type: "job_payment_request",
    entity_id: request.id,
    actor_id: options.actorUserId ?? null,
    after_state: { kind: options.kind, recipient_email: recipient.email, channel: "email" },
  });

  return { sent: true, recipientEmail: recipient.email, paymentUrl };
}

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { formatDate } from "../email-dist/format.js";
import { buildEnrolmentPayUrl } from "../enrolment-pay-url.ts";
import { resolveEnrolmentNotificationRecipient } from "../enrolment-recipient.ts";
import { resolveNotificationFromEmail } from "../notification-from.ts";
import { EMAIL_TEMPLATE_NAMES, sendRenderedEmail } from "../resend-send.ts";
import {
  buildDunningKey,
  hasCancellationAlreadyHandled,
} from "./dunning-idempotency.ts";
import {
  enrolmentDunningActionDueAt,
  enrolmentDunningNextActionAt,
  resolveEnrolmentDunningDueAttempt,
} from "./enrolment-dunning-time.ts";
import { sendPaymentDunningReminder } from "./send-payment-dunning-reminder.ts";

export async function applyEnrolmentPaymentDunningStep(
  service: SupabaseClient,
  engagementId: string,
  appBaseUrl: string,
): Promise<
  | { outcome: "skipped"; reason: string }
  | { outcome: "reminded"; attemptCount: 1 | 2 }
  | { outcome: "cancelled"; attemptCount: 3 }
  | { outcome: "error"; message: string }
> {
  const { data: engagement } = await service
    .from("engagements")
    .select(
      "id, tenant_id, person_id, offering_id, status, created_at, payment_dunning_attempt_count, payment_dunning_next_at",
    )
    .eq("id", engagementId)
    .single();

  if (!engagement) {
    return { outcome: "skipped", reason: "not_found" };
  }

  if (engagement.status !== "pending_payment") {
    return { outcome: "skipped", reason: "not_pending_payment" };
  }

  const attemptCount = engagement.payment_dunning_attempt_count as number;
  if (attemptCount >= 3) {
    return { outcome: "skipped", reason: "dunning_exhausted" };
  }

  const createdAt = engagement.created_at as string;
  const now = new Date();

  if (
    engagement.payment_dunning_next_at === null &&
    attemptCount === 0
  ) {
    const firstDue = enrolmentDunningActionDueAt(createdAt, 1);
    const { data: bootstrapped } = await service
      .from("engagements")
      .update({ payment_dunning_next_at: firstDue })
      .eq("id", engagementId)
      .eq("status", "pending_payment")
      .eq("payment_dunning_attempt_count", 0)
      .select("payment_dunning_next_at")
      .maybeSingle();

    if (!bootstrapped) {
      return { outcome: "skipped", reason: "concurrent_update" };
    }

    if (now < new Date(firstDue)) {
      return { outcome: "skipped", reason: "not_due" };
    }
  }

  let dueAttempt = resolveEnrolmentDunningDueAttempt(createdAt, attemptCount, now);

  if (
    dueAttempt === null &&
    engagement.payment_dunning_next_at &&
    new Date(engagement.payment_dunning_next_at as string) <= now &&
    attemptCount > 0
  ) {
    dueAttempt = (attemptCount + 1) as 1 | 2 | 3;
  }

  if (dueAttempt === null) {
    return { outcome: "skipped", reason: "not_due" };
  }

  if (dueAttempt === 3) {
    return cancelEngagementForDunning(service, {
      engagementId,
      tenantId: engagement.tenant_id as string,
      personId: engagement.person_id as string,
      offeringId: engagement.offering_id as string,
      createdAt,
      attemptCount,
      now,
    });
  }

  const nextAt = enrolmentDunningNextActionAt(createdAt, dueAttempt);

  const { data: updated } = await service
    .from("engagements")
    .update({
      payment_dunning_attempt_count: dueAttempt,
      payment_dunning_next_at: nextAt,
    })
    .eq("id", engagementId)
    .eq("status", "pending_payment")
    .eq("payment_dunning_attempt_count", attemptCount)
    .select("id, tenant_id, person_id, offering_id")
    .maybeSingle();

  if (!updated) {
    return { outcome: "skipped", reason: "concurrent_update" };
  }

  const recipient = await resolveEnrolmentNotificationRecipient(
    service,
    updated.tenant_id as string,
    updated.person_id as string,
  );

  if (!recipient) {
    await service.from("audit_log").insert({
      tenant_id: updated.tenant_id,
      action: "engagement.dunning_reminder_skipped",
      entity_type: "engagement",
      entity_id: engagementId,
      after_state: { reason: "no_recipient", attempt_count: dueAttempt },
    });
    return { outcome: "reminded", attemptCount: dueAttempt as 1 | 2 };
  }

  const baseUrl = appBaseUrl.replace(/\/$/, "");
  let paymentUrl = "#";
  let linkExpiresAt: Date | undefined;

  if (baseUrl) {
    try {
      const payLink = await buildEnrolmentPayUrl({
        appBaseUrl: baseUrl,
        engagementId,
        tenantId: updated.tenant_id as string,
        recipientEmail: recipient.email,
      });
      paymentUrl = payLink.paymentUrl;
      linkExpiresAt = payLink.linkExpiresAt;
    } catch {
      await service.from("audit_log").insert({
        tenant_id: updated.tenant_id,
        action: "engagement.dunning_reminder_skipped",
        entity_type: "engagement",
        entity_id: engagementId,
        after_state: { reason: "pay_url_failed", attempt_count: dueAttempt },
      });
      return { outcome: "reminded", attemptCount: dueAttempt as 1 | 2 };
    }
  } else {
    await service.from("audit_log").insert({
      tenant_id: updated.tenant_id,
      action: "engagement.dunning_reminder_skipped",
      entity_type: "engagement",
      entity_id: engagementId,
      after_state: { reason: "no_app_url", attempt_count: dueAttempt },
    });
    return { outcome: "reminded", attemptCount: dueAttempt as 1 | 2 };
  }

  await sendPaymentDunningReminder(service, {
    kind: "enrolment_unpaid",
    tenantId: updated.tenant_id as string,
    engagementId,
    offeringId: updated.offering_id as string,
    personId: updated.person_id as string,
    subjectId: engagementId,
    attemptCount: dueAttempt,
    nextActionAt: nextAt,
    paymentUrl,
    recipientPersonId: recipient.personId,
    linkExpiresAt,
  });

  return { outcome: "reminded", attemptCount: dueAttempt as 1 | 2 };
}

async function cancelEngagementForDunning(
  service: SupabaseClient,
  input: {
    engagementId: string;
    tenantId: string;
    personId: string;
    offeringId: string;
    createdAt: string;
    attemptCount: number;
    now: Date;
  },
): Promise<
  | { outcome: "skipped"; reason: string }
  | { outcome: "cancelled"; attemptCount: 3 }
> {
  if (await hasCancellationAlreadyHandled(service, input.tenantId, input.engagementId)) {
    return { outcome: "skipped", reason: "already_cancelled" };
  }

  const day14Due = enrolmentDunningActionDueAt(input.createdAt, 3);
  if (input.now < new Date(day14Due)) {
    return { outcome: "skipped", reason: "not_due" };
  }

  const { data: cancelled } = await service
    .from("engagements")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancellation_reason: "payment_dunning_exhausted",
      payment_dunning_attempt_count: 3,
      payment_dunning_next_at: null,
    })
    .eq("id", input.engagementId)
    .eq("status", "pending_payment")
    .eq("payment_dunning_attempt_count", input.attemptCount)
    .select("id, tenant_id, person_id, offering_id")
    .maybeSingle();

  if (!cancelled) {
    return { outcome: "skipped", reason: "concurrent_update" };
  }

  const recipient = await resolveEnrolmentNotificationRecipient(
    service,
    cancelled.tenant_id as string,
    cancelled.person_id as string,
  );

  const { data: offering } = await service
    .from("offerings")
    .select("name")
    .eq("id", cancelled.offering_id)
    .eq("tenant_id", cancelled.tenant_id)
    .single();

  const { data: tenant } = await service
    .from("tenants")
    .select("name, from_email, language_default, primary_color, accent_color")
    .eq("id", cancelled.tenant_id)
    .single();

  const className = (offering?.name as string) ?? "your class";
  const language = tenant?.language_default === "he" ? "he" : "en";
  const locale = language === "he" ? "he-IL" : "en-GB";
  const dunningKey = buildDunningKey("enrolment_unpaid", input.engagementId, 3);

  if (recipient && tenant) {
    try {
      const fromEmail = resolveNotificationFromEmail(tenant.from_email as string | null);
      const result = await sendRenderedEmail({
        to: recipient.email,
        from: fromEmail,
        renderInput: {
          templateName: EMAIL_TEMPLATE_NAMES.CLASS_CANCELLATION,
          language,
          schoolName: tenant.name as string,
          tenantColors: {
            primary_color: tenant.primary_color as string | null,
            accent_color: tenant.accent_color as string | null,
          },
          variables: {
            recipientName: recipient.name,
            cancelledClassName: className,
            cancelledDate: formatDate(new Date().toISOString(), locale),
            cancellationReason: language === "he"
              ? "התשלום לא הושלם בתוך 14 ימים"
              : "Payment was not completed within 14 days",
          },
        },
      });

      await service.from("notification_log").insert({
        tenant_id: cancelled.tenant_id,
        recipient_person_id: recipient.personId,
        recipient_email: recipient.email,
        channel: "email",
        template_name: "class_cancellation",
        variables: { dunning_key: dunningKey, dunning_kind: "enrolment_unpaid" },
        external_msg_id: result.id,
        status: "sent",
        sent_at: new Date().toISOString(),
      });
    } catch (err) {
      console.error("[applyEnrolmentPaymentDunningStep] cancellation email failed:", err);
    }
  }

  await service.from("audit_log").insert({
    tenant_id: cancelled.tenant_id,
    action: "engagement.dunning_cancelled",
    entity_type: "engagement",
    entity_id: input.engagementId,
    after_state: {
      attempt_count: 3,
      // TODO: process-waiting-list V2.2
    },
  });

  return { outcome: "cancelled", attemptCount: 3 };
}

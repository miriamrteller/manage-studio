import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { resolveNotificationFromEmail } from "../notification-from.ts";
import { EMAIL_TEMPLATE_NAMES, sendRenderedEmail } from "../resend-send.ts";
import {
  buildDunningKey,
  hasDunningNotificationBeenSent,
} from "./dunning-idempotency.ts";
import {
  buildDunningEmailContext,
  type DunningKind,
} from "./build-dunning-email-context.ts";

export async function sendPaymentDunningReminder(
  service: SupabaseClient,
  input: {
    kind: DunningKind;
    tenantId: string;
    engagementId: string;
    offeringId: string;
    personId: string;
    subjectId: string;
    attemptCount: number;
    nextActionAt: string | null;
    paymentUrl: string;
    recipientPersonId?: string;
    linkExpiresAt?: Date;
  },
): Promise<{ sent: boolean; skipped?: string }> {
  const dunningKey = buildDunningKey(input.kind, input.subjectId, input.attemptCount);

  if (await hasDunningNotificationBeenSent(service, input.tenantId, dunningKey)) {
    return { sent: false, skipped: "already_sent" };
  }

  if (!input.paymentUrl || input.paymentUrl === "#") {
    return { sent: false, skipped: "no_app_url" };
  }

  const { data: tenant } = await service
    .from("tenants")
    .select("name, language_default, from_email, primary_color, accent_color")
    .eq("id", input.tenantId)
    .single();

  if (!tenant) {
    return { sent: false, skipped: "tenant_not_found" };
  }

  const language = tenant.language_default === "he" ? "he" : "en";

  const context = await buildDunningEmailContext(service, {
    kind: input.kind,
    tenantId: input.tenantId,
    engagementId: input.engagementId,
    offeringId: input.offeringId,
    personId: input.personId,
    attemptCount: input.attemptCount,
    nextActionAt: input.nextActionAt,
    paymentUrl: input.paymentUrl,
    language,
    linkExpiresAt: input.linkExpiresAt,
  });

  if (!context) {
    return { sent: false, skipped: "no_recipient" };
  }

  const recipientPersonId = input.recipientPersonId ?? context.recipientPersonId;

  const { data: prefs } = await service
    .from("contact_preferences")
    .select("email_opted_in")
    .eq("tenant_id", input.tenantId)
    .eq("person_id", recipientPersonId)
    .maybeSingle();

  if (prefs?.email_opted_in === false) {
    return { sent: false, skipped: "email_opted_out" };
  }

  let fromEmail: string;
  try {
    fromEmail = resolveNotificationFromEmail(tenant.from_email as string | null);
  } catch {
    return { sent: false, skipped: "sender_not_configured" };
  }

  const emailVariables = {
    ...context.variables,
    dunning_key: dunningKey,
    dunning_kind: input.kind,
  };

  try {
    const result = await sendRenderedEmail({
      to: context.recipientEmail,
      from: fromEmail,
      renderInput: {
        templateName: EMAIL_TEMPLATE_NAMES.PAYMENT_REMINDER,
        language,
        schoolName: tenant.name as string,
        tenantColors: {
          primary_color: tenant.primary_color as string | null,
          accent_color: tenant.accent_color as string | null,
        },
        variables: emailVariables,
      },
    });

    const { error: insertError } = await service.from("notification_log").insert({
      tenant_id: input.tenantId,
      recipient_person_id: recipientPersonId,
      recipient_email: context.recipientEmail,
      channel: "email",
      template_name: "payment_reminder",
      variables: emailVariables,
      external_msg_id: result.id,
      status: "sent",
      sent_at: new Date().toISOString(),
    });

    if (insertError?.code === "23505") {
      return { sent: false, skipped: "already_sent" };
    }

    return { sent: true };
  } catch (err) {
    const failureReason = err instanceof Error ? err.message : "Email delivery failed";

    await service.from("notification_log").insert({
      tenant_id: input.tenantId,
      recipient_person_id: recipientPersonId,
      recipient_email: context.recipientEmail,
      channel: "email",
      template_name: "payment_reminder",
      variables: emailVariables,
      status: "failed",
      failure_reason: failureReason,
      sent_at: null,
    }).catch(() => undefined);

    return { sent: false, skipped: "send_failed" };
  }
}

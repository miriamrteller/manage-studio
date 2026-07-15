import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { getEnv } from "./env.ts";
import { buildAppointmentConfirmationPayload } from "./build-appointment-confirmation-payload.ts";
import { resolveAdminLinkRecipientEmail } from "./enrolment-recipient.ts";
import { resolveNotificationFromEmail } from "./notification-from.ts";
import {
  buildAppointmentClientSubject,
  buildAppointmentTenantSubject,
  renderAppointmentClientConfirmationHtml,
  renderAppointmentTenantNotificationHtml,
} from "./render-appointment-confirmation-email.ts";
import { sendHtmlEmail } from "./resend-client.ts";
import { signWaiverToken } from "./waiver-token.ts";

const APP_URL = getEnv("APP_URL") ?? "";

async function auditExists(
  service: SupabaseClient,
  tenantId: string,
  action: string,
  entityId: string,
): Promise<boolean> {
  const { data } = await service
    .from("audit_log")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("action", action)
    .eq("entity_id", entityId)
    .limit(1)
    .maybeSingle();
  return Boolean(data);
}

export async function sendAppointmentConfirmationEmails(
  service: SupabaseClient,
  params: {
    tenantId: string;
    paymentId: string;
    engagementId: string;
    engagementStatus: string;
    waiverDeadline: string | null;
  },
): Promise<void> {
  const pendingWaiver = params.engagementStatus === "pending_waiver";
  let signUrl: string | undefined;

  if (pendingWaiver && APP_URL) {
    const preview = await buildAppointmentConfirmationPayload(service, {
      tenantId: params.tenantId,
      paymentId: params.paymentId,
      engagementId: params.engagementId,
      pendingWaiver: true,
      deadlineDate: params.waiverDeadline ?? undefined,
    });

    const recipientEmail = preview?.recipientEmail ?? await resolveAdminLinkRecipientEmail(
      service,
      params.tenantId,
      params.engagementId,
    );

    if (recipientEmail) {
      const expireAt = params.waiverDeadline
        ? Math.floor(new Date(params.waiverDeadline).getTime() / 1000)
        : Math.floor(Date.now() / 1000) + 7 * 24 * 3600;
      const wt = await signWaiverToken({
        eid: params.engagementId,
        tid: params.tenantId,
        em: recipientEmail,
        exp: expireAt,
      });
      signUrl = `${APP_URL}/enrol/complete?engagementId=${encodeURIComponent(params.engagementId)}&wt=${wt}`;
    }
  }

  const payload = await buildAppointmentConfirmationPayload(service, {
    tenantId: params.tenantId,
    paymentId: params.paymentId,
    engagementId: params.engagementId,
    pendingWaiver,
    signUrl,
    deadlineDate: params.waiverDeadline ?? undefined,
  });

  if (!payload) {
    await service.from("audit_log").insert({
      tenant_id: params.tenantId,
      action: "appointment_confirmation_email_skipped",
      entity_type: "payment",
      entity_id: params.paymentId,
      after_state: {
        reason: "missing_payload",
        engagement_id: params.engagementId,
      },
    });
    return;
  }

  const { data: tenantRow } = await service
    .from("tenants")
    .select("from_email, primary_color, accent_color")
    .eq("id", params.tenantId)
    .single();

  if (!tenantRow) {
    await service.from("audit_log").insert({
      tenant_id: params.tenantId,
      action: "appointment_confirmation_email_skipped",
      entity_type: "payment",
      entity_id: params.paymentId,
      after_state: {
        reason: "missing_tenant",
        engagement_id: params.engagementId,
      },
    });
    return;
  }

  let fromEmail: string;
  try {
    fromEmail = resolveNotificationFromEmail(tenantRow.from_email);
  } catch (error) {
    await service.from("audit_log").insert({
      tenant_id: params.tenantId,
      action: "appointment_confirmation_email_skipped",
      entity_type: "payment",
      entity_id: params.paymentId,
      after_state: {
        reason: "sender_not_configured",
        message: error instanceof Error ? error.message : String(error),
        engagement_id: params.engagementId,
      },
    });
    return;
  }

  const primaryColor = (tenantRow.primary_color as string | null) ?? "#2563eb";

  if (!(await auditExists(service, params.tenantId, "payment_confirmation_email_sent", params.paymentId))) {
    try {
      await sendHtmlEmail({
        to: payload.recipientEmail,
        from: fromEmail,
        subject: buildAppointmentClientSubject(payload),
        html: renderAppointmentClientConfirmationHtml(payload, primaryColor),
      });

      await service.from("audit_log").insert({
        tenant_id: params.tenantId,
        action: "payment_confirmation_email_sent",
        entity_type: "payment",
        entity_id: params.paymentId,
        after_state: {
          engagement_id: params.engagementId,
          recipient_email: payload.recipientEmail,
          kind: "appointment_client",
        },
      });
    } catch (err) {
      console.error("[sendAppointmentConfirmationEmails] client email failed:", err);
      await service.from("audit_log").insert({
        tenant_id: params.tenantId,
        action: "payment_confirmation_email_failed",
        entity_type: "payment",
        entity_id: params.paymentId,
        after_state: {
          engagement_id: params.engagementId,
          recipient_email: payload.recipientEmail,
          kind: "appointment_client",
          message: err instanceof Error ? err.message : String(err),
        },
      });
    }
  }

  if (await auditExists(service, params.tenantId, "appointment_tenant_notification_email_sent", params.paymentId)) {
    return;
  }

  if (payload.tenantAdminEmails.length === 0) {
    await service.from("audit_log").insert({
      tenant_id: params.tenantId,
      action: "appointment_tenant_notification_email_skipped",
      entity_type: "payment",
      entity_id: params.paymentId,
      after_state: {
        reason: "no_tenant_admin_email",
        engagement_id: params.engagementId,
      },
    });
    return;
  }

  const tenantHtml = renderAppointmentTenantNotificationHtml(payload, primaryColor);
  const tenantSubject = buildAppointmentTenantSubject(payload);
  const sentTo: string[] = [];
  const failed: Array<{ email: string; message: string }> = [];

  for (const adminEmail of payload.tenantAdminEmails) {
    try {
      await sendHtmlEmail({
        to: adminEmail,
        from: fromEmail,
        subject: tenantSubject,
        html: tenantHtml,
      });
      sentTo.push(adminEmail);
    } catch (err) {
      failed.push({
        email: adminEmail,
        message: err instanceof Error ? err.message : String(err),
      });
      console.error("[sendAppointmentConfirmationEmails] tenant email failed:", adminEmail, err);
    }
  }

  if (sentTo.length > 0) {
    await service.from("audit_log").insert({
      tenant_id: params.tenantId,
      action: "appointment_tenant_notification_email_sent",
      entity_type: "payment",
      entity_id: params.paymentId,
      after_state: {
        engagement_id: params.engagementId,
        recipient_emails: sentTo,
        ...(failed.length > 0 ? { failed } : {}),
      },
    });
  } else {
    await service.from("audit_log").insert({
      tenant_id: params.tenantId,
      action: "appointment_tenant_notification_email_failed",
      entity_type: "payment",
      entity_id: params.paymentId,
      after_state: {
        engagement_id: params.engagementId,
        failed,
      },
    });
  }
}

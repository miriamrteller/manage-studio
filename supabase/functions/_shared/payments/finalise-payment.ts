import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { getEnv } from "../env.ts";
import { enqueueDocument } from "../enqueue-document.ts";
import { engagementHasSignedWaiver } from "../engagement-waiver.ts";
import { resolveEnrolmentNotificationRecipient, resolveAdminLinkRecipientEmail } from "../enrolment-recipient.ts";
import { resolveNotificationFromEmail } from "../notification-from.ts";
import { sendRenderedEmail, EMAIL_TEMPLATE_NAMES } from "../resend-send.ts";
import { signWaiverToken } from "../waiver-token.ts";
import { advanceBillingSchedule } from "./advance-billing-schedule.ts";
import type { FinalisePaymentParams } from "./types.ts";

const APP_URL = getEnv("APP_URL") ?? "";

const WEEKDAY_NAMES: Record<"en" | "he", string[]> = {
  en: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
  he: ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"],
};

function formatWeekday(dow: number | null | undefined, language: "en" | "he"): string | undefined {
  if (dow == null || dow < 0 || dow > 6) return undefined;
  return WEEKDAY_NAMES[language][dow];
}

/** "15:30:00" -> "15:30"; combines start/end into "15:30–16:15". */
function formatTimeRange(
  start: string | null | undefined,
  end: string | null | undefined,
): string | undefined {
  const hhmm = (t: string | null | undefined) =>
    typeof t === "string" && t.length >= 5 ? t.slice(0, 5) : undefined;
  const s = hhmm(start);
  const e = hhmm(end);
  if (s && e) return `${s}–${e}`;
  return s ?? e;
}

function formatStartDate(iso: string | null | undefined, language: "en" | "he"): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toLocaleDateString(language === "he" ? "he-IL" : "en-GB", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/** Loads schedule + start date + teacher for the offering, formatted for the email. */
async function buildClassDetails(
  service: SupabaseClient,
  offeringId: string,
  language: "en" | "he",
): Promise<{ day?: string; time?: string; startDate?: string; teacher?: string }> {
  const { data: offering } = await service
    .from("offerings")
    .select("day_of_week, start_time, end_time, season_id, staff_id")
    .eq("id", offeringId)
    .maybeSingle();
  if (!offering) return {};

  const [seasonRes, staffRes] = await Promise.all([
    offering.season_id
      ? service.from("seasons").select("start_date").eq("id", offering.season_id).maybeSingle()
      : Promise.resolve({ data: null }),
    offering.staff_id
      ? service.from("staff").select("name").eq("id", offering.staff_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return {
    day: formatWeekday(offering.day_of_week as number | null, language),
    time: formatTimeRange(offering.start_time as string | null, offering.end_time as string | null),
    startDate: formatStartDate((seasonRes.data as { start_date?: string } | null)?.start_date, language),
    teacher: typeof (staffRes.data as { name?: unknown } | null)?.name === "string"
      ? (staffRes.data as { name: string }).name
      : undefined,
  };
}

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

async function sendConfirmationEmail(
  service: SupabaseClient,
  params: {
    tenantId: string;
    paymentId: string;
    engagementId: string;
    engagementStatus: string;
    waiverDeadline: string | null;
  },
): Promise<void> {
  if (await auditExists(service, params.tenantId, "payment_confirmation_email_sent", params.paymentId)) {
    return;
  }

  const { data: engagement } = await service
    .from("engagements")
    .select("person_id, offering_id")
    .eq("id", params.engagementId)
    .single();
  if (!engagement) return;

  const [{ data: tenantRow }, { data: offeringRow }] = await Promise.all([
    service.from("tenants").select("name, from_email, language_default").eq("id", params.tenantId).single(),
    service
      .from("offerings")
      .select("name")
      .eq("id", engagement.offering_id)
      .single(),
  ]);

  const recipient = await resolveEnrolmentNotificationRecipient(
    service,
    params.tenantId,
    engagement.person_id as string,
  );
  const fallbackEmail = recipient
    ? null
    : await resolveAdminLinkRecipientEmail(service, params.tenantId, params.engagementId);
  const recipientEmail = recipient?.email ?? fallbackEmail;
  const recipientName = recipient?.name ?? "there";

  if (!recipientEmail || !tenantRow) {
    await service.from("audit_log").insert({
      tenant_id: params.tenantId,
      action: "payment_confirmation_email_skipped",
      entity_type: "payment",
      entity_id: params.paymentId,
      after_state: {
        reason: !recipientEmail ? "no_recipient" : "missing_tenant",
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
      action: "payment_confirmation_email_skipped",
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

  const language = (tenantRow.language_default === "he" ? "he" : "en") as "en" | "he";
  const offeringName = offeringRow?.name ?? "";
  const classDetails = await buildClassDetails(service, engagement.offering_id as string, language);

  try {
    if (params.engagementStatus === "pending_waiver" && APP_URL) {
      const expireAt = params.waiverDeadline
        ? Math.floor(new Date(params.waiverDeadline).getTime() / 1000)
        : Math.floor(Date.now() / 1000) + 7 * 24 * 3600;
      const wt = await signWaiverToken({
        eid: params.engagementId,
        tid: params.tenantId,
        em: recipientEmail,
        exp: expireAt,
      });
      const signUrl = `${APP_URL}/enrol/complete?engagementId=${encodeURIComponent(params.engagementId)}&wt=${wt}`;
      await sendRenderedEmail({
        to: recipientEmail,
        from: fromEmail,
        renderInput: {
          templateName: EMAIL_TEMPLATE_NAMES.ENROLMENT_CONFIRMATION,
          language,
          schoolName: tenantRow.name,
          variables: {
            recipientName,
            className: offeringName,
            classDetails,
            pendingWaiver: true,
            signUrl,
            deadlineDate: params.waiverDeadline ?? undefined,
          },
        },
      });
    } else {
      await sendRenderedEmail({
        to: recipientEmail,
        from: fromEmail,
        renderInput: {
          templateName: EMAIL_TEMPLATE_NAMES.ENROLMENT_CONFIRMATION,
          language,
          schoolName: tenantRow.name,
          variables: {
            recipientName,
            className: offeringName,
            classDetails,
            pendingWaiver: false,
            receiptPendingNote: true,
          },
        },
      });
    }

    await service.from("audit_log").insert({
      tenant_id: params.tenantId,
      action: "payment_confirmation_email_sent",
      entity_type: "payment",
      entity_id: params.paymentId,
      after_state: {
        engagement_id: params.engagementId,
        recipient_email: recipientEmail,
      },
    });
  } catch (err) {
    console.error("[finalisePayment] confirmation email failed:", err);
    await service.from("audit_log").insert({
      tenant_id: params.tenantId,
      action: "payment_confirmation_email_failed",
      entity_type: "payment",
      entity_id: params.paymentId,
      after_state: {
        engagement_id: params.engagementId,
        recipient_email: recipientEmail,
        message: err instanceof Error ? err.message : String(err),
      },
    });
  }
}

async function activateInitialEngagement(
  service: SupabaseClient,
  tenantId: string,
  engagementId: string,
): Promise<{ status: string; waiverDeadline: string | null }> {
  const { data: engagement } = await service
    .from("engagements")
    .select("status, payment_received_at, offering_id")
    .eq("id", engagementId)
    .single();

  if (
    engagement?.status === "active" ||
    (engagement?.status === "pending_waiver" && engagement.payment_received_at)
  ) {
    return { status: engagement.status as string, waiverDeadline: null };
  }

  let engagementStatus = "active";
  let waiverDeadline: string | null = null;

  const { data: offeringRow } = await service
    .from("offerings")
    .select("waiver_required")
    .eq("id", engagement?.offering_id)
    .single();

  if (offeringRow?.waiver_required) {
    const { satisfied } = await engagementHasSignedWaiver(service, engagementId, tenantId, {
      requireActiveTemplateMatch: false,
    });
    if (!satisfied) {
      engagementStatus = "pending_waiver";
      waiverDeadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    }
  }

  await service
    .from("engagements")
    .update({
      status: engagementStatus,
      billing_status: "current",
      payment_received_at: new Date().toISOString(),
      ...(waiverDeadline ? { waiver_deadline: waiverDeadline } : {}),
    })
    .eq("id", engagementId);

  return { status: engagementStatus, waiverDeadline };
}

async function ensureRecurringScheduleStub(
  service: SupabaseClient,
  engagementId: string,
  tenantId: string,
  billingAccountId: string,
): Promise<void> {
  const { data: existing } = await service
    .from("billing_schedules")
    .select("id")
    .eq("engagement_id", engagementId)
    .maybeSingle();
  if (existing) return;

  const { data: offering } = await service
    .from("engagements")
    .select("offering_id")
    .eq("id", engagementId)
    .single();
  if (!offering) return;

  const { data: offeringRow } = await service
    .from("offerings")
    .select("billing_mode")
    .eq("id", offering.offering_id)
    .single();
  if (offeringRow?.billing_mode !== "recurring") return;

  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const nextBillingDate = nextMonth.toISOString().slice(0, 10);

  await service.from("billing_schedules").insert({
    tenant_id: tenantId,
    engagement_id: engagementId,
    billing_account_id: billingAccountId,
    next_billing_date: nextBillingDate,
    status: "active",
  });
}

export async function finalisePayment(
  service: SupabaseClient,
  params: FinalisePaymentParams,
): Promise<void> {
  const paymentId = params.paymentRow.id;
  const auditAction =
    params.chargeType === "renewal" ? "renewal_payment_succeeded" : "payment_succeeded";

  if (!(await auditExists(service, params.tenantId, auditAction, paymentId))) {
    await service.from("audit_log").insert({
      tenant_id: params.tenantId,
      action: auditAction,
      entity_type: "payment",
      entity_id: paymentId,
      actor_id: params.actorUserId ?? null,
      after_state: { charge_type: params.chargeType, engagement_id: params.engagementId },
    });
  }

  if (params.chargeType === "renewal") {
    if (!params.billingScheduleId) {
      throw new Error("billingScheduleId required for renewal finalise");
    }
    await advanceBillingSchedule(service, params.billingScheduleId);
  } else {
    const { status, waiverDeadline } = await activateInitialEngagement(
      service,
      params.tenantId,
      params.engagementId,
    );

    const { data: engagement } = await service
      .from("engagements")
      .select("billing_account_id")
      .eq("id", params.engagementId)
      .single();

    if (engagement?.billing_account_id) {
      await ensureRecurringScheduleStub(
        service,
        params.engagementId,
        params.tenantId,
        engagement.billing_account_id as string,
      );
    }

    await sendConfirmationEmail(service, {
      tenantId: params.tenantId,
      paymentId,
      engagementId: params.engagementId,
      engagementStatus: status,
      waiverDeadline,
    });
  }

  if (!params.skipDocumentEnqueue) {
    // Bundled providers (Grow) may have already written the document via the invoice
    // webhook before this finalise ran. Skip enqueue when the document already exists to
    // avoid a duplicate document_queue row / double issuance.
    const { data: paymentDoc } = await service
      .from("payments")
      .select("external_document_id")
      .eq("id", paymentId)
      .maybeSingle();

    if (!paymentDoc?.external_document_id) {
      await enqueueDocument(service, {
        tenantId: params.tenantId,
        paymentId,
        documentKind: "sale",
      });

      // Mock invoicing is instant and dev/CI-only, and there is no cron worker draining the
      // queue locally, so issue the document inline to complete the full flow synchronously.
      // Real providers (grow/green_invoice) still issue async via the webhook/worker.
      const { data: invTenant } = await service
        .from("tenants")
        .select("invoicing_provider")
        .eq("id", params.tenantId)
        .maybeSingle();

      if (invTenant?.invoicing_provider === "mock") {
        const { data: queueRow } = await service
          .from("document_queue")
          .select("id, tenant_id, payment_id, document_kind, attempts, status")
          .eq("payment_id", paymentId)
          .eq("document_kind", "sale")
          .in("status", ["pending", "processing"])
          .maybeSingle();

        if (queueRow) {
          const { processQueueRow } = await import("../invoicing/process-queue-row.ts");
          await processQueueRow(service, queueRow as Parameters<typeof processQueueRow>[1]);
        }
      }
    }
  }

  if (params.chargeType === "renewal") {
    await sendConfirmationEmail(service, {
      tenantId: params.tenantId,
      paymentId,
      engagementId: params.engagementId,
      engagementStatus: "active",
      waiverDeadline: null,
    });
  }
}

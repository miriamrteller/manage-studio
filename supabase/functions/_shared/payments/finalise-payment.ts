import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { enqueueDocument } from "../enqueue-document.ts";
import { engagementHasSignedWaiver } from "../engagement-waiver.ts";
import { sendRenderedEmail, EMAIL_TEMPLATE_NAMES } from "../resend-send.ts";
import { signWaiverToken } from "../waiver-token.ts";
import { advanceBillingSchedule } from "./advance-billing-schedule.ts";
import type { FinalisePaymentParams } from "./types.ts";

const APP_URL = Deno.env.get("APP_URL") ?? "";

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

  const [{ data: person }, { data: tenantRow }, { data: offeringRow }] = await Promise.all([
    service.from("people").select("email, name, account_id").eq("id", engagement.person_id).single(),
    service.from("tenants").select("name, from_email, language_default").eq("id", params.tenantId).single(),
    service.from("offerings").select("name").eq("id", engagement.offering_id).single(),
  ]);

  if (!person?.email || !tenantRow?.from_email) return;

  const language = (tenantRow.language_default === "he" ? "he" : "en") as "en" | "he";
  const offeringName = offeringRow?.name ?? "";

  try {
    if (params.engagementStatus === "pending_waiver" && APP_URL) {
      const expireAt = params.waiverDeadline
        ? Math.floor(new Date(params.waiverDeadline).getTime() / 1000)
        : Math.floor(Date.now() / 1000) + 7 * 24 * 3600;
      const wt = await signWaiverToken({
        eid: params.engagementId,
        tid: params.tenantId,
        em: person.email,
        exp: expireAt,
      });
      const signUrl = `${APP_URL}/enrol/complete?engagementId=${encodeURIComponent(params.engagementId)}&wt=${wt}`;
      await sendRenderedEmail({
        to: person.email,
        from: tenantRow.from_email,
        renderInput: {
          templateName: EMAIL_TEMPLATE_NAMES.ENROLMENT_CONFIRMATION,
          language,
          schoolName: tenantRow.name,
          variables: {
            recipientName: person.name ?? "",
            className: offeringName,
            pendingWaiver: true,
            signUrl,
            deadlineDate: params.waiverDeadline ?? undefined,
          },
        },
      });
    } else {
      await sendRenderedEmail({
        to: person.email,
        from: tenantRow.from_email,
        renderInput: {
          templateName: EMAIL_TEMPLATE_NAMES.ENROLMENT_CONFIRMATION,
          language,
          schoolName: tenantRow.name,
          variables: {
            recipientName: person.name ?? "",
            className: offeringName,
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
    });
  } catch (err) {
    console.error("[finalisePayment] confirmation email failed:", err);
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
    await enqueueDocument(service, {
      tenantId: params.tenantId,
      paymentId,
      documentKind: "sale",
    });
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

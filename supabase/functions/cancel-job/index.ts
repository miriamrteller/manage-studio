import { z } from "npm:zod@4.6.7";
import { handleOptions, jsonResponse } from "../_shared/edge-runtime/cors.ts";
import { createServiceClient, requireAuthUser } from "../_shared/edge-runtime/supabase.ts";
import { resolveEnrolmentNotificationRecipient } from "../_shared/enrolment-recipient.ts";
import { planJobCancellation, type CancelPlanRequest } from "../_shared/jobs/cancel-job-plan.ts";
import {
  AUTOMATIC_EMAIL_TENANT_COLUMNS,
  type AutomaticEmailTenant,
  sendAutomaticEmail,
} from "../_shared/photographer-emails/send.ts";
import { shootCancelledVariables } from "../_shared/photographer-emails/variables.ts";
import { syncBookingEventDelete } from "../_shared/sync-booking-event.ts";
import { withMonitoring } from "../_shared/monitoring.ts";

/**
 * Admin "Cancel shoot". In one step:
 *  - the shoot and its booking are marked cancelled (frees the time slot),
 *  - open pay links (pending / sent) are cancelled, so reminders stop,
 *  - the Google Calendar event is removed (if connected),
 *  - optionally, the client gets the "shoot cancelled" email.
 * Paid money is not touched: the studio refunds from the payment if it wants to.
 * Calendar and email are best effort and never undo the cancel.
 */
const BodySchema = z.object({
  engagement_id: z.string().guid(),
  notify_client: z.boolean().default(true),
});

Deno.serve(withMonitoring("cancel-job", async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const auth = await requireAuthUser(req);
  if ("error" in auth) return jsonResponse({ error: auth.error }, auth.status);

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    return jsonResponse({ error: "Invalid request body" }, 400);
  }

  const service = createServiceClient();
  const { data: profile } = await service
    .from("user_profiles")
    .select("tenant_id, role")
    .eq("id", auth.user.id)
    .single();
  const roles = (profile?.role as string[] | null) ?? [];
  const tenantId = profile?.tenant_id as string | undefined;
  if (!tenantId || !(roles.includes("tenant_admin") || roles.includes("super_admin"))) {
    return jsonResponse({ error: "tenant_admin role required" }, 403);
  }

  const { data: engagement } = await service
    .from("engagements")
    .select("id, tenant_id, person_id, status, booked_starts_at")
    .eq("id", body.engagement_id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const { data: job } = await service
    .from("job_details")
    .select("engagement_id, job_status")
    .eq("engagement_id", body.engagement_id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!engagement || !job) return jsonResponse({ error: "Shoot not found" }, 404);
  if (engagement.status === "cancelled" && job.job_status === "cancelled") {
    return jsonResponse({ error: "Shoot is already cancelled" }, 409);
  }

  const { data: requests, error: requestsError } = await service
    .from("job_payment_requests")
    .select("id, status, amount_minor")
    .eq("engagement_id", body.engagement_id)
    .eq("tenant_id", tenantId);
  if (requestsError) return jsonResponse({ error: "Could not load payments" }, 500);
  const plan = planJobCancellation((requests ?? []) as CancelPlanRequest[]);

  const now = new Date().toISOString();
  const { error: jobError } = await service
    .from("job_details")
    .update({ job_status: "cancelled" })
    .eq("engagement_id", body.engagement_id)
    .eq("tenant_id", tenantId);
  if (jobError) return jsonResponse({ error: "Could not cancel the shoot" }, 500);

  if (engagement.status !== "cancelled") {
    const { error: engError } = await service
      .from("engagements")
      .update({ status: "cancelled", cancelled_at: now, cancellation_reason: "admin_cancelled" })
      .eq("id", body.engagement_id)
      .eq("tenant_id", tenantId);
    if (engError) return jsonResponse({ error: "Could not cancel the booking" }, 500);
  }

  if (plan.cancelRequestIds.length > 0) {
    const { error: reqError } = await service
      .from("job_payment_requests")
      .update({ status: "cancelled" })
      .in("id", plan.cancelRequestIds)
      .in("status", ["pending", "sent"]);
    if (reqError) console.error("[cancel-job] cancel requests:", reqError.message);
  }

  try {
    await syncBookingEventDelete(service, tenantId, body.engagement_id);
  } catch (error) {
    console.warn("[cancel-job] calendar delete failed", error);
  }

  let emailed = false;
  if (body.notify_client && engagement.person_id) {
    try {
      const { data: tenant } = await service
        .from("tenants")
        .select(AUTOMATIC_EMAIL_TENANT_COLUMNS)
        .eq("id", tenantId)
        .single();
      const recipient = await resolveEnrolmentNotificationRecipient(
        service,
        tenantId,
        engagement.person_id as string,
      );
      if (tenant && recipient) {
        const automaticTenant = tenant as unknown as AutomaticEmailTenant;
        const language = automaticTenant.language_default === "he" ? "he" : "en";
        const outcome = await sendAutomaticEmail(service, {
          tenant: automaticTenant,
          key: "shoot_cancelled",
          engagementId: body.engagement_id,
          to: recipient.email,
          variables: shootCancelledVariables(
            { recipientName: recipient.name, startsAt: engagement.booked_starts_at as string | null },
            language,
          ),
        });
        emailed = outcome === "sent";
      }
    } catch (error) {
      console.error("[cancel-job] email failed", error);
    }
  }

  await service.from("audit_log").insert({
    tenant_id: tenantId,
    action: "job.cancelled",
    entity_type: "engagement",
    entity_id: body.engagement_id,
    actor_id: auth.user.id,
    after_state: {
      cancelled_requests: plan.cancelRequestIds.length,
      paid_minor: plan.paidMinor,
      notify_client: body.notify_client,
      emailed,
    },
  });

  return jsonResponse({
    ok: true,
    cancelledRequests: plan.cancelRequestIds.length,
    paidMinor: plan.paidMinor,
    emailed,
  });
}));

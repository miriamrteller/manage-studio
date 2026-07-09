import { corsHeaders, jsonResponse } from "../../packages/edge-runtime/src/cors.ts";
import { createServiceClient } from "../../packages/edge-runtime/src/supabase.ts";
import { resolveNotificationFromEmail } from "../_shared/notification-from.ts";
import { resolveEnrolmentNotificationRecipient } from "../_shared/enrolment-recipient.ts";
import { signWaiverToken } from "../_shared/waiver-token.ts";
import {
  EMAIL_TEMPLATE_NAMES,
  sendRenderedEmail,
} from "../_shared/resend-send.ts";

interface SendAdminWaiverLinkBody {
  engagementId: string;
  recipientEmail: string;
  recipientName?: string;
  overrideReason?: string;
}

const APP_URL = Deno.env.get("APP_URL") ?? "";

function getAppBaseUrl(req: Request): string {
  if (APP_URL) return APP_URL;
  const origin = req.headers.get("origin")?.trim();
  if (!origin) return "";
  try {
    return new URL(origin).origin;
  } catch {
    return "";
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) return jsonResponse({ error: "Missing authorization" }, 401);

    const service = createServiceClient();
    const { data: { user }, error: authError } = await service.auth.getUser(token);
    if (authError || !user) return jsonResponse({ error: "Unauthorized" }, 401);

    const { data: profile } = await service
      .from("user_profiles")
      .select("id, tenant_id, role, email")
      .eq("id", user.id)
      .single();
    if (!profile?.tenant_id) return jsonResponse({ error: "User has no tenant" }, 403);
    const roles = (profile.role as string[] | null) ?? [];
    if (!roles.includes("tenant_admin") && !roles.includes("super_admin")) {
      return jsonResponse({ error: "Forbidden" }, 403);
    }

    const body = (await req.json()) as SendAdminWaiverLinkBody;
    if (!body.engagementId || !body.recipientEmail) {
      return jsonResponse({ error: "engagementId and recipientEmail are required" }, 400);
    }
    const recipientEmail = body.recipientEmail.trim().toLowerCase();
    if (!recipientEmail) return jsonResponse({ error: "recipientEmail is required" }, 400);

    const tenantId = profile.tenant_id as string;

    const nowIso = new Date().toISOString();
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString();

    const { count: tenantHourlyCount } = await service
      .from("audit_log")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("action", "admin.waiver_link_sent")
      .gte("created_at", oneHourAgo);
    if ((tenantHourlyCount ?? 0) >= 20) {
      return jsonResponse({ error: "Too many waiver links sent recently. Please try again shortly." }, 429);
    }

    const { data: recentSameEngagement } = await service
      .from("audit_log")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("action", "admin.waiver_link_sent")
      .eq("entity_type", "engagement")
      .eq("entity_id", body.engagementId)
      .gte("created_at", oneMinuteAgo)
      .limit(1)
      .maybeSingle();
    if (recentSameEngagement?.id) {
      return jsonResponse({ error: "Please wait before sending another link for this enrolment." }, 429);
    }

    const { data: engagement } = await service
      .from("engagements")
      .select("id, tenant_id, person_id, status, offering_id, waiver_deadline")
      .eq("id", body.engagementId)
      .eq("tenant_id", tenantId)
      .single();
    if (!engagement) return jsonResponse({ error: "Engagement not found" }, 404);
    if (engagement.status !== "pending_waiver") {
      return jsonResponse({ error: "Engagement is not pending waiver" }, 409);
    }

    const { data: tenant } = await service
      .from("tenants")
      .select("id, name, from_email, language_default, primary_color, accent_color")
      .eq("id", tenantId)
      .single();
    if (!tenant) return jsonResponse({ error: "Tenant not found" }, 404);

    const { data: student } = await service
      .from("people")
      .select("name")
      .eq("id", engagement.person_id)
      .eq("tenant_id", tenantId)
      .single();
    if (!student) return jsonResponse({ error: "Student not found" }, 404);

    const { data: offering } = await service
      .from("offerings")
      .select("name")
      .eq("id", engagement.offering_id)
      .eq("tenant_id", tenantId)
      .single();

    const resolvedRecipient = await resolveEnrolmentNotificationRecipient(
      service,
      tenantId,
      engagement.person_id as string,
    );
    const guardianEmail = resolvedRecipient?.email ?? null;
    const guardianName =
      body.recipientName ?? resolvedRecipient?.name ?? (student.name as string);

    const isOverride = guardianEmail ? recipientEmail !== guardianEmail : false;
    if (isOverride && !body.overrideReason?.trim()) {
      return jsonResponse({ error: "overrideReason is required when recipient differs from guardian email" }, 400);
    }

    const waiverDeadline = engagement.waiver_deadline as string | null;
    const expireAt = waiverDeadline
      ? Math.floor(new Date(waiverDeadline).getTime() / 1000)
      : Math.floor(Date.now() / 1000) + 7 * 24 * 3600;

    const wt = await signWaiverToken({
      eid: engagement.id as string,
      tid: tenantId,
      em: recipientEmail,
      exp: expireAt,
    });

    const appBaseUrl = getAppBaseUrl(req);
    if (!appBaseUrl) {
      return jsonResponse({ error: "APP_URL is not configured and request origin is unavailable" }, 500);
    }
    const signUrl = `${appBaseUrl}/enrol/complete?engagementId=${encodeURIComponent(engagement.id as string)}&wt=${encodeURIComponent(wt)}`;

    const fromEmail = (() => {
      try {
        return resolveNotificationFromEmail(tenant.from_email as string | null);
      } catch {
        return null;
      }
    })();
    const language = tenant.language_default === "he" ? "he" : "en";
    const className = (offering?.name as string | null) ?? "your class";

    let emailSent = false;
    let emailError: string | null = null;

    if (!fromEmail) {
      emailError = "Sender email is not configured";
    } else {
      try {
        await sendRenderedEmail({
          to: recipientEmail,
          from: fromEmail,
          renderInput: {
            templateName: EMAIL_TEMPLATE_NAMES.WAIVER_REMINDER,
            language,
            schoolName: tenant.name as string,
            tenantColors: {
              primary_color: tenant.primary_color as string | null,
              accent_color: tenant.accent_color as string | null,
            },
            variables: {
              recipientName: guardianName,
              className,
              signUrl,
              deadlineDate: waiverDeadline ?? undefined,
              isUrgent: false,
            },
          },
        });
        emailSent = true;
      } catch (mailErr) {
        emailError = mailErr instanceof Error ? mailErr.message : "Email delivery failed";
      }
    }

    await service.from("audit_log").insert({
      tenant_id: tenantId,
      actor_id: profile.id,
      actor_email: profile.email as string | null,
      action: "admin.waiver_link_sent",
      entity_type: "engagement",
      entity_id: engagement.id,
      after_state: {
        resolved_guardian_email: guardianEmail,
        recipient_email: recipientEmail,
        override_reason: body.overrideReason ?? null,
        outcome: emailSent ? "sent" : "email_failed",
        email_error: emailError,
        sent_at: nowIso,
      },
    });

    return jsonResponse({
      success: true,
      signUrl,
      emailSent,
      ...(emailError ? { warning: emailError } : {}),
    });
  } catch (err) {
    console.error("[send-admin-waiver-link]", err);
    return jsonResponse({ error: err instanceof Error ? err.message : "Internal error" }, 500);
  }
});

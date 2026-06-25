import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { resolveNotificationFromEmail } from "../_shared/notification-from.ts";
import { resolveEnrolmentPaymentEmailDetails } from "../_shared/enrolment-payment-email.ts";
import { resolveEnrolmentNotificationRecipient } from "../_shared/enrolment-recipient.ts";
import { signWaiverToken } from "../_shared/waiver-token.ts";
import {
  EMAIL_TEMPLATE_NAMES,
  sendRenderedEmail,
} from "../_shared/resend-send.ts";

interface SendAdminEnrolmentLinkBody {
  engagementId: string;
  recipientEmail: string;
  recipientName?: string;
  overrideReason?: string;
  skipNotificationEmail?: boolean;
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

    const body = (await req.json()) as SendAdminEnrolmentLinkBody;
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
      .eq("action", "admin.enrolment_link_sent")
      .gte("created_at", oneHourAgo);
    if ((tenantHourlyCount ?? 0) >= 20) {
      return jsonResponse({ error: "Too many enrolment links sent recently. Please try again shortly." }, 429);
    }

    const { data: recentSameEngagement } = await service
      .from("audit_log")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("action", "admin.enrolment_link_sent")
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
      .select("id, tenant_id, person_id, status, offering_id")
      .eq("id", body.engagementId)
      .eq("tenant_id", tenantId)
      .single();
    if (!engagement) return jsonResponse({ error: "Engagement not found" }, 404);
    if (engagement.status !== "pending_payment") {
      return jsonResponse({ error: "Engagement is not pending payment" }, 409);
    }

    const { data: tenant } = await service
      .from("tenants")
      .select("id, name, from_email, language_default, primary_color, accent_color")
      .eq("id", tenantId)
      .single();
    if (!tenant) return jsonResponse({ error: "Tenant not found" }, 404);

    const { data: student } = await service
      .from("people")
      .select("name, account_id, email")
      .eq("id", engagement.person_id)
      .eq("tenant_id", tenantId)
      .single();
    if (!student) return jsonResponse({ error: "Student not found" }, 404);

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

    const expireAt = Math.floor(Date.now() / 1000) + 7 * 24 * 3600;
    const linkExpiresAt = new Date(expireAt * 1000);
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
    const paymentUrl = `${appBaseUrl}/enrol/pay/${encodeURIComponent(engagement.id as string)}?t=${encodeURIComponent(wt)}`;

    const fromEmail = (() => {
      try {
        return resolveNotificationFromEmail(tenant.from_email as string | null);
      } catch {
        return null;
      }
    })();
    const language = tenant.language_default === "he" ? "he" : "en";
    const paymentDetails = await resolveEnrolmentPaymentEmailDetails(service, {
      tenantId,
      offeringId: engagement.offering_id as string,
      studentName: student.name as string,
      language,
      linkExpiresAt,
    });

    let emailSent = false;
    let emailError: string | null = null;

    if (body.skipNotificationEmail) {
      emailSent = false;
    } else if (!fromEmail) {
      emailError = "Sender email is not configured";
    } else if (!paymentDetails) {
      emailError = "Could not load class pricing for email";
    } else {
      try {
        await sendRenderedEmail({
          to: recipientEmail,
          from: fromEmail,
          renderInput: {
            templateName: EMAIL_TEMPLATE_NAMES.PAYMENT_REMINDER,
            language,
            schoolName: tenant.name as string,
            tenantColors: {
              primary_color: tenant.primary_color as string | null,
              accent_color: tenant.accent_color as string | null,
            },
            variables: {
              subject: language === "he"
                ? `השלמת הרשמה — ${paymentDetails.className}`
                : `Complete enrollment — ${paymentDetails.className}`,
              recipientName: guardianName,
              enrolledClassName: paymentDetails.className,
              description: paymentDetails.description,
              amountOutstandingFormatted: paymentDetails.amountOutstandingFormatted,
              amountFormatted: paymentDetails.amountOutstandingFormatted,
              paymentUrl,
              dueDate: paymentDetails.dueDate,
              intro: paymentDetails.intro,
              ctaButton: paymentDetails.ctaButton,
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
      action: "admin.enrolment_link_sent",
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
      paymentUrl,
      emailSent,
      ...(emailError ? { warning: emailError } : {}),
    });
  } catch (err) {
    console.error("[send-admin-enrolment-link]", err);
    return jsonResponse({ error: err instanceof Error ? err.message : "Internal error" }, 500);
  }
});


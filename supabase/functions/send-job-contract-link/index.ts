/**
 * send-job-contract-link
 *
 * Admin emails a tokenised contract-signing link for a job ("shoot"). Reuses
 * the waiver-link stack: a WaiverToken scoped to the engagement + recipient,
 * the /enrol/complete signing page (get-waiver-engagement renders the active
 * consent template with the job's merge fields) and accept-waiver, which
 * stores the signed record on engagements.waiver_evidence_id.
 *
 * Authorization: Bearer <supabase session> (tenant admin)
 * Body: { engagementId, recipientEmail }
 */
import { corsHeaders, jsonResponse } from "../_shared/edge-runtime/cors.ts";
import { createServiceClient } from "../_shared/edge-runtime/supabase.ts";
import { resolveTenantSender, TENANT_SENDER_COLUMNS, type TenantSenderInput } from "../_shared/notification-from.ts";
import { signWaiverToken } from "../_shared/waiver-token.ts";
import { EMAIL_TEMPLATE_NAMES, sendRenderedEmail } from "../_shared/email-send.ts";
import { loadJobContractContext } from "../_shared/job-contract.ts";

interface SendJobContractLinkBody {
  engagementId: string;
  recipientEmail: string;
}

const APP_URL = Deno.env.get("APP_URL") ?? "";
const LINK_TTL_SECONDS = 14 * 24 * 3600;

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
    const token = (req.headers.get("authorization") ?? "").replace("Bearer ", "");
    if (!token) return jsonResponse({ error: "Missing authorization" }, 401);

    const service = createServiceClient();
    const { data: { user }, error: authError } = await service.auth.getUser(token);
    if (authError || !user) return jsonResponse({ error: "Unauthorized" }, 401);

    const { data: profile } = await service
      .from("user_profiles")
      .select("id, tenant_id, role")
      .eq("id", user.id)
      .single();
    if (!profile?.tenant_id) return jsonResponse({ error: "User has no tenant" }, 403);
    const roles = (profile.role as string[] | null) ?? [];
    if (!roles.includes("tenant_admin") && !roles.includes("super_admin")) {
      return jsonResponse({ error: "Forbidden" }, 403);
    }
    const tenantId = profile.tenant_id as string;

    const body = (await req.json().catch(() => null)) as SendJobContractLinkBody | null;
    const recipientEmail = body?.recipientEmail?.trim().toLowerCase() ?? "";
    if (!body?.engagementId || !recipientEmail || !recipientEmail.includes("@")) {
      return jsonResponse({ error: "engagementId and recipientEmail are required" }, 400);
    }

    // Rate limit: at most one link per job per minute (audit_log is the ledger).
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString();
    const { data: recent } = await service
      .from("audit_log")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("action", "admin.job_contract_link_sent")
      .eq("entity_type", "engagement")
      .eq("entity_id", body.engagementId)
      .gte("created_at", oneMinuteAgo)
      .limit(1)
      .maybeSingle();
    if (recent?.id) {
      return jsonResponse({ error: "Please wait before sending another contract link for this job." }, 429);
    }

    const { data: tenant } = await service
      .from("tenants")
      .select(`id, name, language_default, primary_color, accent_color, ${TENANT_SENDER_COLUMNS}`)
      .eq("id", tenantId)
      .single();
    if (!tenant) return jsonResponse({ error: "Tenant not found" }, 404);
    const language = tenant.language_default === "he" ? "he" : "en";

    const job = await loadJobContractContext(service, { tenantId, engagementId: body.engagementId, language });
    if (!job) return jsonResponse({ error: "Job not found" }, 404);
    if (job.engagementStatus === "cancelled" || job.jobStatus === "cancelled") {
      return jsonResponse({ error: "Job is cancelled" }, 409);
    }
    if (job.waiverEvidenceId) return jsonResponse({ error: "Contract already signed" }, 409);

    const { data: template } = await service
      .from("consent_templates")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("status", "active")
      .maybeSingle();
    if (!template) return jsonResponse({ error: "No active contract template" }, 409);

    const expireAt = Math.floor(Date.now() / 1000) + LINK_TTL_SECONDS;
    const wt = await signWaiverToken(service, { eid: job.engagementId, tid: tenantId, em: recipientEmail, exp: expireAt });

    const appBaseUrl = getAppBaseUrl(req);
    if (!appBaseUrl) {
      return jsonResponse({ error: "APP_URL is not configured and request origin is unavailable" }, 500);
    }
    const signUrl = `${appBaseUrl}/enrol/complete?engagementId=${encodeURIComponent(job.engagementId)}&wt=${encodeURIComponent(wt)}`;

    const sender = (() => {
      try {
        return resolveTenantSender(tenant as unknown as TenantSenderInput);
      } catch {
        return null;
      }
    })();

    let emailSent = false;
    let emailError: string | null = null;
    if (!sender) {
      emailError = "Sender email is not configured";
    } else {
      try {
        await sendRenderedEmail({
          to: recipientEmail,
          from: sender.from,
          replyTo: sender.replyTo,
          renderInput: {
            templateName: EMAIL_TEMPLATE_NAMES.WAIVER_REMINDER,
            language,
            schoolName: tenant.name as string,
            tenantColors: {
              primary_color: tenant.primary_color as string | null,
              accent_color: tenant.accent_color as string | null,
            },
            variables: {
              recipientName: job.fields.client_name,
              className: job.fields.package,
              signUrl,
              deadlineDate: new Date(expireAt * 1000).toISOString(),
              isUrgent: false,
            },
          },
        });
        emailSent = true;
      } catch (mailErr) {
        emailError = mailErr instanceof Error ? mailErr.message : "Email delivery failed";
      }
    }

    // Audit: the recipient is also what get-waiver-engagement's token-email
    // check accepts (admin.enrolment_link_sent is the shape it reads), so log
    // both the job-specific action and the recipient grant.
    const nowIso = new Date().toISOString();
    await service.from("audit_log").insert([
      {
        tenant_id: tenantId,
        actor_id: user.id,
        action: "admin.job_contract_link_sent",
        entity_type: "engagement",
        entity_id: job.engagementId,
        after_state: { recipient_email: recipientEmail, email_sent: emailSent, email_error: emailError, sent_at: nowIso },
      },
      {
        tenant_id: tenantId,
        actor_id: user.id,
        action: "admin.enrolment_link_sent",
        entity_type: "engagement",
        entity_id: job.engagementId,
        after_state: { recipient_email: recipientEmail, purpose: "job_contract", sent_at: nowIso },
      },
    ]);

    if (!emailSent) {
      return jsonResponse({ error: emailError ?? "Email delivery failed", emailSent: false, signUrl }, 502);
    }
    return jsonResponse({ ok: true, emailSent: true, recipientEmail, expiresAt: new Date(expireAt * 1000).toISOString() });
  } catch (err) {
    console.error("[send-job-contract-link]", err);
    return jsonResponse({ error: err instanceof Error ? err.message : "Internal error" }, 500);
  }
});

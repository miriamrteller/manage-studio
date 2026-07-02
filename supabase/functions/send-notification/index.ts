import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { createServiceClient, requireAuthUser } from "../_shared/supabase.ts";
import {
  isSupportedEmailTemplate,
  sendRenderedEmail,
  EMAIL_TEMPLATE_NAMES,
} from "../_shared/resend-send.ts";
import {
  getEmailTemplateOverrides,
  getTenantEmailConfig,
} from "../_shared/tenant-email.ts";

interface NotificationPayload {
  tenantId: string;
  recipientId?: string;
  recipientType?: "person" | "family_member";
  recipientEmail?: string;
  recipientPhone?: string;
  templateName: string;
  channel: "email" | "whatsapp" | "voice";
  variables?: Record<string, unknown>;
}

interface AdminBlastPayload {
  mode: "admin_blast";
  tenantId: string;
  scope: "all" | "level" | "class" | "account";
  categoryId?: string;
  offeringId?: string;
  accountId?: string;
  recipientQuery?: string;
  selectedPersonIds?: string[];
  subject: string;
  body: string;
}

interface BlastRecipientRow {
  recipient_email: string;
  recipient_name: string | null;
  person_id: string;
  account_member_id: string | null;
}

interface TenantConfig {
  id: string;
  name: string;
  locale: string;
  dir: "ltr" | "rtl";
  primary_color?: string;
  accent_color?: string;
}

interface EmailSendResponse {
  id: string;
  from: string;
  to: string;
  created_at: string;
}

interface TwilioVerifyResponse {
  sid: string;
  account_sid: string;
  to: string;
  channel: string;
  status: string;
  date_created: string;
}

interface EmailSendResponse {
  id: string;
  from: string;
  to: string;
  created_at: string;
}

interface TwilioVerifyResponse {
  sid: string;
  account_sid: string;
  to: string;
  channel: string;
  status: string;
  date_created: string;
}

serve(async (req: Request) => {
  const options = handleOptions(req);
  if (options) return options;

  try {
    if (req.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    const rawBody = await req.json();

    if (rawBody?.mode === "admin_blast") {
      const service = createServiceClient();
      return await handleAdminAnnouncementBlast(
        service,
        rawBody as AdminBlastPayload,
        req,
      );
    }

    const payload: NotificationPayload = rawBody;

    if (
      !payload.tenantId ||
      !payload.templateName ||
      !payload.channel
    ) {
      return jsonResponse({ error: "Missing required fields" }, 400);
    }

    const service = createServiceClient();

    if (payload.templateName === EMAIL_TEMPLATE_NAMES.ENROLMENT_AGE_REVIEW_REQUESTED) {
      return await handleAgeReviewRequestedNotification(service, payload, req);
    }

    const auth = await requireAuthUser(req);
    if ("error" in auth) {
      return jsonResponse({ error: auth.error }, auth.status);
    }

    const { data: profile, error: profileError } = await service
      .from("user_profiles")
      .select("tenant_id, role")
      .eq("id", auth.user.id)
      .single();

    if (profileError || !profile?.tenant_id) {
      return jsonResponse({ error: "User profile not found" }, 403);
    }

    const roles = (profile.role ?? []) as string[];
    const canSend =
      roles.includes("tenant_admin") ||
      roles.includes("staff") ||
      roles.includes("super_admin");

    if (!canSend) {
      return jsonResponse({ error: "Not authorized to send notifications" }, 403);
    }

    if (payload.tenantId !== profile.tenant_id) {
      return jsonResponse({ error: "Tenant mismatch" }, 403);
    }

    // Validate recipient contact info
    if (
      !payload.recipientEmail &&
      !payload.recipientPhone &&
      !payload.recipientId
    ) {
      return jsonResponse(
        {
          error: "Must provide recipientEmail, recipientPhone, or recipientId",
        },
        400,
      );
    }

    const resendApiKey = Deno.env.get("RESEND_API_KEY")!;
    const twilioAccountSid = Deno.env.get("TWILIO_ACCOUNT_SID")!;
    const twilioAuthToken = Deno.env.get("TWILIO_AUTH_TOKEN")!;
    const twilioPhoneNumber = Deno.env.get("TWILIO_PHONE_NUMBER")!;

    const supabase = service;

    let externalMsgId: string | undefined;
    let status: "sent" | "failed" = "sent";
    let failureReason: string | undefined;

    // Route by channel
    if (payload.channel === "email") {
      if (!payload.recipientEmail) {
        failureReason = "No email address provided";
        status = "failed";
      } else {
        // Send via Resend
        try {
          const tenantConfig = await getTenantConfig(supabase, payload.tenantId);

          console.log(
            `[EMAIL] Sending ${payload.templateName} to ${payload.recipientEmail} (tenant: ${tenantConfig.name})`,
          );

          const fromEmail =
            Deno.env.get("NOTIFICATION_FROM_EMAIL") ??
            "Manage Studio <noreply@manage-studio.app>";

          if (!isSupportedEmailTemplate(payload.templateName)) {
            failureReason = `Unsupported email template: ${payload.templateName}`;
            status = "failed";
          } else {
            const tenant = await getTenantEmailConfig(
              supabase,
              payload.tenantId,
            );
            const language = tenant.language;
            const overrides = await getEmailTemplateOverrides(
              supabase,
              payload.tenantId,
              payload.templateName,
              language,
            );

            const variables = (payload.variables ?? {}) as Record<
              string,
              unknown
            >;

            const result = await sendRenderedEmail({
              to: payload.recipientEmail,
              from: fromEmail,
              subject:
                typeof variables.subject === "string"
                  ? variables.subject
                  : undefined,
              renderInput: {
                templateName: payload.templateName,
                language,
                schoolName: tenant.name,
                tenantColors: {
                  primary_color: tenant.primary_color,
                  accent_color: tenant.accent_color,
                },
                stringOverrides: overrides,
                variables,
              },
            });

            externalMsgId = result.id;
            status = "sent";
          }
        } catch (error) {
          failureReason = error instanceof Error ? error.message : "Unknown error";
          status = "failed";
        }
      }
    } else if (payload.channel === "whatsapp") {
      if (!payload.recipientPhone) {
        failureReason = "No phone number provided";
        status = "failed";
      } else {
        // Send via Twilio Verify or WhatsApp Business API
        try {
          const templateSid = await getTemplateSid(
            supabase,
            payload.tenantId,
            "whatsapp",
            payload.templateName
          );

          if (!templateSid) {
            failureReason = `Template ${payload.templateName} not found or not approved`;
            status = "failed";
          } else {
            // Call Twilio API to send WhatsApp message
            const authString = btoa(`${twilioAccountSid}:${twilioAuthToken}`);
            const whatsappResponse = await fetch(
              `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`,
              {
                method: "POST",
                headers: {
                  "Authorization": `Basic ${authString}`,
                  "Content-Type": "application/x-www-form-urlencoded",
                },
                body: new URLSearchParams({
                  "From": twilioPhoneNumber,
                  "To": payload.recipientPhone,
                  "ContentSid": templateSid,
                  // Add variables if needed
                }).toString(),
              }
            );

            if (!whatsappResponse.ok) {
              const error = await whatsappResponse.json();
              failureReason = error.message || "WhatsApp send failed";
              status = "failed";
            } else {
              const result = await whatsappResponse.json();
              externalMsgId = result.sid;
              status = "sent";
            }
          }
        } catch (error) {
          failureReason = error instanceof Error ? error.message : "Unknown error";
          status = "failed";
        }
      }
    } else if (payload.channel === "voice") {
      // Future: voice call implementation
      failureReason = "Voice channel not yet implemented";
      status = "failed";
    }

    // Log notification attempt
    try {
      await supabase.from("notification_log").insert({
        tenant_id: payload.tenantId,
        recipient_person_id:
          payload.recipientType === "person" ? payload.recipientId : null,
        recipient_family_member_id:
          payload.recipientType === "family_member" ? payload.recipientId : null,
        recipient_email: payload.recipientEmail,
        recipient_phone: payload.recipientPhone,
        channel: payload.channel,
        template_name: payload.templateName,
        variables: payload.variables,
        external_msg_id: externalMsgId,
        status: status,
        failure_reason: failureReason,
        sent_at: new Date().toISOString(),
      });
    } catch (logError) {
      console.error("Failed to log notification:", logError);
      // Don't fail the response if logging fails
    }

    return jsonResponse(
      {
        success: status === "sent",
        externalMsgId,
        status,
        failureReason,
      },
      status === "sent" ? 200 : 400,
    );
  } catch (error) {
    console.error("Notification error:", error);
    return jsonResponse(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});

/**
 * Helper: Get tenant configuration for email sending
 * Loads colors and language from tenants table
 * Computes locale and direction from language_default
 * Returns defaults if tenant not found
 */
async function getTenantConfig(
  supabase: SupabaseClient,
  tenantId: string
): Promise<TenantConfig> {
  try {
    const { data, error } = await supabase
      .from("tenants")
      .select('*')
      .eq("id", tenantId)
      .single();

    if (error || !data) {
      console.warn(`Tenant ${tenantId} not found, using defaults`);
      return {
        id: tenantId,
        name: "School",
        locale: "en",
        dir: "ltr",
        primary_color: "#2563eb",
        accent_color: "#dc2626",
      };
    }

    // Compute locale and dir from language_default (they are no longer stored)
    const language_default = data.language_default || "en";
    const country = data.country || "IL";
    const locale = language_default === "he" ? `he-${country}` : `en-${country}`;
    const dir = language_default === "he" ? "rtl" : "ltr";

    return {
      id: data.id,
      name: data.name,
      locale,
      dir,
      primary_color: data.primary_color || "#2563eb",
      accent_color: data.accent_color || "#dc2626",
    };
  } catch (error) {
    console.error("Error fetching tenant config:", error);
    // Fail safe: return defaults if DB is down
    return {
      id: tenantId,
      name: "School",
      locale: "en",
      dir: "ltr",
      primary_color: "#2563eb",
      accent_color: "#dc2626",
    };
  }
}

/**
 * Helper: Get email template overrides from DB
 * Returns null if no overrides exist (fail safe: use code defaults)
 */
async function getEmailTemplateOverrides(
  supabase: SupabaseClient,
  tenantId: string,
  templateName: string,
  language: string
): Promise<Record<string, unknown> | null> {
  try {
    const { data, error } = await supabase
      .from("tenant_email_customizations")
      .select("overrides")
      .eq("tenant_id", tenantId)
      .eq("template_name", templateName)
      .eq("language", language)
      .single();

    if (error || !data) {
      // No overrides found — return null to use code defaults
      return null;
    }

    return data.overrides as Record<string, unknown>;
  } catch (error) {
    console.warn(
      `Could not fetch email overrides for ${templateName}/${language}:`,
      error
    );
    // Fail safe: return null, use code defaults
    return null;
  }
}

/**
 * Helper: Merge base email strings with tenant overrides
 * Code-first approach: base + overrides (overrides win)
 */
function mergeTemplateStrings(
  baseStrings: Record<string, unknown>,
  overrides: Record<string, unknown> | null
): Record<string, unknown> {
  if (!overrides || Object.keys(overrides).length === 0) {
    return baseStrings;
  }

  // Deep merge: overrides on top of base
  return deepMergeObjects(baseStrings, overrides);
}

/**
 * Helper: Deep merge two objects (recursive)
 */
function deepMergeObjects(
  target: Record<string, unknown>,
  source: Record<string, unknown>
): Record<string, unknown> {
  const result = { ...target };

  for (const key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      const sourceValue = source[key];

      if (
        sourceValue !== null &&
        typeof sourceValue === "object" &&
        !Array.isArray(sourceValue) &&
        result[key] !== null &&
        typeof result[key] === "object" &&
        !Array.isArray(result[key])
      ) {
        result[key] = deepMergeObjects(
          result[key] as Record<string, unknown>,
          sourceValue as Record<string, unknown>
        );
      } else {
        result[key] = sourceValue;
      }
    }
  }

  return result;
}

/**
 * Helper: Get template SID from tenant_notification_templates
 */
async function getTemplateSid(
  supabase: SupabaseClient,
  tenantId: string,
  channel: string,
  templateName: string
): Promise<string | null> {
  try {
    const { data } = await supabase
      .from("tenant_notification_templates")
      .select('*')
      .eq("tenant_id", tenantId)
      .eq("channel", channel)
      .eq("template_name", templateName)
      .eq("status", "approved")
      .single();

    if (channel === "whatsapp") {
      return data?.twilio_content_sid || null;
    } else if (channel === "email") {
      return data?.email_template_id || null;
    }
    return null;
  } catch {
    return null;
  }
}

function getAppBaseUrl(req: Request): string {
  const appUrl = Deno.env.get("APP_URL") ?? "";
  if (appUrl) return appUrl;
  const origin = req.headers.get("origin")?.trim();
  if (!origin) return "";
  try {
    return new URL(origin).origin;
  } catch {
    return "";
  }
}

async function handleAgeReviewRequestedNotification(
  service: SupabaseClient,
  payload: NotificationPayload,
  req: Request,
): Promise<Response> {
  if (payload.channel !== "email") {
    return jsonResponse({ error: "Age review requested notifications support email only" }, 400);
  }

  const variables = payload.variables ?? {};
  const engagementId = typeof variables.engagementId === "string" ? variables.engagementId : "";
  if (!engagementId) {
    return jsonResponse({ error: "engagementId is required" }, 400);
  }

  const { data: engagement, error: engagementError } = await service
    .from("engagements")
    .select("id, tenant_id, status, created_at")
    .eq("id", engagementId)
    .eq("tenant_id", payload.tenantId)
    .maybeSingle();

  if (engagementError || !engagement) {
    return jsonResponse({ error: "Engagement not found" }, 404);
  }

  if (engagement.status !== "admin_review") {
    return jsonResponse({ error: "Engagement is not pending age review" }, 409);
  }

  const createdAt = new Date(engagement.created_at as string).getTime();
  if (Date.now() - createdAt > 15 * 60 * 1000) {
    return jsonResponse({ error: "Review notification window expired" }, 409);
  }

  const { data: admins } = await service
    .from("user_profiles")
    .select("email, role")
    .eq("tenant_id", payload.tenantId)
    .not("email", "is", null);

  const adminEmails = (admins ?? [])
    .filter((row) => {
      const roles = Array.isArray(row.role) ? row.role as string[] : [];
      return roles.includes("tenant_admin") || roles.includes("super_admin");
    })
    .map((row) => (row.email as string).trim().toLowerCase())
    .filter(Boolean);

  if (adminEmails.length === 0) {
    return jsonResponse({ error: "No admin recipients configured" }, 400);
  }

  const appBaseUrl = getAppBaseUrl(req);
  const reviewUrl = appBaseUrl
    ? `${appBaseUrl}/admin/students?engagement=${encodeURIComponent(engagementId)}`
    : String(variables.reviewUrl ?? "#");

  const tenant = await getTenantEmailConfig(service, payload.tenantId);
  const language = tenant.language;
  const overrides = await getEmailTemplateOverrides(
    service,
    payload.tenantId,
    payload.templateName,
    language,
  );

  const fromEmail =
    Deno.env.get("NOTIFICATION_FROM_EMAIL") ??
    "Manage Studio <noreply@manage-studio.app>";

  let sentCount = 0;
  let lastExternalId: string | undefined;
  let failureReason: string | undefined;

  for (const recipientEmail of adminEmails) {
    try {
      const result = await sendRenderedEmail({
        to: recipientEmail,
        from: fromEmail,
        renderInput: {
          templateName: EMAIL_TEMPLATE_NAMES.ENROLMENT_AGE_REVIEW_REQUESTED,
          language,
          schoolName: tenant.name,
          tenantColors: {
            primary_color: tenant.primary_color,
            accent_color: tenant.accent_color,
          },
          stringOverrides: overrides,
          variables: {
            ...variables,
            reviewUrl,
          },
        },
      });
      lastExternalId = result.id;
      sentCount += 1;
    } catch (error) {
      failureReason = error instanceof Error ? error.message : "Unknown error";
    }
  }

  try {
    await service.from("notification_log").insert({
      tenant_id: payload.tenantId,
      recipient_email: adminEmails.join(","),
      channel: "email",
      template_name: payload.templateName,
      variables: { ...variables, reviewUrl, adminRecipientCount: adminEmails.length },
      external_msg_id: lastExternalId,
      status: sentCount > 0 ? "sent" : "failed",
      failure_reason: sentCount > 0 ? null : failureReason,
      sent_at: new Date().toISOString(),
    });
  } catch (logError) {
    console.error("Failed to log age review notification:", logError);
  }

  if (sentCount === 0) {
    return jsonResponse({ success: false, status: "failed", failureReason }, 400);
  }

  return jsonResponse({
    success: true,
    status: "sent",
    externalMsgId: lastExternalId,
    sentCount,
  });
}

async function handleAdminAnnouncementBlast(
  service: SupabaseClient,
  payload: AdminBlastPayload,
  _req: Request,
): Promise<Response> {
  const auth = await requireAuthUser(_req);
  if ("error" in auth) {
    return jsonResponse({ error: auth.error }, auth.status);
  }

  const { data: profile, error: profileError } = await service
    .from("user_profiles")
    .select("tenant_id, role")
    .eq("id", auth.user.id)
    .single();

  if (profileError || !profile?.tenant_id) {
    return jsonResponse({ error: "User profile not found" }, 403);
  }

  const roles = (profile.role ?? []) as string[];
  const canBlast =
    roles.includes("tenant_admin") || roles.includes("super_admin");

  if (!canBlast) {
    return jsonResponse({ error: "Not authorized to send notification blasts" }, 403);
  }

  if (payload.tenantId !== profile.tenant_id) {
    return jsonResponse({ error: "Tenant mismatch" }, 403);
  }

  const subject = payload.subject?.trim() ?? "";
  const body = payload.body?.trim() ?? "";

  if (subject.length < 1 || subject.length > 200) {
    return jsonResponse({ error: "Subject must be 1–200 characters" }, 400);
  }

  if (body.length < 10 || body.length > 5000) {
    return jsonResponse({ error: "Body must be 10–5000 characters" }, 400);
  }

  if (payload.scope === "level" && !payload.categoryId) {
    return jsonResponse({ error: "categoryId required for level scope" }, 400);
  }

  if (payload.scope === "class" && !payload.offeringId) {
    return jsonResponse({ error: "offeringId required for class scope" }, 400);
  }

  if (payload.scope === "account" && !payload.accountId) {
    return jsonResponse({ error: "accountId required for account scope" }, 400);
  }

  const recipientQuery = payload.recipientQuery?.trim() ?? "";

  const { data: recipients, error: resolveError } = await service.rpc(
    "resolve_notification_blast_recipients",
    {
      p_tenant_id: payload.tenantId,
      p_scope: payload.scope,
      p_category_id: payload.scope === "level" ? payload.categoryId : null,
      p_offering_id: payload.scope === "class" ? payload.offeringId : null,
      p_account_id: payload.scope === "account" ? payload.accountId : null,
      p_recipient_query: recipientQuery || null,
    },
  );

  if (resolveError) {
    return jsonResponse({ error: resolveError.message }, 400);
  }

  let rows = (recipients ?? []) as BlastRecipientRow[];

  if (payload.selectedPersonIds !== undefined) {
    if (!Array.isArray(payload.selectedPersonIds)) {
      return jsonResponse({ error: "selectedPersonIds must be an array" }, 400);
    }

    const selectedSet = new Set(
      payload.selectedPersonIds.filter(
        (id): id is string => typeof id === "string" && id.length > 0,
      ),
    );

    if (selectedSet.size === 0) {
      return jsonResponse({ error: "No recipients selected" }, 400);
    }

    const resolvedIds = new Set(rows.map((row) => row.person_id));
    for (const id of selectedSet) {
      if (!resolvedIds.has(id)) {
        return jsonResponse({ error: "Invalid recipient selection" }, 400);
      }
    }

    rows = rows.filter((row) => selectedSet.has(row.person_id));
  }

  if (rows.length > 500) {
    return jsonResponse({ error: "Too many recipients (max 500)" }, 400);
  }

  if (rows.length === 0) {
    return jsonResponse({ error: "No eligible recipients" }, 400);
  }

  const tenant = await getTenantEmailConfig(service, payload.tenantId);
  const language = tenant.language;
  const overrides = await getEmailTemplateOverrides(
    service,
    payload.tenantId,
    EMAIL_TEMPLATE_NAMES.ADMIN_ANNOUNCEMENT,
    language,
  );

  const fromEmail =
    Deno.env.get("NOTIFICATION_FROM_EMAIL") ??
    "Manage Studio <noreply@manage-studio.app>";

  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const row of rows) {
    let externalMsgId: string | null = null;
    let status: "sent" | "failed" = "sent";
    let failureReason: string | null = null;

    try {
      const result = await sendRenderedEmail({
        to: row.recipient_email,
        from: fromEmail,
        subject,
        renderInput: {
          templateName: EMAIL_TEMPLATE_NAMES.ADMIN_ANNOUNCEMENT,
          language,
          schoolName: tenant.name,
          tenantColors: {
            primary_color: tenant.primary_color,
            accent_color: tenant.accent_color,
          },
          stringOverrides: overrides,
          variables: {
            subject,
            body,
            recipientName: row.recipient_name ?? undefined,
          },
        },
      });
      externalMsgId = result.id;
      sent += 1;
    } catch (error) {
      status = "failed";
      failureReason = error instanceof Error ? error.message : "Unknown error";
      failed += 1;
      if (errors.length < 10) {
        errors.push(`${row.recipient_email}: ${failureReason}`);
      }
    }

    try {
      await service.from("notification_log").insert({
        tenant_id: payload.tenantId,
        recipient_person_id: row.person_id,
        recipient_account_member_id: row.account_member_id,
        recipient_email: row.recipient_email,
        channel: "email",
        template_name: EMAIL_TEMPLATE_NAMES.ADMIN_ANNOUNCEMENT,
        subject,
        body_preview: body.slice(0, 200),
        variables: { subject, body },
        external_msg_id: externalMsgId,
        status,
        failure_reason: failureReason,
        sent_at: new Date().toISOString(),
      });
    } catch (logError) {
      console.error("Failed to log notification blast:", logError);
    }
  }

  return jsonResponse({
    sent,
    failed,
    total: rows.length,
    ...(errors.length > 0 ? { errors } : {}),
  });
}

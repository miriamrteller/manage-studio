import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import {
  isSupportedEmailTemplate,
  sendRenderedEmail,
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

    const payload: NotificationPayload = await req.json();

    // Validate required fields
    if (
      !payload.tenantId ||
      !payload.templateName ||
      !payload.channel
    ) {
      return jsonResponse({ error: "Missing required fields" }, 400);
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

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY")!;
    const twilioAccountSid = Deno.env.get("TWILIO_ACCOUNT_SID")!;
    const twilioAuthToken = Deno.env.get("TWILIO_AUTH_TOKEN")!;
    const twilioPhoneNumber = Deno.env.get("TWILIO_PHONE_NUMBER")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

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
  supabase: ReturnType<typeof createClient>,
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
  supabase: ReturnType<typeof createClient>,
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
  supabase: ReturnType<typeof createClient>,
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

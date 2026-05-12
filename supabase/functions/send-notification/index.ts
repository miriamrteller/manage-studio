import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

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
  // CORS headers
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
      },
    });
  }

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json" },
      });
    }

    const payload: NotificationPayload = await req.json();

    // Validate required fields
    if (
      !payload.tenantId ||
      !payload.templateName ||
      !payload.channel
    ) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Validate recipient contact info
    if (
      !payload.recipientEmail &&
      !payload.recipientPhone &&
      !payload.recipientId
    ) {
      return new Response(
        JSON.stringify({
          error: "Must provide recipientEmail, recipientPhone, or recipientId",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
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
          const emailResponse = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${resendApiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: "noreply@manage-studio.app",
              to: payload.recipientEmail,
              subject: payload.variables?.["subject"] || payload.templateName,
              html: payload.variables?.["html"] || "",
              // In production, render template with variables
            }),
          });

          if (!emailResponse.ok) {
            const error = await emailResponse.json();
            failureReason = error.message || "Email send failed";
            status = "failed";
          } else {
            const result: EmailSendResponse = await emailResponse.json();
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

    return new Response(
      JSON.stringify({
        success: status === "sent",
        externalMsgId,
        status,
        failureReason,
      }),
      {
        status: status === "sent" ? 200 : 400,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Notification error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});

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
      .select("twilio_content_sid,email_template_id")
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

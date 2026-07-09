import "@supabase/functions-js/edge-runtime.d.ts";
import {
  EMAIL_TEMPLATE_NAMES,
  sendRenderedEmail,
} from "../_shared/resend-send.ts";
import { createServiceClient } from "../../packages/edge-runtime/src/supabase.ts";
import {
  getEmailTemplateOverrides,
  getTenantEmailConfig,
} from "../_shared/tenant-email.ts";

interface SendOtpEmailRequest {
  email: string;
  code: string;
  expiryMinutes?: number;
  tenantId?: string;
  recipientName?: string;
  /** @deprecated Use email */
  recipient_email?: string;
  /** @deprecated Use code */
  otp_code?: string;
  /** @deprecated Use recipientName */
  recipient_name?: string;
}

const DEFAULT_TENANT_ID =
  Deno.env.get("DEFAULT_TENANT_ID") ?? "00000000-0000-0000-0000-000000000001";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const body = (await req.json()) as SendOtpEmailRequest;

    const email = body.email ?? body.recipient_email;
    const code = body.code ?? body.otp_code;
    const recipientName = body.recipientName ?? body.recipient_name;
    const expiryMinutes = body.expiryMinutes ?? 10;
    const tenantId = body.tenantId ?? DEFAULT_TENANT_ID;

    if (!email || !code) {
      return new Response(
        JSON.stringify({ error: "email and code are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const fromEmail = Deno.env.get("NOTIFICATION_FROM_EMAIL");
    if (!fromEmail) {
      throw new Error("NOTIFICATION_FROM_EMAIL is not configured");
    }

    const supabase = createServiceClient();
    const tenant = await getTenantEmailConfig(supabase, tenantId);
    const overrides = await getEmailTemplateOverrides(
      supabase,
      tenant.id,
      EMAIL_TEMPLATE_NAMES.OTP,
      tenant.language,
    );

    const result = await sendRenderedEmail({
      to: email,
      from: fromEmail,
      renderInput: {
        templateName: EMAIL_TEMPLATE_NAMES.OTP,
        language: tenant.language,
        schoolName: tenant.name,
        tenantColors: {
          primary_color: tenant.primary_color,
          accent_color: tenant.accent_color,
        },
        stringOverrides: overrides,
        variables: {
          otpCode: code,
          code,
          expiresInMinutes: expiryMinutes,
          expiryMinutes,
          recipientName,
          usageContext: "email_verification",
        },
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        messageId: result.id,
        expiresInMinutes: expiryMinutes,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error sending OTP email:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

import "@supabase/functions-js/edge-runtime.d.ts";
import {
  EMAIL_TEMPLATE_NAMES,
  sendRenderedEmail,
} from "../_shared/email-send.ts";
import { createServiceClient } from "../_shared/edge-runtime/supabase.ts";
import {
  checkAndIncrementAttempt,
  normaliseContactPoint,
} from "../_shared/rate-limit.ts";
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

/** Whole seconds until the block lifts, floored at 1 so Retry-After is never 0. */
function retryAfterSeconds(blockedUntil: string): number {
  const seconds = Math.ceil((new Date(blockedUntil).getTime() - Date.now()) / 1000);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : 1;
}

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

    // Before anything that costs an email. This endpoint needs only the
    // publishable key, so without a limit it is an open send endpoint on the
    // platform's own quota and sending reputation. Keyed on the address, so
    // omitting tenantId to fall back to DEFAULT_TENANT_ID does not widen it.
    const limit = await checkAndIncrementAttempt(
      supabase,
      tenantId,
      normaliseContactPoint(email),
      "email",
    );
    if (!limit.allowed) {
      // 429 for a genuine limit, 503 when the limiter itself could not run —
      // the caller should back off in both cases, but they are not the same
      // event and collapsing them hides a broken limiter.
      const rateLimited = limit.reason === "rate_limited";
      return new Response(
        JSON.stringify({
          success: false,
          error: rateLimited ? "rate_limited" : "rate_limit_unavailable",
          message: limit.message,
          ...(limit.blockedUntil ? { blocked_until: limit.blockedUntil } : {}),
        }),
        {
          status: rateLimited ? 429 : 503,
          headers: {
            "Content-Type": "application/json",
            ...(limit.blockedUntil
              ? { "Retry-After": String(retryAfterSeconds(limit.blockedUntil)) }
              : {}),
          },
        },
      );
    }

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

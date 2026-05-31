import "@supabase/functions-js/edge-runtime.d.ts";
import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";
import { sendHtmlEmail } from "../_shared/resend-client.ts";

const MAGIC_LINK_TEMPLATE = "magic_link";
import { renderAuthMagicLinkHtml } from "../_shared/render-auth-email.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import {
  getEmailTemplateOverrides,
  getTenantForAuthUser,
} from "../_shared/tenant-email.ts";

interface AuthEmailHookUser {
  email: string;
  user_metadata?: Record<string, unknown>;
}

interface AuthEmailHookData {
  token: string;
  token_hash: string;
  redirect_to: string;
  email_action_type: string;
  site_url: string;
}

interface AuthEmailHookPayload {
  user: AuthEmailHookUser;
  email_data: AuthEmailHookData;
}

const AUTH_EMAIL_ACTIONS = new Set([
  "signup",
  "magiclink",
  "recovery",
  "invite",
  "email_change",
]);

function buildConfirmationUrl(
  supabaseUrl: string,
  emailData: AuthEmailHookData,
): string {
  const base = new URL("/auth/v1/verify", supabaseUrl);
  base.searchParams.set("token", emailData.token_hash);
  base.searchParams.set("type", emailData.email_action_type);
  if (emailData.redirect_to) {
    base.searchParams.set("redirect_to", emailData.redirect_to);
  }
  return base.toString();
}

function subjectForAction(
  action: string,
  schoolName: string,
  strings: Record<string, unknown>,
): string {
  if (action === "magiclink" || action === "signup") {
    const template = String(strings.subject || strings.preview || "Sign in to {schoolName}");
    return template.replace("{schoolName}", schoolName);
  }
  if (action === "recovery") {
    return `Reset your password — ${schoolName}`;
  }
  if (action === "invite") {
    return `You've been invited to ${schoolName}`;
  }
  if (action === "email_change") {
    return `Confirm your email change — ${schoolName}`;
  }
  return `Notification from ${schoolName}`;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const hookSecretRaw = Deno.env.get("SEND_EMAIL_HOOK_SECRET")?.trim().replace(
    /^["']|["']$/g,
    "",
  );
  if (!hookSecretRaw) {
    console.error(
      "SEND_EMAIL_HOOK_SECRET is not configured on the project (supabase secrets set)",
    );
    return new Response(JSON.stringify({ error: "Hook secret missing" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Supabase provides v1,whsec_<base64> — library expects whsec_<base64> or raw base64.
  const hookSecret = hookSecretRaw.startsWith("v1,whsec_")
    ? hookSecretRaw.replace(/^v1,whsec_/, "whsec_")
    : hookSecretRaw.startsWith("whsec_")
    ? hookSecretRaw
    : `whsec_${hookSecretRaw}`;
  const wh = new Webhook(hookSecret);

  try {
    const payload = await req.text();
    // Collect all headers (Supabase Auth sends webhook-id, webhook-timestamp, webhook-signature).
    const headers: Record<string, string> = {};
    req.headers.forEach((value, key) => {
      headers[key] = value;
    });

    if (!headers["webhook-signature"] && !headers["Webhook-Signature"]) {
      console.error(
        "send-auth-email: missing webhook-signature — request is not from Auth hook (curl/tests omit it)",
      );
      return new Response(JSON.stringify({ error: "Missing required headers" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const verified = wh.verify(payload, headers) as AuthEmailHookPayload;

    const { user, email_data: emailData } = verified;
    const action = emailData.email_action_type;

    if (!AUTH_EMAIL_ACTIONS.has(action)) {
      console.warn(`Unhandled auth email action: ${action}`);
      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const fromEmail = Deno.env.get("NOTIFICATION_FROM_EMAIL");
    if (!fromEmail) {
      throw new Error("NOTIFICATION_FROM_EMAIL is not configured");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    if (!supabaseUrl) {
      throw new Error("SUPABASE_URL is not configured");
    }

    const supabase = createServiceClient();
    const tenant = await getTenantForAuthUser(supabase, user);
    const overrides = await getEmailTemplateOverrides(
      supabase,
      tenant.id,
      MAGIC_LINK_TEMPLATE,
      tenant.language,
    );

    const confirmationUrl = buildConfirmationUrl(supabaseUrl, emailData);
    const strings = overrides ?? {};

    const otpCode = emailData.token || undefined;
    const html = renderAuthMagicLinkHtml({
      language: tenant.language,
      schoolName: tenant.name,
      magicLinkUrl: confirmationUrl,
      otpCode,
      primaryColor: tenant.primary_color,
      accentColor: tenant.accent_color,
    });

    await sendHtmlEmail({
      to: user.email,
      from: fromEmail,
      subject: subjectForAction(action, tenant.name, strings),
      html,
    });

    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Hook failed";
    const errorName = error instanceof Error ? error.name : "Error";

    if (errorName === "WebhookVerificationError") {
      console.error(
        "send-auth-email: SEND_EMAIL_HOOK_SECRET does not match Auth → Hooks → Send Email. Regenerate secret in dashboard, update .env, run: pnpm secrets:email",
      );
    } else {
      console.error(`send-auth-email hook error [${errorName}]:`, message);
    }

    return new Response(JSON.stringify({ error: message, errorName }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

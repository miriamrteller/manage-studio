import "@supabase/functions-js/edge-runtime.d.ts";
import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";
import { sendHtmlEmail } from "../_shared/email-client.ts";

const MAGIC_LINK_TEMPLATE = "magic_link";
import { composeAuthEmail, composeLoginEmailChangedNotice } from "./compose.ts";
import { authEmailRecipients } from "./recipients.ts";
import { tenantBaseUrl } from "../_shared/tenant-url.ts";
import { createServiceClient } from "../_shared/edge-runtime/supabase.ts";
import {
  getEmailTemplateOverrides,
  getTenantForAuthUser,
} from "../_shared/tenant-email.ts";
import { withMonitoring } from "../_shared/monitoring.ts";

interface AuthEmailHookUser {
  email: string;
  /** Set during an email change: the address being changed to. */
  new_email?: string | null;
  user_metadata?: Record<string, unknown>;
}

interface AuthEmailHookData {
  token: string;
  token_hash: string;
  /** email_change with secure change on: see recipients.ts (the names are reversed). */
  token_new?: string;
  token_hash_new?: string;
  /** email_changed_notification: the address the login was changed from. */
  old_email?: string;
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
  "email_changed_notification",
]);

/**
 * Link straight to the app callback with token_hash so sign-in works from any
 * browser/device (Supabase /verify + PKCE requires the same browser that requested the code).
 */
function buildConfirmationUrl(emailData: AuthEmailHookData, tokenHash: string = emailData.token_hash): string {
  const redirectTo = emailData.redirect_to?.trim() || emailData.site_url?.trim();
  if (!redirectTo) {
    throw new Error("Missing redirect_to for auth email link");
  }

  const url = new URL(redirectTo);
  url.searchParams.delete("login_method");
  url.searchParams.set("token_hash", tokenHash);
  url.searchParams.set("type", emailData.email_action_type);
  return url.toString();
}

/**
 * Every sign-in email carries the 6-digit code as well as the button, so someone who opens the
 * email on another device (where the one-time link may not work) can type the code instead.
 * Nothing to include when Auth sent no code (it always does for OTP and magic-link sign-in).
 */
function shouldIncludeOtpInEmail(emailData: AuthEmailHookData): boolean {
  return Boolean(emailData.token?.trim());
}

/** The studio's address for the welcome email; null falls back to the plain invite. */
function studioUrlFor(subdomain: string): string | null {
  if (!subdomain) return null;
  try {
    return tenantBaseUrl(subdomain);
  } catch (error) {
    console.warn("send-auth-email: cannot build the studio address:", error);
    return null;
  }
}

Deno.serve(withMonitoring("send-auth-email", async (req) => {
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
    // The platform host's emails (no studio) have no studio customisations.
    const overrides = tenant.id
      ? await getEmailTemplateOverrides(supabase, tenant.id, MAGIC_LINK_TEMPLATE, tenant.language)
      : null;

    const strings = overrides ?? {};

    // One email for most actions; an email change can need two (both addresses confirm),
    // and the "login email changed" notice goes to the old address.
    for (const planned of authEmailRecipients(user, emailData)) {
      const message = action === "email_changed_notification"
        ? composeLoginEmailChangedNotice({ tenant, newEmail: user.email })
        : composeAuthEmail({
          action,
          tenant,
          confirmationUrl: buildConfirmationUrl(emailData, planned.tokenHash),
          otpCode: shouldIncludeOtpInEmail(emailData) ? planned.token : undefined,
          strings,
          studioUrl: studioUrlFor(tenant.subdomain),
        });

      await sendHtmlEmail({
        to: planned.to,
        from: fromEmail,
        subject: message.subject,
        html: message.html,
        replyTo: message.replyTo,
      });
    }

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
}));

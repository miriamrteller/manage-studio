/**
 * Cloudflare Email Sending client.
 *
 * Replaces the Resend client. Both domains already live on Cloudflare — DNS and
 * inbound Email Routing — so outbound here consolidates the whole email path,
 * and `wrangler email sending enable <domain>` onboards a domain AND writes its
 * DNS, which is what makes per-tenant branded senders a one-command job rather
 * than a manual DKIM chore per studio.
 *
 * This runs in Supabase Edge Functions (Deno), NOT in a Cloudflare Worker, so it
 * uses the REST API rather than the `send_email` binding.
 *
 * The REST field names differ from the Workers binding in ways that fail
 * silently if you assume:
 *   from     → { address, name }   (Workers uses `email`)
 *   reply_to → snake_case          (Workers uses `replyTo`)
 *
 * The sending domain must be onboarded first:
 *   npx wrangler email sending enable opalswift.com
 * Sending from an un-onboarded domain returns "Sender domain not verified".
 */
import { getEnv } from "./edge-runtime/env.ts";

export interface SendEmailResult {
  /**
   * Cloudflare returns no provider-side message id — it reports per-recipient
   * delivery instead. Kept in the shape so callers that persist
   * notification_log.external_msg_id keep compiling; it is always null.
   * The delivery arrays below are the useful signal.
   */
  id: string | null;
  delivered: string[];
  queued: string[];
  permanentBounces: string[];
}

/**
 * Minimal HTML→text fallback for the plain-text part.
 *
 * Cloudflare's deliverability guidance is explicit that a message with no text
 * part scores worse with spam filters, and some clients show nothing at all.
 * The Resend client never sent one — this closes that gap without pulling in a
 * converter, since our templates are simple generated markup.
 */
function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|h[1-6]|li)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .trim();
}

/** Split "Name <addr@host>" into Cloudflare's object form. */
function parseAddress(value: string): { address: string; name?: string } {
  const m = value.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (m && m[2]) {
    const name = m[1].replace(/^["']|["']$/g, "").trim();
    return name ? { address: m[2].trim(), name } : { address: m[2].trim() };
  }
  return { address: value.trim() };
}

/**
 * Resend transport (fallback). Same result shape as the Cloudflare path so
 * callers are transport-agnostic; Resend does return a message id.
 */
async function sendViaResend(
  apiKey: string,
  options: { to: string; from: string; subject: string; html: string; replyTo?: string; text?: string },
): Promise<SendEmailResult> {
  const body: Record<string, unknown> = {
    from: options.from,
    to: [options.to],
    subject: options.subject,
    html: options.html,
    text: options.text ?? htmlToText(options.html),
  };
  if (options.replyTo) body.reply_to = options.replyTo;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      `Resend send failed — HTTP ${response.status}: ${data?.message ?? data?.name ?? "unknown"}`,
    );
  }
  return {
    id: typeof data?.id === "string" ? data.id : null,
    delivered: [options.to],
    queued: [],
    permanentBounces: [],
  };
}

export async function sendHtmlEmail(options: {
  to: string;
  from: string;
  subject: string;
  html: string;
  /** Studio's real inbox — see _shared/notification-from.ts. */
  replyTo?: string;
  /** Override the derived plain-text part. */
  text?: string;
}): Promise<SendEmailResult> {
  // Transport selection. Both pipes stay wired; EMAIL_TRANSPORT flips between
  // them without touching credentials:
  //   resend      — force Resend (launch: free tier, opalswift.com verified
  //                 in Resend, tenants send as <subdomain>@opalswift.com)
  //   cloudflare  — force Cloudflare Email Sending (requires Workers Paid;
  //                 the scale path, unlocks per-tenant branded domains)
  //   unset       — prefer Cloudflare when its two variables are set, else
  //                 fall back to Resend (pre-switch behaviour, unchanged)
  const transport = (getEnv("EMAIL_TRANSPORT") ?? "").trim().toLowerCase();
  const accountId = getEnv("CLOUDFLARE_ACCOUNT_ID")?.trim();
  const apiToken = getEnv("CLOUDFLARE_EMAIL_API_TOKEN")?.trim();
  const resendKey = getEnv("RESEND_API_KEY")?.trim();

  const useCloudflare = transport === "cloudflare"
    ? true
    : transport === "resend"
    ? false
    : Boolean(accountId && apiToken);

  if (!useCloudflare) {
    if (resendKey) {
      return sendViaResend(resendKey, options);
    }
    throw new Error(
      transport === "resend"
        ? "EMAIL_TRANSPORT=resend but RESEND_API_KEY is not set."
        : "Email transport not configured — set CLOUDFLARE_ACCOUNT_ID + " +
          "CLOUDFLARE_EMAIL_API_TOKEN, or RESEND_API_KEY.",
    );
  }
  if (!accountId || !apiToken) {
    throw new Error(
      "EMAIL_TRANSPORT=cloudflare but CLOUDFLARE_ACCOUNT_ID / " +
        "CLOUDFLARE_EMAIL_API_TOKEN are not set.",
    );
  }

  const body: Record<string, unknown> = {
    to: options.to,
    from: parseAddress(options.from),
    subject: options.subject,
    html: options.html,
    text: options.text ?? htmlToText(options.html),
  };
  if (options.replyTo) body.reply_to = parseAddress(options.replyTo);

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/email/sending/send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );

  const data = await response.json().catch(() => null);

  if (!response.ok || data?.success === false) {
    const detail = Array.isArray(data?.errors) && data.errors.length
      ? data.errors.map((e: { code?: number; message?: string }) =>
        `${e.code ?? "?"}: ${e.message ?? "unknown"}`
      ).join("; ")
      : `HTTP ${response.status}`;
    // 400/401 will never succeed on retry; 429/500 are worth retrying upstream.
    throw new Error(`Cloudflare Email send failed — ${detail}`);
  }

  const result = data?.result ?? {};
  const permanentBounces: string[] = result.permanent_bounces ?? [];

  if (permanentBounces.length > 0) {
    throw new Error(
      `Cloudflare Email permanently bounced: ${permanentBounces.join(", ")}`,
    );
  }

  return {
    id: null,
    delivered: result.delivered ?? [],
    queued: result.queued ?? [],
    permanentBounces,
  };
}
